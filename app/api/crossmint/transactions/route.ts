import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { auth } from "@clerk/nextjs/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  createHumanApproveTransaction,
  createHumanBuyTicketTransaction,
} from "@/lib/crossmint/server";

function getConvexClient() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  }
  return new ConvexHttpClient(convexUrl);
}

function getConvexServiceToken() {
  const token = process.env.CONVEX_SERVICE_TOKEN;
  if (!token) {
    throw new Error("CONVEX_SERVICE_TOKEN is not set");
  }
  return token;
}

async function getActor(convex: ConvexHttpClient, clerkUserId: string) {
  const actor = await convex.query(api.users.getByClerkId, {
    clerkId: clerkUserId,
    serviceToken: getConvexServiceToken(),
  });
  if (!actor) {
    throw new Error("User profile not found");
  }
  return actor;
}

export async function POST(request: Request) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      kind?: "approve_ticket_purchase" | "buy_ticket";
      eventId?: string;
      signerAddress?: string;
    };

    if (!body.kind || !body.eventId || !body.signerAddress) {
      return NextResponse.json(
        { error: "kind, eventId, and signerAddress are required" },
        { status: 400 },
      );
    }

    const convex = getConvexClient();
    const actor = await getActor(convex, clerkUserId);

    const response =
      body.kind === "approve_ticket_purchase"
        ? await createHumanApproveTransaction({
            convex,
            userId: actor._id,
            signerAddress: body.signerAddress,
            eventId: body.eventId as Id<"events">,
          })
        : await createHumanBuyTicketTransaction({
            convex,
            userId: actor._id,
            signerAddress: body.signerAddress,
            eventId: body.eventId as Id<"events">,
          });

    return NextResponse.json({ ok: true, ...response });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Crossmint transaction creation failed",
      },
      { status: 500 },
    );
  }
}
