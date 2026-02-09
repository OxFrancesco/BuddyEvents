/// app/page.tsx — Landing page
"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EventCard } from "@/components/EventCard";
import { ConnectWallet } from "@/components/ConnectWallet";
import { UserButton, SignInButton } from "@clerk/nextjs";
import { Authenticated, Unauthenticated } from "convex/react";

export default function Home() {
  const events = useQuery(api.events.list, { status: "active" });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
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
            <ConnectWallet />
            <Authenticated>
              <UserButton />
            </Authenticated>
            <Unauthenticated>
              <SignInButton mode="modal">
                <Button variant="outline" size="sm">
                  Sign In
                </Button>
              </SignInButton>
            </Unauthenticated>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-24 text-center">
        <Badge className="mb-4" variant="secondary">
          Powered by x402 + Monad
        </Badge>
        <h1 className="text-5xl font-bold tracking-tight mb-6">
          Event Ticketing for
          <br />
          <span className="text-primary">AI Agents</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          Buy, sell, create and manage event tickets with AI agents.
          NFT tickets on Monad. Instant USDC payments via x402.
          Agent-to-agent. Agent-to-human. Zero friction.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/events">
            <Button size="lg">Browse Events</Button>
          </Link>
          <Link href="/create">
            <Button size="lg" variant="outline">
              Create Event
            </Button>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="border-t bg-muted/50">
        <div className="container mx-auto px-4 py-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">x402 Payments</h3>
              <p className="text-muted-foreground text-sm">
                AI agents pay for tickets autonomously using the x402 HTTP
                payment protocol. No accounts, no API keys, just USDC.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">NFT Tickets on Monad</h3>
              <p className="text-muted-foreground text-sm">
                Every ticket is an ERC-721 NFT on Monad. 10,000 TPS,
                sub-second finality, near-zero fees.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Agent-Native</h3>
              <p className="text-muted-foreground text-sm">
                Built for AI agents via Go CLI. Pi agent discovers events,
                buys tickets, and manages registrations autonomously.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Recent Events */}
      <section className="container mx-auto px-4 py-16">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold">Live Events</h2>
          <Link href="/events">
            <Button variant="outline">View All</Button>
          </Link>
        </div>
        {events === undefined ? (
          <div className="text-center text-muted-foreground py-12">
            Loading events...
          </div>
        ) : events.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            No events yet.{" "}
            <Link href="/create" className="underline">
              Create the first one!
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.slice(0, 6).map((event: typeof events[number]) => (
              <EventCard key={event._id} id={event._id} {...event} />
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>BuddyEvents — Agent-Native Event Ticketing on Monad</p>
          <p className="mt-1">Built for the Monad Hackathon 2026</p>
        </div>
      </footer>
    </div>
  );
}
