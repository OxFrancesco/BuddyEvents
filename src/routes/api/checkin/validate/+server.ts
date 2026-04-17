import { json, type RequestHandler } from "@sveltejs/kit";
import { api } from "@/convex/_generated/api";
import {
  getConvexClient,
  getConvexServiceToken,
  getUserByClerkId,
} from "$lib/server/services/convex";

export const POST: RequestHandler = async (event) => {
  try {
    const clerkUserId = event.locals.clerk.userId;
    if (!clerkUserId) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await event.request.json()) as { token?: string };
    const token = body.token?.trim();
    if (!token) {
      return json({ error: "token is required" }, { status: 400 });
    }

    const convex = getConvexClient();
    const serviceToken = getConvexServiceToken();
    const user = await getUserByClerkId(clerkUserId);
    if (!user || user.role !== "admin") {
      return json({ error: "Admin access required" }, { status: 403 });
    }

    const result = await convex.mutation(api.qr.validateAndCheckIn, {
      token,
      checkedInByUserId: user._id,
      serviceToken,
    });

    return json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Check-in failed",
      },
      { status: 500 },
    );
  }
};
