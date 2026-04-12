import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireServiceAccess, requireSignedInUserOrService } from "./lib/auth";

const workflowNameValidator = v.union(
  v.literal("ticket_purchase"),
  v.literal("create_event"),
  v.literal("provision_wallet"),
  v.literal("provision_circle_wallet"),
  v.literal("refresh_qr"),
  v.literal("telegram_command"),
);

const workflowStatusValidator = v.union(
  v.literal("pending"),
  v.literal("in_progress"),
  v.literal("waiting_retry"),
  v.literal("completed"),
  v.literal("failed"),
);

const workflowStepStatusValidator = v.union(
  v.literal("started"),
  v.literal("completed"),
  v.literal("failed"),
);

function canAccessExecution(
  actor: Doc<"users"> | null,
  execution: Doc<"workflowExecutions">,
) {
  if (!actor) return true;
  if (actor.role === "admin") return true;
  return execution.actorUserId === actor._id;
}

export const startOrGet = mutation({
  args: {
    workflowName: workflowNameValidator,
    idempotencyKey: v.string(),
    source: v.string(),
    actorUserId: v.optional(v.id("users")),
    payloadJson: v.string(),
    serviceToken: v.optional(v.string()),
    nextRunAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireSignedInUserOrService(ctx, args.serviceToken);
    if (
      actor &&
      actor.role !== "admin" &&
      args.actorUserId !== undefined &&
      args.actorUserId !== actor._id
    ) {
      throw new Error("Forbidden");
    }

    const existing = await ctx.db
      .query("workflowExecutions")
      .withIndex("by_workflow_name_and_idempotency_key", (q) =>
        q
          .eq("workflowName", args.workflowName)
          .eq("idempotencyKey", args.idempotencyKey),
      )
      .unique();
    if (existing) return existing;

    const now = Date.now();
    const id = await ctx.db.insert("workflowExecutions", {
      workflowName: args.workflowName,
      idempotencyKey: args.idempotencyKey,
      source: args.source,
      actorUserId: args.actorUserId,
      status: "pending",
      payloadJson: args.payloadJson,
      resultJson: undefined,
      errorJson: undefined,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      nextRunAt: args.nextRunAt ?? now,
      attempt: 0,
      startedAt: undefined,
      updatedAt: now,
      finishedAt: undefined,
    });

    const created = await ctx.db.get(id);
    if (!created) throw new Error("Failed to create workflow execution");
    return created;
  },
});

export const get = query({
  args: {
    id: v.id("workflowExecutions"),
    serviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireSignedInUserOrService(ctx, args.serviceToken);
    const execution = await ctx.db.get(args.id);
    if (!execution) return null;
    if (!canAccessExecution(actor, execution)) throw new Error("Forbidden");
    return execution;
  },
});

export const list = query({
  args: {
    status: v.optional(workflowStatusValidator),
    limit: v.optional(v.number()),
    serviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireSignedInUserOrService(ctx, args.serviceToken);
    const executions = args.status
      ? await ctx.db
          .query("workflowExecutions")
          .withIndex("by_status_and_next_run", (q) =>
            q.eq("status", args.status!).gte("nextRunAt", 0),
          )
          .collect()
      : await ctx.db.query("workflowExecutions").collect();

    const filtered = executions
      .filter((execution) => canAccessExecution(actor, execution))
      .sort((a, b) => b.updatedAt - a.updatedAt);

    return filtered.slice(0, args.limit ?? 50);
  },
});

