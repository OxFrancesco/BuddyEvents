import { json, type RequestHandler } from "@sveltejs/kit";
import type { Id } from "@/convex/_generated/dataModel";
import { parseJson, startWorkflowAndRun } from "@/lib/effect/workflows";
import { resolveIdempotencyKey } from "@/lib/idempotency";
import { getUserByClerkId } from "$lib/server/services/convex";

export const POST: RequestHandler = async (event) => {
  try {
    const body = (await event.request.json()) as {
      eventId?: string;
      buyerAddress?: string;
      txHash?: string;
      purchasePrice?: number;
    };

    if (!body.eventId || !body.buyerAddress || !body.txHash) {
      return json(
        { error: "eventId, buyerAddress, and txHash are required" },
        { status: 400 },
      );
    }

    const clerkUserId = event.locals.clerk.userId;
    const actor = clerkUserId ? await getUserByClerkId(clerkUserId) : null;

    const idempotencyKey = resolveIdempotencyKey({
      explicitKey:
        event.request.headers.get("Idempotency-Key") ??
        event.request.headers.get("idempotency-key") ??
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
      return json(
        {
          ok: true,
          workflowId: workflow.execution._id,
          status: workflow.completed?.status ?? workflow.execution.status,
        },
        { status: 202 },
      );
    }

    return json({
      ok: true,
      workflowId: workflow.execution._id,
      status: workflow.completed?.status ?? "completed",
      ticketId: result.ticketId,
      qrToken: result.qrToken,
      qrTokenExpiresAt: result.qrTokenExpiresAt,
      txHash: result.txHash,
    });
  } catch (error) {
    return json(
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
};
