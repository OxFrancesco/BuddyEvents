import { json, type RequestHandler } from "@sveltejs/kit";
import { approveHumanTransaction } from "@/lib/crossmint/server";
import { getConvexClient, getUserByClerkId } from "$lib/server/services/convex";

export const POST: RequestHandler = async (event) => {
  try {
    const clerkUserId = event.locals.clerk.userId;
    if (!clerkUserId) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    const transactionId = event.params.id;
    if (!transactionId) {
      return json({ error: "Transaction ID is required" }, { status: 400 });
    }

    const body = (await event.request.json()) as {
      signerAddress?: string;
      signature?: string;
    };

    if (!body.signerAddress || !body.signature) {
      return json(
        { error: "signerAddress and signature are required" },
        { status: 400 },
      );
    }

    const convex = getConvexClient();
    const actor = await getUserByClerkId(clerkUserId);
    if (!actor) {
      return json({ error: "User profile not found" }, { status: 404 });
    }

    const response = await approveHumanTransaction({
      convex,
      userId: actor._id,
      transactionId,
      signerAddress: body.signerAddress,
      signature: body.signature,
    });

    return json({ ok: true, ...response });
  } catch (error) {
    return json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Crossmint transaction approval failed",
      },
      { status: 500 },
    );
  }
};
