<script lang="ts">
  import { resolve } from "$app/paths";
  import type { PageProps } from "./$types";
  import AnimatedLogo from "$lib/components/AnimatedLogo.svelte";
  import EventCard from "$lib/components/EventCard.svelte";
  import MarketingHeader from "$lib/components/MarketingHeader.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Button from "$lib/components/ui/Button.svelte";

  let { data }: PageProps = $props();
</script>

<div class="min-h-screen bg-background">
  <MarketingHeader />

  <section class="container mx-auto px-4 py-24 text-center">
    <div class="mx-auto mb-8 flex justify-center">
      <AnimatedLogo size={220} />
    </div>
    <Badge class="mb-6" variant="secondary">Powered by x402 on Monad Testnet and Base Mainnet</Badge>
    <h1 class="mb-6 text-5xl font-black uppercase tracking-tight">
      Event Ticketing for
      <br />
      <span class="text-primary">AI Agents</span>
    </h1>
    <p class="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-muted-foreground">
      Buy, sell, create and manage event tickets with AI agents. NFT tickets on Monad Testnet and
      Base Mainnet. Instant USDC payments via x402. Agent-to-agent. Agent-to-human. Zero friction.
    </p>
    <div class="flex justify-center gap-4">
      <Button href="/events" size="lg">Browse Events</Button>
      <Button href="/create" size="lg" variant="outline">Create Event</Button>
    </div>
  </section>

  <section class="border-t-2 border-foreground bg-muted/30">
    <div class="container mx-auto px-4 py-16">
      <div class="grid grid-cols-1 gap-8 md:grid-cols-3">
        {#each [
          {
            title: "x402 Payments",
            desc: "AI agents pay for tickets autonomously using the x402 HTTP payment protocol. No accounts, no API keys, just USDC.",
          },
          {
            title: "NFT Tickets on Supported Chains",
            desc: "Every ticket is an ERC-721 NFT on the event's selected chain: Monad Testnet or Base Mainnet.",
          },
          {
            title: "Agent-Native",
            desc: "Built for AI agents via Go CLI. Pi agent discovers events, buys tickets, and manages registrations autonomously.",
          },
        ] as feature (feature.title)}
          <div class="border-2 border-foreground bg-card p-6 shadow-[4px_4px_0px_var(--foreground)]">
            <h3 class="mb-2 text-sm font-bold uppercase tracking-wider">{feature.title}</h3>
            <p class="text-sm leading-relaxed text-muted-foreground">{feature.desc}</p>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <section class="container mx-auto px-4 py-16">
    <div class="mb-8 flex items-center justify-between">
      <h2 class="text-2xl font-black uppercase tracking-wide">Live Events</h2>
      <Button href="/events" variant="outline">View All</Button>
    </div>

    {#if data.activeEvents.length === 0}
      <div class="border-2 border-dashed border-foreground/30 py-12 text-center text-muted-foreground">
        No events yet.
        <a class="text-primary underline" href={resolve("/create")}>Create the first one!</a>
      </div>
    {:else}
      <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {#each data.activeEvents.slice(0, 6) as event (event._id)}
          <EventCard
            chainKey={event.chainKey}
            id={event._id}
            location={event.location}
            maxTickets={event.maxTickets}
            name={event.name}
            price={event.price}
            startTime={event.startTime}
            status={event.status}
            ticketsSold={event.ticketsSold}
          />
        {/each}
      </div>
    {/if}
  </section>

  <footer class="border-t-2 border-foreground py-8">
    <div class="container mx-auto px-4 text-center text-sm text-muted-foreground">
      <p class="font-bold uppercase tracking-wider">
        BuddyEvents — Agent-Native Event Ticketing on Monad Testnet and Base Mainnet
      </p>
      <p class="mt-1 font-mono text-xs">
        Built for agent-native USDC ticketing across supported EVM chains
      </p>
    </div>
  </footer>
</div>
