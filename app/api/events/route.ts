/// app/api/events/route.ts — REST API for events (CLI and agent access)
/// GET: list events, POST: create event

import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

function getConvexClient() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  }
  return new ConvexHttpClient(convexUrl);
}

function getConvexServiceToken() {
  const token = process.env.CONVEX_SERVICE_TOKEN;
  if (!token) throw new Error("CONVEX_SERVICE_TOKEN is not set");
  return token;
}

function isSameAddress(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
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
  const moderationStatus = url.searchParams.get("moderationStatus") as
    | "pending"
    | "approved"
    | "rejected"
    | null;

  try {
    const convex = getConvexClient();
    const serviceToken = getConvexServiceToken();
    if (ticketsQuery === "true" && eventId) {
      const { userId: clerkUserId } = await auth();
      if (!clerkUserId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const caller = await convex.query(api.users.getByClerkId, {
        clerkId: clerkUserId,
        serviceToken,
      });
      if (!caller || caller.role !== "admin") {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }

      const tickets = await convex.query(api.tickets.listByEvent, {
        eventId: eventId as Id<"events">,
        serviceToken,
      });
      return NextResponse.json({ tickets });
    }
    if (ticketsQuery === "true" && buyer) {
      const { userId: clerkUserId } = await auth();
      if (!clerkUserId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const caller = await convex.query(api.users.getByClerkId, {
        clerkId: clerkUserId,
        serviceToken,
      });
      if (!caller) {
        return NextResponse.json({ error: "User profile not found" }, { status: 404 });
      }
      if (caller.role !== "admin" && !isSameAddress(caller.walletAddress, buyer)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const tickets = await convex.query(api.tickets.listByBuyer, {
        buyerAddress: buyer,
        serviceToken,
      });
      return NextResponse.json({ tickets });
    }
    const events = await convex.query(api.events.list, {
      status: status ?? undefined,
      moderationStatus: moderationStatus ?? undefined,
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
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const convex = getConvexClient();
    const serviceToken = getConvexServiceToken();
    const caller = await convex.query(api.users.getByClerkId, {
      clerkId: clerkUserId,
      serviceToken,
    });
    if (!caller || caller.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    if (body.action === "cancel") {
      await convex.mutation(api.events.cancel, {
        id: body.eventId as Id<"events">,
        serviceToken,
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
      serviceToken,
    });

    return NextResponse.json({ eventId }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create event" },
      { status: 400 },
    );
  }
}
