<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { useQuery, useConvexClient } from "convex-svelte";
  import type { Id } from "@/convex/_generated/dataModel";
  import { api } from "@/convex/_generated/api";
  import { DEFAULT_CHAIN_KEY, SUPPORTED_CHAINS, type SupportedChainKey } from "@/lib/chains";
  import ConnectWallet from "$lib/components/ConnectWallet.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import CardContent from "$lib/components/ui/CardContent.svelte";
  import CardHeader from "$lib/components/ui/CardHeader.svelte";
  import CardTitle from "$lib/components/ui/CardTitle.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Label from "$lib/components/ui/Label.svelte";
  import Textarea from "$lib/components/ui/Textarea.svelte";
  import { getClerkContext } from "$lib/stores/clerk.svelte";
  import { getWalletContext } from "$lib/stores/wallet.svelte";

  type DestinationType = "foundation" | "project" | "unassigned";

  const clerkContext = getClerkContext();
  const walletContext = getWalletContext();
  const client = useConvexClient();

  const isSignedIn = $derived(Boolean(clerkContext.currentSession));
  const meQuery = useQuery(api.users.me, () => (isSignedIn ? {} : "skip"));
  const humanWalletQuery = useQuery(api.wallets.getByUserAndPurpose, () =>
    meQuery.data ? { userId: meQuery.data._id, purpose: "human_primary" as const } : "skip",
  );
  const foundationsQuery = useQuery(api.teams.list, {});
  const allProjectsQuery = useQuery(api.projects.listAll, {});

  let loading = $state(false);
  let destinationType = $state<DestinationType>("foundation");
  let selectedFoundationId = $state("");
  let selectedProjectId = $state("");
  let chainKey = $state<SupportedChainKey>(DEFAULT_CHAIN_KEY);
  let form = $state({
    name: "",
    description: "",
    startDate: "",
    startTime: "09:00",
    endDate: "",
    endTime: "18:00",
    price: "0",
    maxTickets: "100",
    location: "",
  });

  const filteredProjects = $derived.by(() => {
    const allProjects = allProjectsQuery.data ?? [];
    const active = allProjects.filter((project) => project.status === "active");
    if (!selectedFoundationId) return active;
    return active.filter((project) => project.foundationId === selectedFoundationId);
  });

  const isAdmin = $derived(meQuery.data?.role === "admin");
  const willAutoPublish = $derived(isAdmin && destinationType !== "unassigned");
  const creatorAddress = $derived(
    humanWalletQuery.data?.walletAddress ?? walletContext.address,
  );

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!creatorAddress) return;

    if (destinationType === "foundation" && !selectedFoundationId) {
      window.alert("Please select a foundation");
      return;
    }
    if (destinationType === "project" && !selectedProjectId) {
      window.alert("Please select a project");
      return;
    }

    loading = true;
    try {
      const startMs = new Date(`${form.startDate}T${form.startTime}`).getTime();
      const endMs = new Date(`${form.endDate}T${form.endTime}`).getTime();

      const eventId = await client.mutation(api.events.submit, {
        name: form.name,
        description: form.description,
        startTime: startMs,
        endTime: endMs,
        price: Number.parseFloat(form.price),
        maxTickets: Number.parseInt(form.maxTickets, 10),
        chainKey,
        foundationId:
          destinationType === "foundation"
            ? (selectedFoundationId as Id<"teams">)
            : undefined,
        projectId:
          destinationType === "project" ? (selectedProjectId as Id<"projects">) : undefined,
        location: form.location,
        creatorAddress,
      });

      await goto(resolve("/(app)/events/[id]", { id: eventId }));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to submit event");
    } finally {
      loading = false;
    }
  }
</script>

