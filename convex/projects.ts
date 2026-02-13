import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./lib/auth";

const projectStatusValidator = v.union(
  v.literal("active"),
  v.literal("archived"),
);

const projectValidator = v.object({
  _id: v.id("projects"),
  _creationTime: v.number(),
  foundationId: v.id("teams"),
  name: v.string(),
  description: v.string(),
  status: projectStatusValidator,
  walletAddress: v.optional(v.string()),
});

export const listAll = query({
  args: {},
  returns: v.array(projectValidator),
  handler: async (ctx) => {
    return await ctx.db.query("projects").order("desc").collect();
  },
});

export const listByFoundation = query({
  args: {
    foundationId: v.id("teams"),
  },
  returns: v.array(projectValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_foundation", (q) => q.eq("foundationId", args.foundationId))
      .collect();
  },
});

export const create = mutation({
  args: {
    foundationId: v.id("teams"),
    name: v.string(),
    description: v.string(),
    walletAddress: v.optional(v.string()),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const foundation = await ctx.db.get(args.foundationId);
    if (!foundation) throw new Error("Foundation not found");

    return await ctx.db.insert("projects", {
      foundationId: args.foundationId,
      name: args.name,
      description: args.description,
      status: "active" as const,
      walletAddress: args.walletAddress,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    walletAddress: v.optional(v.string()),
    status: v.optional(projectStatusValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const project = await ctx.db.get(args.id);
    if (!project) throw new Error("Project not found");

    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.description !== undefined) patch.description = args.description;
    if (args.walletAddress !== undefined) patch.walletAddress = args.walletAddress;
    if (args.status !== undefined) patch.status = args.status;

    await ctx.db.patch(args.id, patch);
    return null;
  },
});

export const archive = mutation({
  args: {
    id: v.id("projects"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const project = await ctx.db.get(args.id);
    if (!project) throw new Error("Project not found");

    await ctx.db.patch(args.id, { status: "archived" as const });
    return null;
  },
});