export const listSteps = query({
  args: {
    executionId: v.id("workflowExecutions"),
    serviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireSignedInUserOrService(ctx, args.serviceToken);
    const execution = await ctx.db.get(args.executionId);
    if (!execution) return [];
    if (!canAccessExecution(actor, execution)) throw new Error("Forbidden");

    const steps = await ctx.db
      .query("workflowSteps")
      .withIndex("by_execution", (q) => q.eq("executionId", args.executionId))
      .collect();
    return steps.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const appendStep = mutation({
  args: {
    executionId: v.id("workflowExecutions"),
    stepName: v.string(),
    status: workflowStepStatusValidator,
    attempt: v.number(),
    inputJson: v.optional(v.string()),
    outputJson: v.optional(v.string()),
    errorJson: v.optional(v.string()),
    externalReference: v.optional(v.string()),
    serviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceAccess(args.serviceToken);
    const now = Date.now();
    const id = await ctx.db.insert("workflowSteps", {
      executionId: args.executionId,
      stepName: args.stepName,
      status: args.status,
      attempt: args.attempt,
      inputJson: args.inputJson,
      outputJson: args.outputJson,
      errorJson: args.errorJson,
      externalReference: args.externalReference,
      createdAt: now,
      updatedAt: now,
    });
    const step = await ctx.db.get(id);
    if (!step) throw new Error("Failed to append workflow step");
    return step;
  },
});

export const claimDue = mutation({
  args: {
    workerId: v.string(),
    limit: v.optional(v.number()),
    serviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceAccess(args.serviceToken);
    const now = Date.now();
    const leaseDurationMs = 60_000;
    const max = Math.max(1, Math.min(args.limit ?? 10, 50));

    const candidates = [
      ...(await ctx.db
        .query("workflowExecutions")
        .withIndex("by_status_and_next_run", (q) =>
          q.eq("status", "pending").lte("nextRunAt", now),
        )
        .collect()),
      ...(await ctx.db
        .query("workflowExecutions")
        .withIndex("by_status_and_next_run", (q) =>
          q.eq("status", "waiting_retry").lte("nextRunAt", now),
        )
        .collect()),
      ...(await ctx.db
        .query("workflowExecutions")
        .withIndex("by_status_and_next_run", (q) =>
          q.eq("status", "in_progress").lte("nextRunAt", now),
        )
        .collect()),
    ]
      .filter(
        (execution) =>
          execution.status !== "in_progress" ||
          (execution.leaseExpiresAt ?? 0) <= now,
      )
      .sort((a, b) => a.nextRunAt - b.nextRunAt);

    const claimed: Array<Doc<"workflowExecutions">> = [];

    for (const execution of candidates.slice(0, max)) {
      await ctx.db.patch(execution._id, {
        status: "in_progress",
        leaseOwner: args.workerId,
        leaseExpiresAt: now + leaseDurationMs,
        nextRunAt: now,
        attempt: execution.attempt + 1,
        startedAt: execution.startedAt ?? now,
        updatedAt: now,
      });
      const patched = await ctx.db.get(execution._id);
      if (patched) claimed.push(patched);
    }

    return claimed;
  },
});

export const heartbeat = mutation({
  args: {
    id: v.id("workflowExecutions"),
    workerId: v.string(),
    serviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceAccess(args.serviceToken);
    const execution = await ctx.db.get(args.id);
    if (!execution) return null;
    if (execution.leaseOwner !== args.workerId) {
      throw new Error("Workflow lease owned by another worker");
    }
    const now = Date.now();
    await ctx.db.patch(args.id, {
      leaseExpiresAt: now + 60_000,
      updatedAt: now,
    });
    return await ctx.db.get(args.id);
  },
});

export const complete = mutation({
  args: {
    id: v.id("workflowExecutions"),
    resultJson: v.optional(v.string()),
    serviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceAccess(args.serviceToken);
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "completed",
      resultJson: args.resultJson,
      errorJson: undefined,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      updatedAt: now,
      finishedAt: now,
    });
    return await ctx.db.get(args.id);
  },
});

export const fail = mutation({
  args: {
    id: v.id("workflowExecutions"),
    errorJson: v.string(),
    retryAt: v.optional(v.number()),
    serviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceAccess(args.serviceToken);
    const now = Date.now();
    const status = args.retryAt !== undefined ? "waiting_retry" : "failed";
    await ctx.db.patch(args.id, {
      status,
      errorJson: args.errorJson,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      nextRunAt: args.retryAt ?? now,
      updatedAt: now,
      finishedAt: args.retryAt === undefined ? now : undefined,
    });
    return await ctx.db.get(args.id);
  },
});

export const retry = mutation({
  args: {
    id: v.id("workflowExecutions"),
    serviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceAccess(args.serviceToken);
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "pending",
      errorJson: undefined,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      nextRunAt: now,
      updatedAt: now,
      finishedAt: undefined,
    });
    return await ctx.db.get(args.id);
  },
});

export const sweepStale = mutation({
  args: {
    serviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceAccess(args.serviceToken);
    const now = Date.now();
    const running = await ctx.db
      .query("workflowExecutions")
      .withIndex("by_status_and_next_run", (q) =>
        q.eq("status", "in_progress").lte("nextRunAt", now),
      )
      .collect();

    let swept = 0;
    for (const execution of running) {
      if ((execution.leaseExpiresAt ?? 0) > now) continue;
      await ctx.db.patch(execution._id, {
        status: "waiting_retry",
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        nextRunAt: now,
        updatedAt: now,
      });
      swept += 1;
    }

    return swept;
  },
});
