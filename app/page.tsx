/// app/page.tsx — Landing page
"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EventCard } from "@/components/EventCard";
import { Header } from "@/components/Header";
import { AnimatedLogo } from "@/components/AnimatedLogo";

export default function Home() {
  const events = useQuery(api.events.list, { status: "active" });

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero */}
      <section className="container mx-auto px-4 py-24 text-center">
        <div className="mx-auto mb-8 flex justify-center">
          <AnimatedLogo size={220} />
        </div>
        <Badge className="mb-6" variant="secondary">
          Powered by x402 + Monad
        </Badge>
        <h1 className="text-5xl font-black uppercase tracking-tight mb-6">
          Event Ticketing for
          <br />
          <span className="text-primary">AI Agents</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
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
      <section className="border-t-2 border-foreground bg-muted/30">
        <div className="container mx-auto px-4 py-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                title: "x402 Payments",
                desc: "AI agents pay for tickets autonomously using the x402 HTTP payment protocol. No accounts, no API keys, just USDC.",
              },
              {
                title: "NFT Tickets on Monad",
                desc: "Every ticket is an ERC-721 NFT on Monad. 10,000 TPS, sub-second finality, near-zero fees.",
              },
              {
                title: "Agent-Native",
                desc: "Built for AI agents via Go CLI. Pi agent discovers events, buys tickets, and manages registrations autonomously.",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="border-2 border-foreground bg-card p-6 shadow-[4px_4px_0px_var(--foreground)]"
              >
                <h3 className="text-sm font-bold uppercase tracking-wider mb-2">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recent Events */}
      <section className="container mx-auto px-4 py-16">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-black uppercase tracking-wide">
            Live Events
          </h2>
          <Link href="/events">
            <Button variant="outline">View All</Button>
          </Link>
        </div>
        {events === undefined ? (
          <div className="text-center text-muted-foreground py-12 border-2 border-dashed border-foreground/30">
            Loading events...
          </div>
        ) : events.length === 0 ? (
          <div className="text-center text-muted-foreground py-12 border-2 border-dashed border-foreground/30">
            No events yet.{" "}
            <Link href="/create" className="underline text-primary">
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
      <footer className="border-t-2 border-foreground py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p className="font-bold uppercase tracking-wider">
            BuddyEvents — Agent-Native Event Ticketing on Monad
          </p>
          <p className="mt-1 font-mono text-xs">
            Built for the Monad Hackathon 2026
          </p>
        </div>
      </footer>
    </div>
  );
}
