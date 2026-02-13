import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

function getConvexClient() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(convexUrl);
}

function getConvexServiceToken() {
  const token = process.env.CONVEX_SERVICE_TOKEN;
  if (!token) throw new Error("CONVEX_SERVICE_TOKEN is not set");
  return token;
}

function sameAddress(a?: string, b?: string) {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export async function GET(request: Request) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const ticketId = url.searchParams.get("ticketId");
    if (!ticketId) {
      return NextResponse.json({ error: "ticketId is required" }, { status: 400 });
    }

    const convex = getConvexClient();
    const serviceToken = getConvexServiceToken();
    const user = await convex.query(api.users.getByClerkId, {
      clerkId: clerkUserId,
      serviceToken,
    });
    if (!user) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const ticket = await convex.query(api.tickets.get, {
      id: ticketId as Id<"tickets">,
      serviceToken,
    });
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const linkedWallet = await convex.query(api.wallets.getByUser, {
      userId: user._id,
      serviceToken,
    });
    if (
      !sameAddress(user.walletAddress ?? undefined, ticket.buyerAddress) &&
      !sameAddress(linkedWallet?.walletAddress, ticket.buyerAddress)
    ) {
      return NextResponse.json(
        { error: "You do not own this ticket" },
        { status: 403 },
      );
    }

    const issued = await convex.mutation(api.qr.issueForTicket, {
      ticketId: ticket._id,
      eventId: ticket.eventId,
      userId: user._id,
      serviceToken,
    });

    return NextResponse.json({ ok: true, qr: issued });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load QR" },
      { status: 500 },
    );
  }
}
