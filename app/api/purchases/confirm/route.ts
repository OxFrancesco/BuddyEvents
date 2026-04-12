import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { parseJson, startWorkflowAndRun } from "../../../../lib/effect/workflows";
import { resolveIdempotencyKey } from "../../../../lib/idempotency";

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
      eventId?: string;
      buyerAddress?: string;
      txHash?: string;
      purchasePrice?: number;
    };

    if (!body.eventId || !body.buyerAddress || !body.txHash) {
      return NextResponse.json(
        { error: "eventId, buyerAddress, and txHash are required" },
        { status: 400 },
      );
    }

    const { userId: clerkUserId } = await auth();
    const convex = getConvexClient();
    const serviceToken = getConvexServiceToken();
    const actor = clerkUserId
      ? await convex.query(api.users.getByClerkId, {
          clerkId: clerkUserId,
          serviceToken,
        })
      : null;

    const idempotencyKey = resolveIdempotencyKey({
      explicitKey:
        request.headers.get("Idempotency-Key") ??
        request.headers.get("idempotency-key") ??
        undefined,
      fallbackNamespace: "wallet-purchase-confirm",
      fallbackParts: [body.eventId, body.buyerAddress, body.txHash],
    });

    const workflow = await startWorkflowAndRun({
      workflowName: "ticket_purchase",
      idempotencyKey,
      source: "wallet_confirm",
      actorUserId: actor?._id,
      payload: {
        eventId: body.eventId as Id<"events">,
        buyerAddress: body.buyerAddress,
        purchasePrice: body.purchasePrice ?? 0,
        purchaseSource: "wallet" as const,
        purchaseReference: idempotencyKey,
        txHash: body.txHash,
      },
    });

    const result = parseJson<{
      ticketId: string;
      qrToken: string;
      qrTokenExpiresAt: number;
      txHash: string;
    }>(workflow.completed?.resultJson);

    if (!result) {
      return NextResponse.json(
        {
          ok: true,
          workflowId: workflow.execution._id,
          status: workflow.completed?.status ?? workflow.execution.status,
        },
        { status: 202 },
      );
    }

    return NextResponse.json({
      ok: true,
      workflowId: workflow.execution._id,
      status: workflow.completed?.status ?? "completed",
      ticketId: result.ticketId,
      qrToken: result.qrToken,
      qrTokenExpiresAt: result.qrTokenExpiresAt,
      txHash: result.txHash,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to confirm wallet purchase",
      },
      { status: 500 },
    );
  }
}
