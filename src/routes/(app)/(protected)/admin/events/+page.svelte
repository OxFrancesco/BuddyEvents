<script lang="ts">
  import { useQuery, useConvexClient } from "convex-svelte";
  import type { Id } from "@/convex/_generated/dataModel";
  import { api } from "@/convex/_generated/api";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import CardContent from "$lib/components/ui/CardContent.svelte";
  import CardHeader from "$lib/components/ui/CardHeader.svelte";
  import CardTitle from "$lib/components/ui/CardTitle.svelte";
  import Label from "$lib/components/ui/Label.svelte";
  import Textarea from "$lib/components/ui/Textarea.svelte";

  const client = useConvexClient();
  const meQuery = useQuery(api.users.me, {});
  const pendingQuery = useQuery(api.events.listPendingSubmissions, () =>
    meQuery.data?.role === "admin" ? {} : "skip",
  );
  const foundationsQuery = useQuery(api.teams.list, {});
  const projectsQuery = useQuery(api.projects.listAll, {});

  let notesByEvent = $state<Record<string, string>>({});
  let foundationByEvent = $state<Record<string, string>>({});
  let projectByEvent = $state<Record<string, string>>({});
  let processingId = $state<string | null>(null);

  const isAdmin = $derived(meQuery.data?.role === "admin");
  const activeProjects = $derived(
    (projectsQuery.data ?? []).filter((project) => project.status === "active"),
  );

  async function handleApprove(eventId: Id<"events">) {
    const selectedFoundation = foundationByEvent[eventId] ?? "";
    const selectedProject = projectByEvent[eventId] ?? "";

    try {
      processingId = eventId;
      await client.mutation(api.events.approveSubmission, {
        id: eventId,
        foundationId: selectedFoundation ? (selectedFoundation as Id<"teams">) : undefined,
        projectId: selectedProject ? (selectedProject as Id<"projects">) : undefined,
        moderationNotes: notesByEvent[eventId] || undefined,
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Approval failed");
    } finally {
      processingId = null;
    }
  }

  async function handleReject(eventId: Id<"events">) {
    try {
      processingId = eventId;
      await client.mutation(api.events.rejectSubmission, {
        id: eventId,
        moderationNotes: notesByEvent[eventId] || undefined,
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Rejection failed");
    } finally {
      processingId = null;
    }
  }
</script>

{#if meQuery.data === undefined || (isAdmin && pendingQuery.data === undefined)}
  <div class="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-background text-muted-foreground">
    <p class="font-mono">Loading moderation queue...</p>
  </div>
{:else if !meQuery.data}
  <div class="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-background">
    <Card class="w-full max-w-md">
      <CardHeader>
        <CardTitle>Access Denied</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <p class="text-sm text-muted-foreground">
          You need a user profile before accessing the admin queue.
        </p>
        <Button class="w-full" href="/events" variant="outline">Back to events</Button>
      </CardContent>
    </Card>
  </div>
{:else if !isAdmin}
  <div class="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-background">
    <Card class="w-full max-w-md">
      <CardHeader>
        <CardTitle>Admin Only</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <p class="text-sm text-muted-foreground">
          This moderation queue is restricted to admin users.
        </p>
        <Button class="w-full" href="/events" variant="outline">Back to events</Button>
      </CardContent>
    </Card>
  </div>
{:else}
  <div class="min-h-[calc(100vh-4rem)] bg-background">
    <header class="border-b-2 border-foreground">
      <div class="container mx-auto flex h-16 items-center justify-between px-4">
        <div class="flex items-center gap-3">
          <h1 class="text-xl font-black uppercase tracking-widest">Admin Moderation</h1>
          <Badge variant="secondary">{pendingQuery.data?.length ?? 0} pending</Badge>
        </div>
        <Button href="/events" size="sm" variant="outline">Back to Events</Button>
      </div>
    </header>

    <main class="container mx-auto px-4 py-8">
      {#if pendingQuery.data && pendingQuery.data.length === 0}
        <Card>
          <CardContent class="py-10 text-center text-muted-foreground">
            No pending submissions.
          </CardContent>
        </Card>
      {:else}
        <div class="space-y-6">
          {#each pendingQuery.data ?? [] as event (event._id)}
            {@const key = event._id}
            {@const selectedFoundation = foundationByEvent[key] ?? event.teamId ?? ""}
            {@const projectOptions = selectedFoundation
              ? activeProjects.filter((project) => project.foundationId === selectedFoundation)
              : activeProjects}
            <Card>
              <CardHeader>
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>{event.name}</CardTitle>
                    <p class="mt-1 font-mono text-sm text-muted-foreground">
                      Submitted by {event.submitterEmail ?? event.creatorAddress}
                    </p>
                  </div>
                  <Badge variant="secondary">{event.submissionSource ?? "user_submission"}</Badge>
                </div>
              </CardHeader>
              <CardContent class="space-y-4">
                <p class="whitespace-pre-wrap text-sm text-muted-foreground">
                  {event.description || "No description provided."}
                </p>

                <div class="grid gap-4 md:grid-cols-2">
                  <div class="space-y-2">
                    <Label for={`foundation-${event._id}`}>Foundation</Label>
                    <select
                      bind:value={foundationByEvent[key]}
                      class="h-10 w-full border-2 border-foreground bg-background px-3 text-sm font-medium"
                      id={`foundation-${event._id}`}
                    >
                      <option value="">No foundation</option>
                      {#each foundationsQuery.data ?? [] as foundation (foundation._id)}
                        <option value={foundation._id}>{foundation.name}</option>
                      {/each}
                    </select>
                  </div>

                  <div class="space-y-2">
                    <Label for={`project-${event._id}`}>Project</Label>
                    <select
                      bind:value={projectByEvent[key]}
                      class="h-10 w-full border-2 border-foreground bg-background px-3 text-sm font-medium"
                      id={`project-${event._id}`}
                    >
                      <option value="">No project</option>
                      {#each projectOptions as project (project._id)}
                        <option value={project._id}>{project.name}</option>
                      {/each}
                    </select>
                  </div>
                </div>

                <div class="space-y-2">
                  <Label for={`notes-${event._id}`}>Moderation Notes</Label>
                  <Textarea
                    bind:value={notesByEvent[key]}
                    id={`notes-${event._id}`}
                    placeholder="Optional notes for approval/rejection"
                    rows={3}
                  />
                </div>

                <div class="flex gap-3">
                  <Button disabled={processingId === key} onclick={() => void handleApprove(event._id)}>
                    {processingId === key ? "Approving..." : "Approve"}
                  </Button>
                  <Button
                    disabled={processingId === key}
                    onclick={() => void handleReject(event._id)}
                    variant="destructive"
                  >
                    {processingId === key ? "Rejecting..." : "Reject"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          {/each}
        </div>
      {/if}
    </main>
  </div>
{/if}
