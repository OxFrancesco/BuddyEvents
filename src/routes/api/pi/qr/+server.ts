import { json, type RequestHandler } from "@sveltejs/kit";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { userOwnsAddress } from "@/lib/walletOwnership";
import {
  getConvexClient,
  getConvexServiceToken,
  getUserByClerkId,
} from "$lib/server/services/convex";

export const GET: RequestHandler = async (event) => {
  try {
    const clerkUserId = event.locals.clerk.userId;
    if (!clerkUserId) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const ticketId = event.url.searchParams.get("ticketId");
    if (!ticketId) {
      return json({ error: "ticketId is required" }, { status: 400 });
    }

    const convex = getConvexClient();
    const serviceToken = getConvexServiceToken();
    const user = await getUserByClerkId(clerkUserId);
    if (!user) {
      return json({ error: "User profile not found" }, { status: 404 });
    }

    const ticket = await convex.query(api.tickets.get, {
      id: ticketId as Id<"tickets">,
      serviceToken,
    });
    if (!ticket) {
      return json({ error: "Ticket not found" }, { status: 404 });
    }

    if (
      !(await userOwnsAddress({
        convex,
        user,
        address: ticket.buyerAddress,
        serviceToken,
      }))
    ) {
      return json({ error: "You do not own this ticket" }, { status: 403 });
    }

    const issued = await convex.mutation(api.qr.issueForTicket, {
      ticketId: ticket._id,
      eventId: ticket.eventId,
      userId: user._id,
      serviceToken,
    });

    return json({ ok: true, qr: issued });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load QR",
      },
      { status: 500 },
    );
  }
};
