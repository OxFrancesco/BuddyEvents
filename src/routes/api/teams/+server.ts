import { json, type RequestHandler } from "@sveltejs/kit";
import { api } from "@/convex/_generated/api";
import {
  getConvexClient,
  getConvexServiceToken,
  getUserByClerkId,
} from "$lib/server/services/convex";

export const GET: RequestHandler = async () => {
  try {
    const convex = getConvexClient();
    const teams = await convex.query(api.teams.list, {});
    return json({ teams });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Failed to list teams",
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

    const caller = await getUserByClerkId(clerkUserId);
    if (!caller || caller.role !== "admin") {
      return json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await event.request.json();
    const convex = getConvexClient();
    const teamId = await convex.mutation(api.teams.create, {
      name: body.name,
      description: body.description ?? "",
      walletAddress: body.walletAddress,
      members: body.members ?? [],
      serviceToken: getConvexServiceToken(),
    });

    return json({ teamId }, { status: 201 });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Failed to create team",
      },
      { status: 400 },
    );
  }
};
