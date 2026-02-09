/// app/events/page.tsx — Events listing page
"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EventCard } from "@/components/EventCard";
import { ConnectWallet } from "@/components/ConnectWallet";
import { UserButton, SignInButton } from "@clerk/nextjs";
import { Authenticated, Unauthenticated } from "convex/react";

export default function EventsPage() {
  const events = useQuery(api.events.list, {});

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold">BuddyEvents</span>
            <Badge variant="outline" className="text-xs">Monad</Badge>
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/events"><Button variant="ghost" size="sm">Events</Button></Link>
            <Link href="/tickets"><Button variant="ghost" size="sm">My Tickets</Button></Link>
            <Link href="/create"><Button variant="ghost" size="sm">Create Event</Button></Link>
            <ConnectWallet />
            <Authenticated><UserButton /></Authenticated>
            <Unauthenticated>
              <SignInButton mode="modal"><Button variant="outline" size="sm">Sign In</Button></SignInButton>
            </Unauthenticated>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">All Events</h1>
            <p className="text-muted-foreground mt-1">
              Discover and buy tickets for events on Monad
            </p>
          </div>
          <Link href="/create">
            <Button>Create Event</Button>
          </Link>
        </div>

        {events === undefined ? (
          <div className="text-center text-muted-foreground py-24">
            Loading events...
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-muted-foreground mb-4">No events yet.</p>
            <Link href="/create">
              <Button>Create the first event</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((event: typeof events[number]) => (
              <EventCard key={event._id} id={event._id} {...event} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
