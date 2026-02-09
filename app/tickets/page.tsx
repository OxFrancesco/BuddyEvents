/// app/tickets/page.tsx — My tickets page
"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useAccount } from "wagmi";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectWallet } from "@/components/ConnectWallet";

export default function TicketsPage() {
  const { address, isConnected } = useAccount();
  const tickets = useQuery(
    api.tickets.listByBuyer,
    address ? { buyerAddress: address } : "skip",
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="text-xl font-bold">BuddyEvents</Link>
          <div className="flex items-center gap-4">
            <Link href="/events"><Button variant="ghost" size="sm">Events</Button></Link>
            <Link href="/tickets"><Button variant="ghost" size="sm">My Tickets</Button></Link>
            <ConnectWallet />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-2">My Tickets</h1>
        <p className="text-muted-foreground mb-8">
          Your purchased event tickets (NFTs on Monad)
        </p>

        {!isConnected ? (
          <div className="text-center py-24 space-y-4">
            <p className="text-muted-foreground">Connect your wallet to see your tickets</p>
            <ConnectWallet />
          </div>
        ) : tickets === undefined ? (
          <div className="text-center py-24 text-muted-foreground">
            Loading tickets...
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-muted-foreground mb-4">No tickets yet.</p>
            <Link href="/events">
              <Button>Browse Events</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tickets.map((ticket: (typeof tickets)[number]) => (
              <TicketCard key={ticket._id} ticket={ticket} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function TicketCard({ ticket }: { ticket: Doc<"tickets"> }) {
  const event = useQuery(api.events.get, { id: ticket.eventId });

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg">
            {event?.name ?? "Loading..."}
          </CardTitle>
          <Badge
            variant={
              ticket.status === "active"
                ? "default"
                : ticket.status === "listed"
                  ? "secondary"
                  : "outline"
            }
          >
            {ticket.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {event && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Event Date</span>
            <span>{new Date(event.startTime).toLocaleDateString()}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Paid</span>
          <span className="font-mono">
            {ticket.purchasePrice === 0
              ? "Free"
              : `$${ticket.purchasePrice} USDC`}
          </span>
        </div>
        {ticket.tokenId !== undefined && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Token ID</span>
            <span className="font-mono">#{ticket.tokenId}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tx</span>
          <span className="font-mono text-xs truncate ml-2">
            {ticket.txHash.slice(0, 10)}...
          </span>
        </div>

        {ticket.status === "active" && event && (
          <Link href={`/events/${event._id}`}>
            <Button variant="outline" size="sm" className="w-full mt-2">
              View Event
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
