/// app/tickets/page.tsx — My tickets page
"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectWallet } from "@/components/ConnectWallet";
import { TicketQRCode } from "@/components/TicketQRCode";
import { Header } from "@/components/Header";
import { getChainLabel } from "@/lib/chains";

type Ticket = {
  _id: Id<"tickets">;
  eventId: Id<"events">;
  tokenId?: number;
  buyerAddress: string;
  purchasePrice: number;
  txHash: string;
  qrCode: string;
  chainKey: "monadTestnet" | "baseMainnet";
  checkedInAt?: number;
  checkedInBy?: string;
  status: "active" | "listed" | "transferred" | "refunded";
};

const emptySubscribe = () => () => {};

export default function TicketsPage() {
  const { isLoaded, isSignedIn } = useUser();
  const isHydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const isSessionReady = isHydrated && isLoaded;
  const tickets = useQuery(api.tickets.listMine, isSessionReady && isSignedIn ? {} : "skip");
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
  const activeQrTokens = useQuery(
    api.qr.listActiveByTickets,
    tickets && tickets.length > 0
      ? { ticketIds: tickets.map((ticket) => ticket._id) }
      : "skip",
  );
  const eventsById = useMemo(
    () => new Map((events ?? []).map((event) => [event._id, event])),
    [events],
  );
  const activeQrByTicketId = useMemo(
    () =>
      new Map(
        (activeQrTokens ?? []).map((qr) => [qr.ticketId, qr]),
      ),
    [activeQrTokens],
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-black uppercase tracking-wide mb-2">My Tickets</h1>
        <p className="text-muted-foreground mb-8 text-sm">
          Your purchased event tickets across Monad Testnet and Base Mainnet
        </p>

        {!isSessionReady ? (
          <div className="text-center py-24 text-muted-foreground border-2 border-dashed border-foreground/30">
            Loading session...
          </div>
        ) : !isSignedIn ? (
          <div className="text-center py-24 space-y-4 border-2 border-dashed border-foreground/30">
            <p className="text-muted-foreground">Sign in to see your tickets</p>
            <ConnectWallet />
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
                activeQrToken={activeQrByTicketId.get(ticket._id)?.token}
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
  activeQrToken,
}: {
  ticket: Ticket;
  event: Doc<"events"> | undefined;
  activeQrToken?: string;
}) {
  const qrValue = activeQrToken ?? ticket.qrCode;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <CardTitle className="text-base">
            {event?.name ?? "Loading..."}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{getChainLabel(ticket.chainKey)}</Badge>
            <Badge variant={getTicketBadgeVariant(ticket.status)}>
              {ticket.status}
            </Badge>
          </div>
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
            <TicketQRCode value={qrValue} />
          </div>
          <p className="font-mono text-[10px] break-all text-muted-foreground">
            {qrValue}
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
