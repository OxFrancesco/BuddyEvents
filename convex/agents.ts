/// convex/agents.ts — Agent registration and management
/// Agents are AI entities that act on behalf of humans

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getByWallet = query({
  args: { walletAddress: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("agents"),
      _creationTime: v.number(),
      name: v.string(),
      walletAddress: v.string(),
      ownerAddress: v.string(),
      status: v.union(v.literal("active"), v.literal("suspended")),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .unique();
  },
});

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("agents"),
      _creationTime: v.number(),
      name: v.string(),
      walletAddress: v.string(),
      ownerAddress: v.string(),
      status: v.union(v.literal("active"), v.literal("suspended")),
    }),
  ),
  handler: async (ctx) => {
    return await ctx.db.query("agents").collect();
  },
});

export const register = mutation({
  args: {
    name: v.string(),
    walletAddress: v.string(),
    ownerAddress: v.string(),
  },
  returns: v.id("agents"),
  handler: async (ctx, args) => {
    // Check if agent already exists with this wallet
    const existing = await ctx.db
      .query("agents")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .unique();

    if (existing) throw new Error("Agent already registered with this wallet");

    return await ctx.db.insert("agents", {
      name: args.name,
      walletAddress: args.walletAddress,
      ownerAddress: args.ownerAddress,
      status: "active" as const,
    });
  },
});
