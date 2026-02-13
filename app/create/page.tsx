/// app/create/page.tsx — Moderated event submission form
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useAccount } from "wagmi";
import { useUser } from "@clerk/nextjs";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConnectWallet } from "@/components/ConnectWallet";

type DestinationType = "foundation" | "project" | "unassigned";

export default function CreateEventPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { isSignedIn } = useUser();
  const submitEvent = useMutation(api.events.submit);
  const upsertMe = useMutation(api.users.upsertMe);
  const me = useQuery(api.users.me, {});
  const foundations = useQuery(api.teams.list, {});
  const allProjects = useQuery(api.projects.listAll, {});

  const [loading, setLoading] = useState(false);
  const [destinationType, setDestinationType] =
    useState<DestinationType>("foundation");
  const [selectedFoundationId, setSelectedFoundationId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [form, setForm] = useState({
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

  useEffect(() => {
    if (!isSignedIn) return;
    void upsertMe({ walletAddress: address ?? undefined });
  }, [address, isSignedIn, upsertMe]);

  const filteredProjects = useMemo(() => {
    if (!allProjects) return [];
    const active = allProjects.filter((project) => project.status === "active");
    if (!selectedFoundationId) return active;
    return active.filter((project) => project.foundationId === selectedFoundationId);
  }, [allProjects, selectedFoundationId]);

  const isAdmin = me?.role === "admin";
  const willAutoPublish = isAdmin && destinationType !== "unassigned";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) return;

    if (destinationType === "foundation" && !selectedFoundationId) {
      alert("Please select a foundation");
      return;
    }
    if (destinationType === "project" && !selectedProjectId) {
      alert("Please select a project");
      return;
    }

    setLoading(true);
    try {
      const startMs = new Date(`${form.startDate}T${form.startTime}`).getTime();
      const endMs = new Date(`${form.endDate}T${form.endTime}`).getTime();

      const eventId = await submitEvent({
        name: form.name,
        description: form.description,
        startTime: startMs,
        endTime: endMs,
        price: parseFloat(form.price),
        maxTickets: parseInt(form.maxTickets),
        foundationId:
          destinationType === "foundation"
            ? (selectedFoundationId as Id<"teams">)
            : undefined,
        projectId:
          destinationType === "project"
            ? (selectedProjectId as Id<"projects">)
            : undefined,
        location: form.location,
        creatorAddress: address,
      });

      router.push(`/events/${eventId}`);
    } catch (error) {
      console.error("Failed to submit event:", error);
      alert(error instanceof Error ? error.message : "Failed to submit event");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="text-xl font-bold">
            BuddyEvents
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/events">
              <Button variant="ghost" size="sm">
                Events
              </Button>
            </Link>
            <Link href="/check-in">
              <Button variant="ghost" size="sm">
                Check-in
              </Button>
            </Link>
            <ConnectWallet />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <Link
          href="/events"
          className="text-sm text-muted-foreground hover:underline mb-4 block"
        >
          &larr; Back to events
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Submit Event</CardTitle>
          </CardHeader>
          <CardContent>
            {!isConnected ? (
              <div className="text-center py-8 space-y-4">
                <p className="text-muted-foreground">
                  Sign in and connect your wallet to submit an event
                </p>
                <ConnectWallet />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="rounded-md border p-4 space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="destinationType">Submit Destination</Label>
                    <select
                      id="destinationType"
                      className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                      value={destinationType}
                      onChange={(e) =>
                        setDestinationType(e.target.value as DestinationType)
                      }
                    >
                      <option value="foundation">Foundation</option>
                      <option value="project">Project</option>
                      <option value="unassigned">No assignment (admin queue)</option>
                    </select>
                  </div>

                  {destinationType === "foundation" && (
                    <div className="space-y-2">
                      <Label htmlFor="foundationId">Foundation</Label>
                      <select
                        id="foundationId"
                        className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                        value={selectedFoundationId}
                        onChange={(e) => setSelectedFoundationId(e.target.value)}
                        required
                      >
                        <option value="">Select a foundation</option>
                        {(foundations ?? []).map((foundation) => (
                          <option key={foundation._id} value={foundation._id}>
                            {foundation.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {destinationType === "project" && (
                    <div className="space-y-2">
                      <Label htmlFor="projectId">Project</Label>
                      <select
                        id="projectId"
                        className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                        value={selectedProjectId}
                        onChange={(e) => setSelectedProjectId(e.target.value)}
                        required
                      >
                        <option value="">Select a project</option>
                        {filteredProjects.map((project) => (
                          <option key={project._id} value={project._id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant={willAutoPublish ? "default" : "secondary"}>
                      {willAutoPublish
                        ? "Publishes immediately"
                        : "Will be reviewed by admin"}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Event Name</Label>
                  <Input
                    id="name"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="ETH Denver 2026"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    placeholder="What's this event about?"
                    rows={4}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input
                      id="startDate"
                      type="date"
                      required
                      value={form.startDate}
                      onChange={(e) =>
                        setForm({ ...form, startDate: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="startTime">Start Time</Label>
                    <Input
                      id="startTime"
                      type="time"
                      value={form.startTime}
                      onChange={(e) =>
                        setForm({ ...form, startTime: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="endDate">End Date</Label>
                    <Input
                      id="endDate"
                      type="date"
                      required
                      value={form.endDate}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endTime">End Time</Label>
                    <Input
                      id="endTime"
                      type="time"
                      value={form.endTime}
                      onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="price">Price (USDC)</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxTickets">Max Tickets</Label>
                    <Input
                      id="maxTickets"
                      type="number"
                      min="1"
                      value={form.maxTickets}
                      onChange={(e) =>
                        setForm({ ...form, maxTickets: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="Denver, CO"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Submitting..." : "Submit Event"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
