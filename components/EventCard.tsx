/// components/EventCard.tsx — Event card for listings
"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Id } from "../convex/_generated/dataModel";

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
}

export function EventCard({
  id,
  name,
  description,
  startTime,
  price,
  maxTickets,
  ticketsSold,
  location,
  status,
}: EventCardProps) {
  const startDate = new Date(startTime);
  const spotsLeft = maxTickets - ticketsSold;

  return (
    <Card className="flex flex-col hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg">{name}</CardTitle>
          <Badge variant={status === "active" ? "default" : "secondary"}>
            {status}
          </Badge>
        </div>
        <CardDescription className="line-clamp-2">{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Date</span>
          <span>
            {startDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Price</span>
          <span className="font-mono font-semibold">
            {price === 0 ? "Free" : `$${price} USDC`}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Location</span>
          <span className="truncate ml-2">{location || "TBD"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Spots</span>
          <span>
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
