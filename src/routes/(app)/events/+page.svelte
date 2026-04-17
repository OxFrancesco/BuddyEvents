<script lang="ts">
  import { useQuery } from "convex-svelte";
  import { api } from "@/convex/_generated/api";
  import EventCard from "$lib/components/EventCard.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Button from "$lib/components/ui/Button.svelte";

  const sectionsQuery = useQuery(api.events.listEventsPageSections, {});

  const foundationEvents = $derived(sectionsQuery.data?.foundationEvents ?? []);
  const projectEvents = $derived(sectionsQuery.data?.projectEvents ?? []);
  const loading = $derived(sectionsQuery.isLoading || !sectionsQuery.data);
</script>

<main class="container mx-auto space-y-12 px-4 py-8">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-3xl font-black uppercase tracking-wide">Events</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        Approved events grouped by foundations and projects
      </p>
    </div>
    <Button href="/create">Create Event</Button>
  </div>

  <section class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-bold uppercase tracking-wider">Foundation Events</h2>
      <Badge variant="secondary">{foundationEvents.length}</Badge>
    </div>
    {#if loading}
      <div class="border-2 border-dashed border-foreground/30 py-16 text-center text-muted-foreground">
        Loading foundation events...
      </div>
    {:else if foundationEvents.length === 0}
      <div class="border-2 border-dashed border-foreground/30 p-8 text-center text-muted-foreground">
        No approved foundation events yet.
      </div>
    {:else}
      <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {#each foundationEvents as event (event._id)}
          <div class="flex flex-col gap-2">
            <div class="px-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {event.foundationName ?? "Unassigned Foundation"}
            </div>
            <div class="flex-1">
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
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <section class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-bold uppercase tracking-wider">Project Events</h2>
      <Badge variant="secondary">{projectEvents.length}</Badge>
    </div>
    {#if loading}
      <div class="border-2 border-dashed border-foreground/30 py-16 text-center text-muted-foreground">
        Loading project events...
      </div>
    {:else if projectEvents.length === 0}
      <div class="border-2 border-dashed border-foreground/30 p-8 text-center text-muted-foreground">
        No approved project events yet.
      </div>
    {:else}
      <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {#each projectEvents as event (event._id)}
          <div class="flex flex-col gap-2">
            <div class="px-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {event.foundationName ?? "Unknown Foundation"} / {event.projectName ??
                "Unknown Project"}
            </div>
            <div class="flex-1">
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
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</main>
