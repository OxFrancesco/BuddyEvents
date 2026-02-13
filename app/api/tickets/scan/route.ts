/// app/api/tickets/scan/route.ts — Organizer ticket scan/check-in endpoint

import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

function getConvexClient() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  }
  return new ConvexHttpClient(convexUrl);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const qrCode = typeof body.qrCode === "string" ? body.qrCode.trim() : "";
    const organizerAddress =
      typeof body.organizerAddress === "string"
        ? body.organizerAddress.trim()
        : "";

    if (!qrCode || !organizerAddress) {
      return NextResponse.json(
        { error: "qrCode and organizerAddress are required" },
        { status: 400 },
      );
    }

    const convex = getConvexClient();
    const result = await convex.mutation(api.tickets.scanForCheckIn, {
      qrCode,
      organizerAddress,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scan failed" },
      { status: 500 },
    );
  }
}
