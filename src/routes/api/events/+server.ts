import { json, type RequestHandler } from "@sveltejs/kit";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { normalizeSupportedChainKey } from "@/lib/chains";
import { parseJson, startWorkflowAndRun } from "@/lib/effect/workflows";
import { resolveIdempotencyKey } from "@/lib/idempotency";
import { userOwnsAddress } from "@/lib/walletOwnership";
import {
  getConvexClient,
  getConvexServiceToken,
  getUserByClerkId,
} from "$lib/server/services/convex";

export const GET: RequestHandler = async (event) => {
  const ticketsQuery = event.url.searchParams.get("tickets");
  const eventId = event.url.searchParams.get("eventId");
  const buyer = event.url.searchParams.get("buyer");
  const status = event.url.searchParams.get("status") as
    | "draft"
    | "active"
    | "ended"
    | "cancelled"
    | null;
  const moderationStatus = event.url.searchParams.get("moderationStatus") as
    | "pending"
    | "approved"
    | "rejected"
    | null;

  try {
    const convex = getConvexClient();
    const serviceToken = getConvexServiceToken();

    if (ticketsQuery === "true" && eventId) {
      const clerkUserId = event.locals.clerk.userId;
      if (!clerkUserId) {
        return json({ error: "Unauthorized" }, { status: 401 });
      }

      const caller = await getUserByClerkId(clerkUserId);
      if (!caller || caller.role !== "admin") {
        return json({ error: "Admin access required" }, { status: 403 });
      }

      const tickets = await convex.query(api.tickets.listByEvent, {
        eventId: eventId as Id<"events">,
        serviceToken,
      });
      return json({ tickets });
    }

    if (ticketsQuery === "true" && buyer) {
      const clerkUserId = event.locals.clerk.userId;
      if (!clerkUserId) {
        return json({ error: "Unauthorized" }, { status: 401 });
      }

      const caller = await getUserByClerkId(clerkUserId);
      if (!caller) {
        return json({ error: "User profile not found" }, { status: 404 });
      }

      if (
        caller.role !== "admin" &&
        !(await userOwnsAddress({
          convex,
          user: caller,
          address: buyer,
          serviceToken,
        }))
      ) {
        return json({ error: "Forbidden" }, { status: 403 });
      }

      const tickets = await convex.query(api.tickets.listByBuyer, {
        buyerAddress: buyer,
        serviceToken,
      });
      return json({ tickets });
    }

    const events = await convex.query(api.events.list, {
      status: status ?? undefined,
      moderationStatus: moderationStatus ?? undefined,
    });
    return json({ events });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Failed to list events",
      },
      { status: 500 },
    );
  }
};

export const POST: RequestHandler = async (event) => {
  try {
    const clerkUserId = event.locals.clerk.userId;
    if (!clerkUserId) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const convex = getConvexClient();
    const caller = await getUserByClerkId(clerkUserId);
    if (!caller || caller.role !== "admin") {
      return json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await event.request.json();
    if (body.action === "cancel") {
      await convex.mutation(api.events.cancel, {
        id: body.eventId as Id<"events">,
        serviceToken: getConvexServiceToken(),
      });
      return json({ ok: true });
    }

    const idempotencyKey = resolveIdempotencyKey({
      explicitKey:
        event.request.headers.get("Idempotency-Key") ??
        event.request.headers.get("idempotency-key") ??
        undefined,
      fallbackNamespace: "create-event",
      fallbackParts: [
        body.name,
        String(body.startTime),
        String(body.endTime),
        body.teamId,
        body.creatorAddress,
        body.chainKey,
      ],
    });
    const chainKey = normalizeSupportedChainKey(body.chainKey);

    const workflow = await startWorkflowAndRun({
      workflowName: "create_event",
      idempotencyKey,
      source: "admin_api",
      actorUserId: caller._id,
      payload: {
        name: body.name,
        description: body.description ?? "",
        startTime: body.startTime,
        endTime: body.endTime,
        price: body.price,
        maxTickets: body.maxTickets,
        chainKey,
        teamId: body.teamId,
        sponsors: body.sponsors ?? [],
        location: body.location ?? "",
        creatorAddress: body.creatorAddress,
        creatorUserId: caller._id,
        chainReference: idempotencyKey,
      },
    });
    const result = parseJson<{
      eventId: string;
      onChainEventId: number;
      txHash: string;
    }>(workflow.completed?.resultJson);

    if (!result) {
      return json(
        {
          workflowId: workflow.execution._id,
          status: workflow.completed?.status ?? workflow.execution.status,
        },
        { status: 202 },
      );
    }

    return json(
      {
        eventId: result.eventId,
        workflowId: workflow.execution._id,
        onChainEventId: result.onChainEventId,
        txHash: result.txHash,
      },
      { status: 201 },
    );
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create event",
      },
      { status: 400 },
    );
  }
};
