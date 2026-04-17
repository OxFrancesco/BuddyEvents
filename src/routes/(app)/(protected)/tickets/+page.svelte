<script lang="ts">
  import { useQuery } from "convex-svelte";
  import { api } from "@/convex/_generated/api";
  import { getChainLabel } from "@/lib/chains";
  import ConnectWallet from "$lib/components/ConnectWallet.svelte";
  import TicketQRCode from "$lib/components/TicketQRCode.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import CardContent from "$lib/components/ui/CardContent.svelte";
  import CardHeader from "$lib/components/ui/CardHeader.svelte";
  import CardTitle from "$lib/components/ui/CardTitle.svelte";
  import { getClerkContext } from "$lib/stores/clerk.svelte";

  const clerkContext = getClerkContext();
  const isSignedIn = $derived(Boolean(clerkContext.currentSession));

  const ticketsQuery = useQuery(api.tickets.listMine, () => (isSignedIn ? {} : "skip"));
  const eventIds = $derived(
    Array.from(new Set((ticketsQuery.data ?? []).map((ticket) => ticket.eventId))),
  );
  const eventsQuery = useQuery(api.events.getMany, () =>
    eventIds.length > 0 ? { ids: eventIds } : "skip",
  );
  const activeQrTokensQuery = useQuery(api.qr.listActiveByTickets, () =>
    ticketsQuery.data && ticketsQuery.data.length > 0
      ? { ticketIds: ticketsQuery.data.map((ticket) => ticket._id) }
      : "skip",
  );

  const eventsById = $derived(
    new Map((eventsQuery.data ?? []).map((event) => [event._id, event])),
  );
  const activeQrByTicketId = $derived(
    new Map((activeQrTokensQuery.data ?? []).map((qr) => [qr.ticketId, qr])),
  );

  function getTicketBadgeVariant(status: "active" | "listed" | "transferred" | "refunded") {
    switch (status) {
      case "active":
        return "default";
      case "listed":
        return "secondary";
      default:
        return "outline";
    }
  }
</script>

<main class="container mx-auto px-4 py-8">
  <h1 class="mb-2 text-3xl font-black uppercase tracking-wide">My Tickets</h1>
  <p class="mb-8 text-sm text-muted-foreground">
    Your purchased event tickets across Monad Testnet and Base Mainnet
  </p>

  {#if !isSignedIn}
    <div class="space-y-4 border-2 border-dashed border-foreground/30 py-24 text-center">
      <p class="text-muted-foreground">Sign in to see your tickets</p>
      <ConnectWallet />
    </div>
  {:else if ticketsQuery.isLoading || ticketsQuery.data === undefined}
    <div class="border-2 border-dashed border-foreground/30 py-24 text-center text-muted-foreground">
      Loading tickets...
    </div>
  {:else if ticketsQuery.data.length === 0}
    <div class="border-2 border-dashed border-foreground/30 py-24 text-center">
      <p class="mb-4 text-muted-foreground">No tickets yet.</p>
      <Button href="/events">Browse Events</Button>
    </div>
  {:else}
    <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {#each ticketsQuery.data as ticket (ticket._id)}
        {@const event = eventsById.get(ticket.eventId)}
        {@const activeQrToken = activeQrByTicketId.get(ticket._id)?.token}
        {@const qrValue = activeQrToken ?? ticket.qrCode}
        <Card>
          <CardHeader>
            <div class="flex items-start justify-between">
              <CardTitle class="text-base">{event?.name ?? "Loading..."}</CardTitle>
              <div class="flex items-center gap-2">
                <Badge variant="outline">{getChainLabel(ticket.chainKey)}</Badge>
                <Badge variant={getTicketBadgeVariant(ticket.status)}>{ticket.status}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent class="space-y-3 text-sm">
            {#if event}
              <div class="flex justify-between">
                <span class="text-xs uppercase tracking-wider text-muted-foreground">Event Date</span>
                <span class="font-mono">{new Date(event.startTime).toLocaleDateString()}</span>
              </div>
            {/if}
            <div class="flex justify-between">
              <span class="text-xs uppercase tracking-wider text-muted-foreground">Paid</span>
              <span class="font-mono font-bold">
                {ticket.purchasePrice === 0 ? "Free" : `$${ticket.purchasePrice} USDC`}
              </span>
            </div>
            {#if ticket.tokenId !== undefined}
              <div class="flex justify-between">
                <span class="text-xs uppercase tracking-wider text-muted-foreground">Token ID</span>
                <span class="font-mono">#{ticket.tokenId}</span>
              </div>
            {/if}
            <div class="flex justify-between">
              <span class="text-xs uppercase tracking-wider text-muted-foreground">Tx</span>
              <span class="ml-2 truncate font-mono text-xs">{ticket.txHash.slice(0, 10)}...</span>
            </div>
            <div class="flex justify-between">
              <span class="text-xs uppercase tracking-wider text-muted-foreground">Entry</span>
              <span class={`font-bold ${ticket.checkedInAt ? "text-accent" : "text-primary"}`}>
                {ticket.checkedInAt ? "Used" : "Not used"}
              </span>
            </div>
            {#if ticket.checkedInAt}
              <div class="flex justify-between">
                <span class="text-xs uppercase tracking-wider text-muted-foreground">Checked In</span>
                <span class="font-mono text-xs">{new Date(ticket.checkedInAt).toLocaleString()}</span>
              </div>
            {/if}
            <div class="space-y-2 pt-1">
              <p class="text-xs uppercase tracking-wider text-muted-foreground">Ticket QR</p>
              <div class="flex justify-center">
                <TicketQRCode value={qrValue} />
              </div>
              <p class="break-all font-mono text-[10px] text-muted-foreground">{qrValue}</p>
            </div>

            {#if ticket.status === "active" && event}
              <Button class="mt-2 w-full" href={`/events/${event._id}`} size="sm" variant="outline">
                View Event
              </Button>
            {/if}
          </CardContent>
        </Card>
      {/each}
    </div>
  {/if}
</main>
