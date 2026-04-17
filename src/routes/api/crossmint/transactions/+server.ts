import { json, type RequestHandler } from "@sveltejs/kit";
import type { Id } from "@/convex/_generated/dataModel";
import {
  createHumanApproveTransaction,
  createHumanBuyTicketTransaction,
} from "@/lib/crossmint/server";
import { getConvexClient, getUserByClerkId } from "$lib/server/services/convex";

async function getActor(clerkUserId: string) {
  const actor = await getUserByClerkId(clerkUserId);
  if (!actor) {
    throw new Error("User profile not found");
  }
  return actor;
}

export const POST: RequestHandler = async (event) => {
  try {
    const clerkUserId = event.locals.clerk.userId;
    if (!clerkUserId) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await event.request.json()) as {
      kind?: "approve_ticket_purchase" | "buy_ticket";
      eventId?: string;
      signerAddress?: string;
    };

    if (!body.kind || !body.eventId || !body.signerAddress) {
      return json(
        { error: "kind, eventId, and signerAddress are required" },
        { status: 400 },
      );
    }

    const convex = getConvexClient();
    const actor = await getActor(clerkUserId);
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

    return json({ ok: true, ...response });
  } catch (error) {
    return json(
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
};
