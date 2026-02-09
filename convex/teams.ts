/// convex/teams.ts — Team management
/// CRUD for event organizer teams

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("teams"),
      _creationTime: v.number(),
      name: v.string(),
      description: v.string(),
      walletAddress: v.string(),
      members: v.array(v.string()),
    }),
  ),
  handler: async (ctx) => {
    return await ctx.db.query("teams").collect();
  },
});

export const get = query({
  args: { id: v.id("teams") },
  returns: v.union(
    v.object({
      _id: v.id("teams"),
      _creationTime: v.number(),
      name: v.string(),
      description: v.string(),
      walletAddress: v.string(),
      members: v.array(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    walletAddress: v.string(),
    members: v.array(v.string()),
  },
  returns: v.id("teams"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("teams", {
      name: args.name,
      description: args.description,
      walletAddress: args.walletAddress,
      members: args.members,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("teams"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    walletAddress: v.optional(v.string()),
    members: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.id);
    if (!team) throw new Error("Team not found");

    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.description !== undefined) patch.description = args.description;
    if (args.walletAddress !== undefined)
      patch.walletAddress = args.walletAddress;
    if (args.members !== undefined) patch.members = args.members;

    await ctx.db.patch(args.id, patch);
    return null;
  },
});
