import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { executePiAction, type PiIntent, type PiSource } from "../../../../lib/piAgent";

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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      source?: PiSource;
      rawInput?: string;
      intent?: PiIntent;
      args?: Record<string, unknown>;
    };

    const rawInput = body.rawInput?.trim() ?? "";
    if (!rawInput) {
      return NextResponse.json(
        { error: "rawInput is required" },
        { status: 400 },
      );
    }

    const { userId: clerkUserId } = await auth();
    const convex = getConvexClient();
    const serviceToken = getConvexServiceToken();
    let userId: Id<"users"> | undefined;
    if (clerkUserId) {
      let user = await convex.query(api.users.getByClerkId, {
        clerkId: clerkUserId,
        serviceToken,
      });
      if (!user) {
        const createdId = await convex.mutation(api.users.upsertByClerkId, {
          clerkId: clerkUserId,
          serviceToken,
        });
        user = await convex.query(api.users.getById, { userId: createdId, serviceToken });
      }
      userId = user?._id;
    }

    const result = await executePiAction({
      source: body.source ?? "api",
      rawInput,
      intent: body.intent,
      args: body.args,
      userId,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Execution failed",
      },
      { status: 500 },
    );
  }
}
