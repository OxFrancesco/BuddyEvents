/// components/EventCard.tsx — Event card for listings
"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Id } from "../convex/_generated/dataModel";
import { getChainLabel } from "@/lib/chains";

interface EventCardProps {
  id: Id<"events">;
  name: string;
  description: string;
  startTime: number;
  endTime: number;
  price: number;
  maxTickets: number;
  ticketsSold: number;
  location: string;
  status: string;
  chainKey: "monadTestnet" | "baseMainnet";
}

export function EventCard({
  id,
  name,
  startTime,
  price,
  maxTickets,
  ticketsSold,
  location,
  status,
  chainKey,
}: EventCardProps) {
  const startDate = new Date(startTime);
  const spotsLeft = maxTickets - ticketsSold;

  return (
    <Card className="flex flex-col h-full hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_var(--foreground)] transition-all">
      <CardHeader>
        <div className="flex justify-between items-start">
          <CardTitle className="text-base">{name}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{getChainLabel(chainKey)}</Badge>
            <Badge variant={status === "active" ? "default" : "secondary"}>
              {status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground uppercase text-xs tracking-wider">Date</span>
          <span className="font-mono">
            {startDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground uppercase text-xs tracking-wider">Price</span>
          <span className="font-mono font-bold">
            {price === 0 ? "Free" : `$${price} USDC`}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground uppercase text-xs tracking-wider">Location</span>
          <span className="truncate ml-2 font-mono">{location || "TBD"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground uppercase text-xs tracking-wider">Spots</span>
          <span className="font-mono font-bold">
            {spotsLeft > 0 ? `${spotsLeft} left` : "Sold out"}
          </span>
        </div>
      </CardContent>
      <CardFooter>
        <Link href={`/events/${id}`} className="w-full">
          <Button className="w-full" variant={spotsLeft > 0 ? "default" : "secondary"}>
            {spotsLeft > 0 ? "View & Buy" : "View Details"}
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
