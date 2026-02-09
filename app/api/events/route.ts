/// app/api/events/route.ts — REST API for events (CLI and agent access)
/// GET: list events, POST: create event

import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

function getConvexClient() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  }
  return new ConvexHttpClient(convexUrl);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticketsQuery = url.searchParams.get("tickets");
  const eventId = url.searchParams.get("eventId");
  const buyer = url.searchParams.get("buyer");
  const status = url.searchParams.get("status") as
    | "draft"
    | "active"
    | "ended"
    | "cancelled"
    | null;

  try {
    const convex = getConvexClient();
    if (ticketsQuery === "true" && eventId) {
      const tickets = await convex.query(api.tickets.listByEvent, {
        eventId: eventId as Id<"events">,
      });
      return NextResponse.json({ tickets });
    }
    if (ticketsQuery === "true" && buyer) {
      const tickets = await convex.query(api.tickets.listByBuyer, {
        buyerAddress: buyer,
      });
      return NextResponse.json({ tickets });
    }
    const events = await convex.query(api.events.list, {
      status: status ?? undefined,
    });
    return NextResponse.json({ events });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list events" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const convex = getConvexClient();
    const body = await request.json();
    if (body.action === "cancel") {
      await convex.mutation(api.events.cancel, {
        id: body.eventId as Id<"events">,
      });
      return NextResponse.json({ ok: true });
    }

    const eventId = await convex.mutation(api.events.create, {
      name: body.name,
      description: body.description ?? "",
      startTime: body.startTime,
      endTime: body.endTime,
      price: body.price,
      maxTickets: body.maxTickets,
      teamId: body.teamId,
      sponsors: body.sponsors ?? [],
      location: body.location ?? "",
      creatorAddress: body.creatorAddress,
    });

    return NextResponse.json({ eventId }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create event" },
      { status: 400 },
    );
  }
}
