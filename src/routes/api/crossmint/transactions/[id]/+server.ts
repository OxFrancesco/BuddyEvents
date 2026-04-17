import { json, type RequestHandler } from "@sveltejs/kit";
import { getHumanTransaction } from "@/lib/crossmint/server";
import { getConvexClient, getUserByClerkId } from "$lib/server/services/convex";

export const GET: RequestHandler = async (event) => {
  try {
    const clerkUserId = event.locals.clerk.userId;
    if (!clerkUserId) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    const transactionId = event.params.id;
    if (!transactionId) {
      return json({ error: "Transaction ID is required" }, { status: 400 });
    }

    const convex = getConvexClient();
    const actor = await getUserByClerkId(clerkUserId);
    if (!actor) {
      return json({ error: "User profile not found" }, { status: 404 });
    }

    const response = await getHumanTransaction({
      convex,
      userId: actor._id,
      transactionId,
    });

    return json({ ok: true, ...response });
  } catch (error) {
    return json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Crossmint transaction lookup failed",
      },
      { status: 500 },
    );
  }
};
