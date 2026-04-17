import { json, type RequestHandler } from "@sveltejs/kit";
import { ensureAutomationCrossmintWalletForUser } from "@/lib/crossmint/server";
import {
  ensureUserByClerkId,
  getConvexClient,
} from "$lib/server/services/convex";

export const POST: RequestHandler = async (event) => {
  try {
    const clerkUserId = event.locals.clerk.userId;
    if (!clerkUserId) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    if (
      event.request.headers.get("content-type")?.includes("application/json")
    ) {
      await event.request.json().catch(() => null);
    }

    const user = await ensureUserByClerkId(clerkUserId);
    const convex = getConvexClient();
    const wallet = await ensureAutomationCrossmintWalletForUser({
      convex,
      user,
    });

    return json({
      ok: true,
      chainKey: wallet.chainKey,
      wallet,
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Wallet link failed",
      },
      { status: 500 },
    );
  }
};
