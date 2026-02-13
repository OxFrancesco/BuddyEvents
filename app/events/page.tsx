/// app/events/page.tsx — Sectioned public events page
"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EventCard } from "@/components/EventCard";
import { Header } from "@/components/Header";

export default function EventsPage() {
  const sections = useQuery(api.events.listEventsPageSections, {});

  const loading = sections === undefined;
  const foundationEvents = sections?.foundationEvents ?? [];
  const projectEvents = sections?.projectEvents ?? [];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8 space-y-12">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-wide">Events</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Approved events grouped by foundations and projects
            </p>
          </div>
          <Link href="/create">
            <Button>Create Event</Button>
          </Link>
        </div>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold uppercase tracking-wider">Foundation Events</h2>
            <Badge variant="secondary">{foundationEvents.length}</Badge>
          </div>
          {loading ? (
            <div className="text-center text-muted-foreground py-16 border-2 border-dashed border-foreground/30">
              Loading foundation events...
            </div>
          ) : foundationEvents.length === 0 ? (
            <div className="border-2 border-dashed border-foreground/30 p-8 text-center text-muted-foreground">
              No approved foundation events yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {foundationEvents.map((event) => (
                <div key={event._id} className="flex flex-col gap-2">
                  <div className="text-xs text-muted-foreground px-1 font-mono uppercase tracking-wider">
                    {event.foundationName ?? "Unassigned Foundation"}
                  </div>
                  <div className="flex-1">
                    <EventCard id={event._id} {...event} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold uppercase tracking-wider">Project Events</h2>
            <Badge variant="secondary">{projectEvents.length}</Badge>
          </div>
          {loading ? (
            <div className="text-center text-muted-foreground py-16 border-2 border-dashed border-foreground/30">
              Loading project events...
            </div>
          ) : projectEvents.length === 0 ? (
            <div className="border-2 border-dashed border-foreground/30 p-8 text-center text-muted-foreground">
              No approved project events yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projectEvents.map((event) => (
                <div key={event._id} className="flex flex-col gap-2">
                  <div className="text-xs text-muted-foreground px-1 font-mono uppercase tracking-wider">
                    {event.foundationName ?? "Unknown Foundation"} /{" "}
                    {event.projectName ?? "Unknown Project"}
                  </div>
                  <div className="flex-1">
                    <EventCard id={event._id} {...event} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
