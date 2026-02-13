/// app/events/page.tsx — Sectioned public events page
"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EventCard } from "@/components/EventCard";
import { ConnectWallet } from "@/components/ConnectWallet";
import { SignedIn, UserButton } from "@clerk/nextjs";

export default function EventsPage() {
  const sections = useQuery(api.events.listEventsPageSections, {});

  const loading = sections === undefined;
  const foundationEvents = sections?.foundationEvents ?? [];
  const projectEvents = sections?.projectEvents ?? [];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold">BuddyEvents</span>
            <Badge variant="outline" className="text-xs">
              Monad
            </Badge>
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/events">
              <Button variant="ghost" size="sm">
                Events
              </Button>
            </Link>
            <Link href="/tickets">
              <Button variant="ghost" size="sm">
                My Tickets
              </Button>
            </Link>
            <Link href="/create">
              <Button variant="ghost" size="sm">
                Create Event
              </Button>
            </Link>
            <Link href="/check-in">
              <Button variant="ghost" size="sm">
                Check-in
              </Button>
            </Link>
            <ConnectWallet />
            <SignedIn>
              <UserButton />
            </SignedIn>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-12">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Events</h1>
            <p className="text-muted-foreground mt-1">
              Approved events grouped by foundations and projects
            </p>
          </div>
          <Link href="/create">
            <Button>Create Event</Button>
          </Link>
        </div>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Foundation Events</h2>
            <Badge variant="secondary">{foundationEvents.length}</Badge>
          </div>
          {loading ? (
            <div className="text-center text-muted-foreground py-16">
              Loading foundation events...
            </div>
          ) : foundationEvents.length === 0 ? (
            <div className="rounded-lg border p-8 text-center text-muted-foreground">
              No approved foundation events yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {foundationEvents.map((event) => (
                <div key={event._id} className="space-y-2">
                  <div className="text-xs text-muted-foreground px-1">
                    {event.foundationName ?? "Unassigned Foundation"}
                  </div>
                  <EventCard id={event._id} {...event} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Project Events</h2>
            <Badge variant="secondary">{projectEvents.length}</Badge>
          </div>
          {loading ? (
            <div className="text-center text-muted-foreground py-16">
              Loading project events...
            </div>
          ) : projectEvents.length === 0 ? (
            <div className="rounded-lg border p-8 text-center text-muted-foreground">
              No approved project events yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projectEvents.map((event) => (
                <div key={event._id} className="space-y-2">
                  <div className="text-xs text-muted-foreground px-1">
                    {event.foundationName ?? "Unknown Foundation"} /{" "}
                    {event.projectName ?? "Unknown Project"}
                  </div>
                  <EventCard id={event._id} {...event} />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
