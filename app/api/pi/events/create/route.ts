import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../convex/_generated/api";
import { executePiAction } from "../../../../../lib/piAgent";

function getConvexClient() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(convexUrl);
}

export async function POST(request: Request) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const convex = getConvexClient();
    const user = await convex.query(api.users.getByClerkId, { clerkId: clerkUserId });
    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

    const args = (await request.json()) as Record<string, unknown>;
    const result = await executePiAction({
      source: "api",
      rawInput: "/create",
      intent: "create_event",
      args,
      userId: user._id,
    });

    return NextResponse.json(result, { status: result.ok ? 201 : 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Event creation failed" },
      { status: 500 },
    );
  }
}
