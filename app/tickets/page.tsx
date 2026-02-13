/// app/tickets/page.tsx — My tickets page
"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { useAccount } from "wagmi";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectWallet } from "@/components/ConnectWallet";
import { TicketQRCode } from "@/components/TicketQRCode";
import { Header } from "@/components/Header";

type Ticket = {
  _id: Id<"tickets">;
  eventId: Id<"events">;
  tokenId?: number;
  buyerAddress: string;
  purchasePrice: number;
  txHash: string;
  qrCode: string;
  checkedInAt?: number;
  checkedInBy?: string;
  status: "active" | "listed" | "transferred" | "refunded";
};

export default function TicketsPage() {
  const { address, isConnected } = useAccount();
  const { isSignedIn } = useUser();
  const upsertMe = useMutation(api.users.upsertMe);
  const tickets = useQuery(
    api.tickets.listByBuyer,
    address && isSignedIn ? { buyerAddress: address } : "skip",
  );
  const eventIds = useMemo(
    () =>
      tickets
        ? Array.from(new Set(tickets.map((ticket) => ticket.eventId)))
        : [],
    [tickets],
  );
  const events = useQuery(
    api.events.getMany,
    eventIds.length > 0 ? { ids: eventIds } : "skip",
  );
  const eventsById = useMemo(
    () => new Map((events ?? []).map((event) => [event._id, event])),
    [events],
  );

  useEffect(() => {
    if (!isSignedIn) return;
    void upsertMe({ walletAddress: address ?? undefined });
  }, [address, isSignedIn, upsertMe]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-black uppercase tracking-wide mb-2">My Tickets</h1>
        <p className="text-muted-foreground mb-8 text-sm">
          Your purchased event tickets (NFTs on Monad)
        </p>

        {!isConnected ? (
          <div className="text-center py-24 space-y-4 border-2 border-dashed border-foreground/30">
            <p className="text-muted-foreground">Sign in and connect your wallet to see your tickets</p>
            <ConnectWallet />
          </div>
        ) : !isSignedIn ? (
          <div className="text-center py-24 space-y-4 border-2 border-dashed border-foreground/30">
            <p className="text-muted-foreground">Sign in with Clerk to load your tickets.</p>
            <Button disabled>Sign-in required</Button>
          </div>
        ) : tickets === undefined ? (
          <div className="text-center py-24 text-muted-foreground border-2 border-dashed border-foreground/30">
            Loading tickets...
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-24 border-2 border-dashed border-foreground/30">
            <p className="text-muted-foreground mb-4">No tickets yet.</p>
            <Link href="/events">
              <Button>Browse Events</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tickets.map((ticket) => (
              <TicketCard
                key={ticket._id}
                ticket={ticket}
                event={eventsById.get(ticket.eventId)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function getTicketBadgeVariant(status: Ticket["status"]) {
  switch (status) {
    case "active":
      return "default";
    case "listed":
      return "secondary";
    default:
      return "outline";
  }
}

function TicketCard({
  ticket,
  event,
}: {
  ticket: Ticket;
  event: Doc<"events"> | undefined;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <CardTitle className="text-base">
            {event?.name ?? "Loading..."}
          </CardTitle>
          <Badge variant={getTicketBadgeVariant(ticket.status)}>
            {ticket.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {event && (
          <div className="flex justify-between">
            <span className="text-muted-foreground uppercase text-xs tracking-wider">Event Date</span>
            <span className="font-mono">{new Date(event.startTime).toLocaleDateString()}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground uppercase text-xs tracking-wider">Paid</span>
          <span className="font-mono font-bold">
            {ticket.purchasePrice === 0
              ? "Free"
              : `$${ticket.purchasePrice} USDC`}
          </span>
        </div>
        {ticket.tokenId !== undefined && (
          <div className="flex justify-between">
            <span className="text-muted-foreground uppercase text-xs tracking-wider">Token ID</span>
            <span className="font-mono">#{ticket.tokenId}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground uppercase text-xs tracking-wider">Tx</span>
          <span className="font-mono text-xs truncate ml-2">
            {ticket.txHash.slice(0, 10)}...
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground uppercase text-xs tracking-wider">Entry</span>
          <span className={`font-bold ${ticket.checkedInAt ? "text-accent" : "text-primary"}`}>
            {ticket.checkedInAt ? "Used" : "Not used"}
          </span>
        </div>
        {ticket.checkedInAt && (
          <div className="flex justify-between">
            <span className="text-muted-foreground uppercase text-xs tracking-wider">Checked In</span>
            <span className="text-xs font-mono">{new Date(ticket.checkedInAt).toLocaleString()}</span>
          </div>
        )}
        <div className="space-y-2 pt-1">
          <p className="text-muted-foreground text-xs uppercase tracking-wider">Ticket QR</p>
          <div className="flex justify-center">
            <TicketQRCode value={ticket.qrCode} />
          </div>
          <p className="font-mono text-[10px] break-all text-muted-foreground">
            {ticket.qrCode}
          </p>
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
