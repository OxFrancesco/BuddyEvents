import { json, type RequestHandler } from "@sveltejs/kit";
import type { Id } from "@/convex/_generated/dataModel";
import { executePiAction, type PiIntent, type PiSource } from "@/lib/piAgent";
import { ensureUserByClerkId } from "$lib/server/services/convex";

export const POST: RequestHandler = async (event) => {
  try {
    const body = (await event.request.json()) as {
      source?: PiSource;
      rawInput?: string;
      intent?: PiIntent;
      args?: Record<string, unknown>;
    };

    const rawInput = body.rawInput?.trim() ?? "";
    if (!rawInput) {
      return json({ error: "rawInput is required" }, { status: 400 });
    }

    const clerkUserId = event.locals.clerk.userId;
    let userId: Id<"users"> | undefined;

    if (clerkUserId) {
      const user = await ensureUserByClerkId(clerkUserId);
      userId = user?._id;
    }

    const result = await executePiAction({
      source: body.source ?? "api",
      rawInput,
      intent: body.intent,
      args: body.args,
      userId,
    });

    return json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Execution failed",
      },
      { status: 500 },
    );
  }
};
