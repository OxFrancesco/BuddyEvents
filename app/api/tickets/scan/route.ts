/// app/api/tickets/scan/route.ts — Organizer ticket scan/check-in endpoint

import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../convex/_generated/api";

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

export async function POST(request: Request) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const qrCode = typeof body.qrCode === "string" ? body.qrCode.trim() : "";
    const requestedOrganizerAddress =
      typeof body.organizerAddress === "string"
        ? body.organizerAddress.trim()
        : "";

    if (!qrCode) {
      return NextResponse.json(
        { error: "qrCode is required" },
        { status: 400 },
      );
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
    if (
      user.role !== "admin" &&
      requestedOrganizerAddress &&
      !isSameAddress(user.walletAddress, requestedOrganizerAddress)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await convex.mutation(api.tickets.scanForCheckIn, {
      qrCode,
      organizerAddress: requestedOrganizerAddress || user.walletAddress,
      serviceToken,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scan failed" },
      { status: 500 },
    );
  }
}