<main class="container mx-auto max-w-2xl px-4 py-8">
  <a
    class="mb-4 block font-mono text-sm uppercase tracking-wider text-muted-foreground hover:text-primary"
    href={resolve("/events")}
  >
    &larr; Back to events
  </a>

  <Card>
    <CardHeader>
      <CardTitle>Submit Event</CardTitle>
    </CardHeader>
    <CardContent>
      {#if !isSignedIn}
        <div class="space-y-4 py-8 text-center">
          <p class="text-muted-foreground">Sign in to submit an event</p>
          <ConnectWallet />
        </div>
      {:else if !creatorAddress}
        <div class="space-y-4 py-8 text-center">
          <p class="text-muted-foreground">
            Connect your wallet signer to provision a Crossmint smart wallet before submitting.
          </p>
          <ConnectWallet />
        </div>
      {:else}
        <form class="space-y-4" onsubmit={handleSubmit}>
          <div class="space-y-3 border-2 border-foreground/50 p-4">
            <div class="space-y-2">
              <Label for="chainKey">Chain</Label>
              <select
                bind:value={chainKey}
                class="h-10 w-full border-2 border-foreground bg-background px-3 text-sm font-medium"
                id="chainKey"
              >
                {#each SUPPORTED_CHAINS as chain (chain.key)}
                  <option value={chain.key}>{chain.displayName}</option>
                {/each}
              </select>
            </div>

            <div class="space-y-2">
              <Label for="destinationType">Submit Destination</Label>
              <select
                bind:value={destinationType}
                class="h-10 w-full border-2 border-foreground bg-background px-3 text-sm font-medium"
                id="destinationType"
              >
                <option value="foundation">Foundation</option>
                <option value="project">Project</option>
                <option value="unassigned">No assignment (admin queue)</option>
              </select>
            </div>

            {#if destinationType === "foundation"}
              <div class="space-y-2">
                <Label for="foundationId">Foundation</Label>
                <select
                  bind:value={selectedFoundationId}
                  class="h-10 w-full border-2 border-foreground bg-background px-3 text-sm font-medium"
                  id="foundationId"
                  required
                >
                  <option value="">Select a foundation</option>
                  {#each foundationsQuery.data ?? [] as foundation (foundation._id)}
                    <option value={foundation._id}>{foundation.name}</option>
                  {/each}
                </select>
              </div>
            {/if}

            {#if destinationType === "project"}
              <div class="space-y-2">
                <Label for="projectId">Project</Label>
                <select
                  bind:value={selectedProjectId}
                  class="h-10 w-full border-2 border-foreground bg-background px-3 text-sm font-medium"
                  id="projectId"
                  required
                >
                  <option value="">Select a project</option>
                  {#each filteredProjects as project (project._id)}
                    <option value={project._id}>{project.name}</option>
                  {/each}
                </select>
              </div>
            {/if}

            <div class="flex items-center gap-2 text-sm">
              <Badge variant={willAutoPublish ? "default" : "secondary"}>
                {willAutoPublish ? "Publishes immediately" : "Will be reviewed by admin"}
              </Badge>
            </div>
          </div>

          <div class="space-y-2">
            <Label for="name">Event Name</Label>
            <Input bind:value={form.name} id="name" placeholder="ETH Denver 2026" required />
          </div>

          <div class="space-y-2">
            <Label for="description">Description</Label>
            <Textarea
              bind:value={form.description}
              id="description"
              placeholder="What's this event about?"
              rows={4}
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="startDate">Start Date</Label>
              <Input bind:value={form.startDate} id="startDate" required type="date" />
            </div>
            <div class="space-y-2">
              <Label for="startTime">Start Time</Label>
              <Input bind:value={form.startTime} id="startTime" type="time" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="endDate">End Date</Label>
              <Input bind:value={form.endDate} id="endDate" required type="date" />
            </div>
            <div class="space-y-2">
              <Label for="endTime">End Time</Label>
              <Input bind:value={form.endTime} id="endTime" type="time" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="price">Price (USDC)</Label>
              <Input bind:value={form.price} id="price" min="0" step="0.01" type="number" />
            </div>
            <div class="space-y-2">
              <Label for="maxTickets">Max Tickets</Label>
              <Input bind:value={form.maxTickets} id="maxTickets" min="1" type="number" />
            </div>
          </div>

          <div class="space-y-2">
            <Label for="location">Location</Label>
            <Input bind:value={form.location} id="location" placeholder="Denver, CO" />
          </div>

          <Button class="w-full" disabled={loading} type="submit">
            {loading ? "Submitting..." : "Submit Event"}
          </Button>

          <div class="space-y-1 text-center font-mono text-xs text-muted-foreground">
            <p>
              Creator wallet: {creatorAddress.slice(0, 6)}...{creatorAddress.slice(-4)}
            </p>
            {#if humanWalletQuery.data?.walletAddress}
              <p>Using your Crossmint smart wallet linked to Clerk.</p>
            {:else if walletContext.isConnected && walletContext.address}
              <p>Using your connected signer until smart-wallet provisioning completes.</p>
            {/if}
          </div>
        </form>
      {/if}
    </CardContent>
  </Card>
</main>
