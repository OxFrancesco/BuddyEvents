/// app/api/tickets/scan/route.ts — Organizer ticket scan/check-in endpoint

import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../convex/_generated/api";
import {
  listOwnedAddressesForUser,
  userOwnsAddress,
} from "../../../../lib/walletOwnership";

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
      !(await userOwnsAddress({
        convex,
        user,
        address: requestedOrganizerAddress,
        serviceToken,
      }))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const ownedAddresses =
      user.role === "admin"
        ? []
        : await listOwnedAddressesForUser({ convex, user, serviceToken });

    const result = await convex.mutation(api.tickets.scanForCheckIn, {
      qrCode,
      organizerAddress: requestedOrganizerAddress || ownedAddresses[0],
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
