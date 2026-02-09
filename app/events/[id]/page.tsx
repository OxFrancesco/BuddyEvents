/// app/events/[id]/page.tsx — Event detail + buy ticket page
"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ConnectWallet } from "@/components/ConnectWallet";
import {
  BUDDY_EVENTS_ADDRESS,
  BUDDY_EVENTS_ABI,
  MONAD_USDC_TESTNET,
  ERC20_ABI,
} from "@/lib/monad";

export default function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const event = useQuery(api.events.get, { id: id as Id<"events"> });
  const team = useQuery(
    api.teams.get,
    event ? { id: event.teamId } : "skip",
  );
  const { address, isConnected } = useAccount();
  const recordPurchase = useMutation(api.tickets.recordPurchase);

  // Approve USDC
  const { writeContract: approveUSDC, data: approveHash } = useWriteContract();
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  // Buy ticket on-chain
  const { writeContract: buyTicket, data: buyHash } = useWriteContract();
  const { isSuccess: buyConfirmed } = useWaitForTransactionReceipt({
    hash: buyHash,
  });

  if (event === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading event...</p>
      </div>
    );
  }
  if (event === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Event not found</p>
      </div>
    );
  }

  const startDate = new Date(event.startTime);
  const endDate = new Date(event.endTime);
  const spotsLeft = event.maxTickets - event.ticketsSold;
  const priceInUnits = BigInt(Math.floor(event.price * 1_000_000));

  const handleBuyOnChain = async () => {
    if (!address || !isConnected) return;

    if (event.price > 0) {
      // Step 1: Approve USDC
      approveUSDC({
        address: MONAD_USDC_TESTNET,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [BUDDY_EVENTS_ADDRESS, priceInUnits],
      });
    }
  };

  const handleBuyAfterApprove = async () => {
    if (!address || event.onChainEventId === undefined) return;

    // Step 2: Buy ticket on contract
    buyTicket({
      address: BUDDY_EVENTS_ADDRESS,
      abi: BUDDY_EVENTS_ABI,
      functionName: "buyTicket",
      args: [BigInt(event.onChainEventId)],
    });
  };

  const handleRecordPurchase = async () => {
    if (!address || !buyHash) return;

    await recordPurchase({
      eventId: event._id,
      buyerAddress: address,
      purchasePrice: event.price,
      txHash: buyHash,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="text-xl font-bold">BuddyEvents</Link>
          <div className="flex items-center gap-4">
            <Link href="/events"><Button variant="ghost" size="sm">Events</Button></Link>
            <ConnectWallet />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Link href="/events" className="text-sm text-muted-foreground hover:underline mb-4 block">
          &larr; Back to events
        </Link>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Event Details */}
          <div className="md:col-span-2 space-y-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Badge variant={event.status === "active" ? "default" : "secondary"}>
                  {event.status}
                </Badge>
                {spotsLeft <= 10 && spotsLeft > 0 && (
                  <Badge variant="destructive">{spotsLeft} spots left!</Badge>
                )}
              </div>
              <h1 className="text-3xl font-bold">{event.name}</h1>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex gap-8">
                <div>
                  <p className="text-muted-foreground">Start</p>
                  <p className="font-medium">{startDate.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">End</p>
                  <p className="font-medium">{endDate.toLocaleString()}</p>
                </div>
              </div>
              {event.location && (
                <div>
                  <p className="text-muted-foreground">Location</p>
                  <p className="font-medium">{event.location}</p>
                </div>
              )}
            </div>

            <Separator />

            <div>
              <h2 className="text-lg font-semibold mb-2">About</h2>
              <p className="text-muted-foreground whitespace-pre-wrap">
                {event.description || "No description provided."}
              </p>
            </div>

            {team && (
              <>
                <Separator />
                <div>
                  <h2 className="text-lg font-semibold mb-2">Organized by</h2>
                  <p className="font-medium">{team.name}</p>
                  <p className="text-sm text-muted-foreground">{team.description}</p>
                </div>
              </>
            )}
          </div>

          {/* Purchase Card */}
          <div>
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle className="text-lg">Get Tickets</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span>Price</span>
                  <span className="font-mono font-bold text-lg">
                    {event.price === 0 ? "Free" : `$${event.price} USDC`}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Available</span>
                  <span>{spotsLeft} / {event.maxTickets}</span>
                </div>

                <Separator />

                {!isConnected ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Connect your wallet to buy tickets
                    </p>
                    <ConnectWallet />
                  </div>
                ) : spotsLeft === 0 ? (
                  <Button disabled className="w-full">Sold Out</Button>
                ) : event.status !== "active" ? (
                  <Button disabled className="w-full">Event Not Active</Button>
                ) : !approveConfirmed && event.price > 0 ? (
                  <Button onClick={handleBuyOnChain} className="w-full">
                    {approveHash ? "Approving USDC..." : "Approve & Buy"}
                  </Button>
                ) : !buyConfirmed ? (
                  <Button onClick={handleBuyAfterApprove} className="w-full">
                    {buyHash ? "Confirming..." : "Buy Ticket"}
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Button onClick={handleRecordPurchase} variant="secondary" className="w-full">
                      Confirm Purchase
                    </Button>
                    <p className="text-xs text-center text-green-600">
                      Ticket purchased on-chain!
                    </p>
                  </div>
                )}

                <p className="text-xs text-muted-foreground text-center">
                  NFT ticket on Monad via USDC
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
