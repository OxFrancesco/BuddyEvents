<script lang="ts">
  import { useQuery, useConvexClient } from "convex-svelte";
  import { api } from "@/convex/_generated/api";
  import ConnectWallet from "$lib/components/ConnectWallet.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import CardContent from "$lib/components/ui/CardContent.svelte";
  import CardHeader from "$lib/components/ui/CardHeader.svelte";
  import CardTitle from "$lib/components/ui/CardTitle.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import { getClerkContext } from "$lib/stores/clerk.svelte";
  import { getWalletContext } from "$lib/stores/wallet.svelte";

  type CheckInResult = {
    ok: boolean;
    status: "valid" | "not_found" | "unauthorized" | "inactive" | "already_checked_in";
    message: string;
    ticketId?: string;
    eventId?: string;
    buyerAddress?: string;
    checkedInAt?: number;
  };

  const clerkContext = getClerkContext();
  const walletContext = getWalletContext();
  const client = useConvexClient();

  const isSignedIn = $derived(Boolean(clerkContext.currentSession));
  const meQuery = useQuery(api.users.me, () => (isSignedIn ? {} : "skip"));
  const humanWalletQuery = useQuery(api.wallets.getByUserAndPurpose, () =>
    meQuery.data ? { userId: meQuery.data._id, purpose: "human_primary" as const } : "skip",
  );

  let qrCode = $state("");
  let result = $state<CheckInResult | null>(null);
  let loading = $state(false);

  const organizerAddress = $derived(humanWalletQuery.data?.walletAddress ?? walletContext.address);

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!organizerAddress || !isSignedIn || !qrCode.trim()) return;

    loading = true;
    result = null;
    try {
      const response = (await client.mutation(api.tickets.scanForCheckIn, {
        qrCode: qrCode.trim(),
        organizerAddress,
      })) as CheckInResult;
      result = response;
      if (response.ok) {
        qrCode = "";
      }
    } catch (error) {
      result = {
        ok: false,
        status: "inactive",
        message: error instanceof Error ? error.message : "Unable to validate ticket",
      };
    } finally {
      loading = false;
    }
  }
</script>

<main class="container mx-auto max-w-2xl px-4 py-8">
  <h1 class="mb-2 text-3xl font-black uppercase tracking-wide">Organizer Check-in</h1>
  <p class="mb-8 text-sm text-muted-foreground">
    Scan or paste a ticket QR code to validate entry. This marks valid tickets as checked-in.
  </p>

  <Card>
    <CardHeader>
      <CardTitle>Ticket Scanner</CardTitle>
    </CardHeader>
    <CardContent class="space-y-4">
      {#if !isSignedIn}
        <div class="space-y-3 text-sm">
          <p class="text-muted-foreground">Sign in with Clerk to validate tickets.</p>
          <Button class="w-full" disabled>Sign-in required</Button>
        </div>
      {:else if !organizerAddress}
        <div class="space-y-3 text-sm">
          <p class="text-muted-foreground">
            Connect the organizer signer wallet to provision or link your Crossmint wallet.
          </p>
          <ConnectWallet />
        </div>
      {:else}
        <form class="space-y-3" onsubmit={handleSubmit}>
          <Input bind:value={qrCode} placeholder="Paste scanned QR code value" />
          <Button class="w-full" disabled={loading || !qrCode.trim()} type="submit">
            {loading ? "Validating..." : "Validate Ticket"}
          </Button>
        </form>
      {/if}

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
          {#if result.buyerAddress}
            <p class="font-mono text-xs">Holder: {result.buyerAddress}</p>
          {/if}
          {#if result.ticketId}
            <p class="font-mono text-xs">Ticket: {result.ticketId}</p>
          {/if}
          {#if result.checkedInAt}
            <p class="font-mono text-xs">
              Checked in at: {new Date(result.checkedInAt).toLocaleString()}
            </p>
          {/if}
        </div>
      {/if}
    </CardContent>
  </Card>
</main>
