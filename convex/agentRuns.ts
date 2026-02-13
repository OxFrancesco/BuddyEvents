import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireSignedInUserOrService } from "./lib/auth";

const sourceValidator = v.union(
  v.literal("telegram_bot"),
  v.literal("telegram_mini_app"),
  v.literal("api"),
);

const statusValidator = v.union(
  v.literal("started"),
  v.literal("success"),
  v.literal("failed"),
);

const runValidator = v.object({
  _id: v.id("agentRuns"),
  _creationTime: v.number(),
  userId: v.optional(v.id("users")),
  source: sourceValidator,
  intent: v.string(),
  rawInput: v.string(),
  normalizedArgs: v.optional(v.string()),
  status: statusValidator,
  response: v.optional(v.string()),
  error: v.optional(v.string()),
  txHash: v.optional(v.string()),
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
});

export const startRun = mutation({
  args: {
    userId: v.optional(v.id("users")),
    source: sourceValidator,
    intent: v.string(),
    rawInput: v.string(),
    normalizedArgs: v.optional(v.string()),
    serviceToken: v.optional(v.string()),
  },
  returns: v.id("agentRuns"),
  handler: async (ctx, args) => {
    await requireSignedInUserOrService(ctx, args.serviceToken);

    return await ctx.db.insert("agentRuns", {
      userId: args.userId,
      source: args.source,
      intent: args.intent,
      rawInput: args.rawInput,
      normalizedArgs: args.normalizedArgs,
      status: "started",
      startedAt: Date.now(),
    });
  },
});

export const finishRun = mutation({
  args: {
    runId: v.id("agentRuns"),
    status: v.union(v.literal("success"), v.literal("failed")),
    response: v.optional(v.string()),
    error: v.optional(v.string()),
    txHash: v.optional(v.string()),
    serviceToken: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSignedInUserOrService(ctx, args.serviceToken);

    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Agent run not found");

    await ctx.db.patch(args.runId, {
      status: args.status,
      response: args.response,
      error: args.error,
      txHash: args.txHash,
      finishedAt: Date.now(),
    });
    return null;
  },
});

export const listByUser = query({
  args: {
    userId: v.id("users"),
    serviceToken: v.optional(v.string()),
  },
  returns: v.array(runValidator),
  handler: async (ctx, args) => {
    const actor = await requireSignedInUserOrService(ctx, args.serviceToken);
    if (actor && actor.role !== "admin" && actor._id !== args.userId) {
      throw new Error("Forbidden");
    }

    return await ctx.db
      .query("agentRuns")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
  },
});
