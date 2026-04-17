<script lang="ts">
  import Badge from "$lib/components/ui/Badge.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import CardContent from "$lib/components/ui/CardContent.svelte";
  import CardHeader from "$lib/components/ui/CardHeader.svelte";
  import CardTitle from "$lib/components/ui/CardTitle.svelte";
  import Input from "$lib/components/ui/Input.svelte";

  type CheckInResponse = {
    ok: boolean;
    status: "valid" | "invalid" | "expired" | "already_checked_in";
    message: string;
    ticketId?: string;
    eventId?: string;
    checkedInAt?: number;
    error?: string;
  };

  let token = $state("");
  let loading = $state(false);
  let result = $state<CheckInResponse | null>(null);

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!token.trim()) return;

    loading = true;
    result = null;
    try {
      const response = await fetch("/api/checkin/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });

      const payload = (await response.json()) as CheckInResponse;
      result = payload;
      if (response.ok && payload.ok) {
        token = "";
      }
    } catch (error) {
      result = {
        ok: false,
        status: "invalid",
        message: error instanceof Error ? error.message : "Unable to validate token",
      };
    } finally {
      loading = false;
    }
  }
</script>

<div class="container mx-auto max-w-2xl px-4 py-8">
  <div class="mb-6 flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-black uppercase tracking-widest">Admin Check-in</h1>
      <p class="text-sm text-muted-foreground">
        Validate QR token payloads and mark tickets as checked-in.
      </p>
    </div>
    <Button href="/admin/events" variant="outline">Admin Events</Button>
  </div>

  <Card>
    <CardHeader>
      <CardTitle>Scan or Paste QR Token</CardTitle>
    </CardHeader>
    <CardContent class="space-y-4">
      <form class="space-y-3" onsubmit={onSubmit}>
        <Input autocomplete="off" bind:value={token} placeholder="be_qr_..." />
        <Button class="w-full" disabled={loading || !token.trim()} type="submit">
          {loading ? "Validating..." : "Validate Check-in"}
        </Button>
      </form>

      {#if result}
        <div
          class={`border-2 p-4 text-sm ${
            result.ok ? "border-primary bg-primary/10" : "border-destructive bg-destructive/10"
          }`}
        >
          <div class="mb-2 flex items-center gap-2">
            <Badge variant={result.ok ? "default" : "destructive"}>{result.status}</Badge>
            <span class="font-bold">{result.message}</span>
          </div>
          {#if result.ticketId}
            <p class="font-mono text-xs">Ticket: {result.ticketId}</p>
          {/if}
          {#if result.eventId}
            <p class="font-mono text-xs">Event: {result.eventId}</p>
          {/if}
          {#if result.checkedInAt}
            <p class="font-mono text-xs">
              Checked in at: {new Date(result.checkedInAt).toLocaleString()}
            </p>
          {/if}
          {#if result.error}
            <p class="font-mono text-xs">{result.error}</p>
          {/if}
        </div>
      {/if}
    </CardContent>
  </Card>
</div>
