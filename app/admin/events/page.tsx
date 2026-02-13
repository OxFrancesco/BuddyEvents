/// app/admin/events/page.tsx — Admin moderation queue
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useAccount } from "wagmi";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function AdminEventsPage() {
  const { address } = useAccount();
  const me = useQuery(api.users.me, {});
  const isAdmin = me?.role === "admin";
  const pending = useQuery(
    api.events.listPendingSubmissions,
    isAdmin ? {} : "skip",
  );
  const foundations = useQuery(api.teams.list, {});
  const projects = useQuery(api.projects.listAll, {});
  const upsertMe = useMutation(api.users.upsertMe);
  const approveSubmission = useMutation(api.events.approveSubmission);
  const rejectSubmission = useMutation(api.events.rejectSubmission);

  const [notesByEvent, setNotesByEvent] = useState<Record<string, string>>({});
  const [foundationByEvent, setFoundationByEvent] = useState<Record<string, string>>(
    {},
  );
  const [projectByEvent, setProjectByEvent] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    void upsertMe({ walletAddress: address ?? undefined });
  }, [address, upsertMe]);

  if (me === undefined || (isAdmin && pending === undefined)) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading moderation queue...
      </div>
    );
  }

  if (!me) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You need a user profile before accessing the admin queue.
            </p>
            <Link href="/events">
              <Button variant="outline" className="w-full">
                Back to events
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Admin only</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This moderation queue is restricted to admin users.
            </p>
            <Link href="/events">
              <Button variant="outline" className="w-full">
                Back to events
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeProjects = (projects ?? []).filter((project) => project.status === "active");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto h-16 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">Admin Moderation</h1>
            <Badge variant="secondary">{pending?.length ?? 0} pending</Badge>
          </div>
          <Link href="/events">
            <Button variant="outline" size="sm">
              Back to Events
            </Button>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {pending && pending.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No pending submissions.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {pending?.map((event) => {
              const key = event._id;
              const selectedFoundation =
                foundationByEvent[key] ?? event.teamId ?? "";
              const selectedProject = projectByEvent[key] ?? event.projectId ?? "";
              const projectOptions = selectedFoundation
                ? activeProjects.filter(
                    (project) => project.foundationId === selectedFoundation,
                  )
                : activeProjects;

              return (
                <Card key={event._id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle>{event.name}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          Submitted by {event.submitterEmail ?? event.creatorAddress}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {event.submissionSource ?? "user_submission"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {event.description || "No description provided."}
                    </p>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`foundation-${event._id}`}>Foundation</Label>
                        <select
                          id={`foundation-${event._id}`}
                          className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                          value={selectedFoundation}
                          onChange={(e) =>
                            setFoundationByEvent((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }))
                          }
                        >
                          <option value="">No foundation</option>
                          {(foundations ?? []).map((foundation) => (
                            <option key={foundation._id} value={foundation._id}>
                              {foundation.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`project-${event._id}`}>Project</Label>
                        <select
                          id={`project-${event._id}`}
                          className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                          value={selectedProject}
                          onChange={(e) =>
                            setProjectByEvent((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }))
                          }
                        >
                          <option value="">No project</option>
                          {projectOptions.map((project) => (
                            <option key={project._id} value={project._id}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`notes-${event._id}`}>Moderation Notes</Label>
                      <Textarea
                        id={`notes-${event._id}`}
                        rows={3}
                        value={notesByEvent[key] ?? ""}
                        onChange={(e) =>
                          setNotesByEvent((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                        placeholder="Optional notes for approval/rejection"
                      />
                    </div>

                    <div className="flex gap-3">
                      <Button
                        disabled={processingId === key}
                        onClick={async () => {
                          try {
                            setProcessingId(key);
                            await approveSubmission({
                              id: event._id,
                              foundationId: selectedFoundation
                                ? (selectedFoundation as Id<"teams">)
                                : undefined,
                              projectId: selectedProject
                                ? (selectedProject as Id<"projects">)
                                : undefined,
                              moderationNotes: notesByEvent[key] || undefined,
                            });
                          } catch (error) {
                            alert(
                              error instanceof Error
                                ? error.message
                                : "Approval failed",
                            );
                          } finally {
                            setProcessingId(null);
                          }
                        }}
                      >
                        {processingId === key ? "Approving..." : "Approve"}
                      </Button>

                      <Button
                        variant="destructive"
                        disabled={processingId === key}
                        onClick={async () => {
                          try {
                            setProcessingId(key);
                            await rejectSubmission({
                              id: event._id,
                              moderationNotes: notesByEvent[key] || undefined,
                            });
                          } catch (error) {
                            alert(
                              error instanceof Error
                                ? error.message
                                : "Rejection failed",
                            );
                          } finally {
                            setProcessingId(null);
                          }
                        }}
                      >
                        {processingId === key ? "Rejecting..." : "Reject"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
