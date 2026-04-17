import { json, type RequestHandler } from "@sveltejs/kit";
import { ensureHumanCrossmintWalletForUser } from "@/lib/crossmint/server";
import { getClerkClient } from "$lib/server/services/clerk";
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

    const body = (await event.request.json()) as {
      signerAddress?: string;
      forceRelink?: boolean;
    };
    if (!body.signerAddress) {
      return json({ error: "signerAddress is required" }, { status: 400 });
    }

    const convex = getConvexClient();
    const clerkClient = getClerkClient();
    const user = await ensureUserByClerkId(clerkUserId);
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    const email = clerkUser.primaryEmailAddress?.emailAddress;

    if (!email) {
      return json(
        {
          error:
            "A primary email is required before provisioning a smart wallet.",
        },
        { status: 400 },
      );
    }

    const wallet = await ensureHumanCrossmintWalletForUser({
      convex,
      user,
      email,
      signerAddress: body.signerAddress,
      forceRelink: body.forceRelink,
    });

    return json({ ok: true, wallet, relinked: !!body.forceRelink });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Crossmint wallet provisioning failed";
    const status = message.toLowerCase().includes("confirmation required")
      ? 409
      : 500;
    return json({ ok: false, error: message }, { status });
  }
};
