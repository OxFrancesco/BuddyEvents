<script lang="ts">
  import type { Id } from "@/convex/_generated/dataModel";
  import { getChainLabel } from "@/lib/chains";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import CardContent from "$lib/components/ui/CardContent.svelte";
  import CardFooter from "$lib/components/ui/CardFooter.svelte";
  import CardHeader from "$lib/components/ui/CardHeader.svelte";
  import CardTitle from "$lib/components/ui/CardTitle.svelte";

  let {
    chainKey,
    id,
    location,
    maxTickets,
    name,
    price,
    startTime,
    status,
    ticketsSold,
  }: {
    chainKey: "monadTestnet" | "baseMainnet";
    id: Id<"events">;
    location: string;
    maxTickets: number;
    name: string;
    price: number;
    startTime: number;
    status: string;
    ticketsSold: number;
  } = $props();

  const startDate = $derived(new Date(startTime));
  const spotsLeft = $derived(maxTickets - ticketsSold);
</script>

<Card class="flex h-full flex-col transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_var(--foreground)]">
  <CardHeader>
    <div class="flex items-start justify-between gap-3">
      <CardTitle class="text-base">{name}</CardTitle>
      <div class="flex items-center gap-2">
        <Badge variant="outline">{getChainLabel(chainKey)}</Badge>
        <Badge variant={status === "active" ? "default" : "secondary"}>{status}</Badge>
      </div>
    </div>
  </CardHeader>
  <CardContent class="flex-1 space-y-3 text-sm">
    <div class="flex justify-between">
      <span class="text-xs uppercase tracking-wider text-muted-foreground">Date</span>
      <span class="font-mono">
        {startDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </span>
    </div>
    <div class="flex justify-between">
      <span class="text-xs uppercase tracking-wider text-muted-foreground">Price</span>
      <span class="font-mono font-bold">
        {price === 0 ? "Free" : `$${price} USDC`}
      </span>
    </div>
    <div class="flex justify-between">
      <span class="text-xs uppercase tracking-wider text-muted-foreground">Location</span>
      <span class="ml-2 truncate font-mono">{location || "TBD"}</span>
    </div>
    <div class="flex justify-between">
      <span class="text-xs uppercase tracking-wider text-muted-foreground">Spots</span>
      <span class="font-mono font-bold">
        {spotsLeft > 0 ? `${spotsLeft} left` : "Sold out"}
      </span>
    </div>
  </CardContent>
  <CardFooter>
    <Button class="w-full" href={`/events/${id}`} variant={spotsLeft > 0 ? "default" : "secondary"}>
      {spotsLeft > 0 ? "View & Buy" : "View Details"}
    </Button>
  </CardFooter>
</Card>
