import { json, type RequestHandler } from "@sveltejs/kit";
import { api } from "@/convex/_generated/api";
import { userOwnsAddress } from "@/lib/walletOwnership";
import {
  getConvexClient,
  getConvexServiceToken,
  getUserByClerkId,
} from "$lib/server/services/convex";

export const GET: RequestHandler = async (event) => {
  const wallet = event.url.searchParams.get("wallet");
  if (!wallet) {
    return json({ error: "wallet parameter required" }, { status: 400 });
  }

  try {
    const convex = getConvexClient();
    const agent = await convex.query(api.agents.getByWallet, {
      walletAddress: wallet,
    });
    if (!agent) {
      return json({ error: "Agent not found" }, { status: 404 });
    }
    return json({ agent });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Lookup failed" },
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
    const serviceToken = getConvexServiceToken();
    const user = await getUserByClerkId(clerkUserId);
    if (!user) {
      return json({ error: "User profile not found" }, { status: 404 });
    }

    const body = await event.request.json();
    if (
      user.role !== "admin" &&
      !(await userOwnsAddress({
        convex,
        user,
        address: body.ownerAddress,
        serviceToken,
      }))
    ) {
      return json({ error: "Forbidden" }, { status: 403 });
    }

    const agentId = await convex.mutation(api.agents.register, {
      name: body.name,
      walletAddress: body.walletAddress,
      ownerAddress: body.ownerAddress,
      serviceToken,
    });

    return json({ agentId }, { status: 201 });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Registration failed" },
      { status: 400 },
    );
  }
};
