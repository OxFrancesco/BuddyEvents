import { json, type RequestHandler } from "@sveltejs/kit";
import { executePiAction } from "@/lib/piAgent";
import { getUserByClerkId } from "$lib/server/services/convex";

export const POST: RequestHandler = async (event) => {
  try {
    const clerkUserId = event.locals.clerk.userId;
    if (!clerkUserId) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUserByClerkId(clerkUserId);
    if (!user || user.role !== "admin") {
      return json({ error: "Admin access required" }, { status: 403 });
    }

    const args = (await event.request.json()) as Record<string, unknown>;
    const result = await executePiAction({
      source: "api",
      rawInput: "/create",
      intent: "create_event",
      args,
      userId: user._id,
    });

    return json(result, { status: result.ok ? 201 : 400 });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Event creation failed",
      },
      { status: 500 },
    );
  }
};
