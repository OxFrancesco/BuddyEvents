import { json, type RequestHandler } from "@sveltejs/kit";
import { api } from "@/convex/_generated/api";
import { getCrossmintWalletBalances } from "@/lib/crossmint/server";
import { normalizeSupportedChainKey } from "@/lib/chains";
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

    const chainKey = normalizeSupportedChainKey(
      event.url.searchParams.get("chainKey"),
    );
    const convex = getConvexClient();
    const serviceToken = getConvexServiceToken();
    const user = await getUserByClerkId(clerkUserId);
    if (!user) {
      return json(
        { error: "No profile found. Connect wallet first." },
        { status: 400 },
      );
    }

    const wallet = await convex.query(api.wallets.getByUserAndPurpose, {
      userId: user._id,
      purpose: "automation",
      serviceToken,
    });
    if (!wallet) {
      return json(
        { error: "No linked Crossmint automation wallet found." },
        { status: 404 },
      );
    }

    const balances = await getCrossmintWalletBalances({
      walletAddress: wallet.walletAddress,
      chainKey,
    });
    return json({ ok: true, chainKey, wallet, balances });
  } catch (error) {
    return json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch balance",
      },
      { status: 500 },
    );
  }
};
