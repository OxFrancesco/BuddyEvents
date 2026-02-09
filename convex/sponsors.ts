/// convex/sponsors.ts — Sponsor management
/// CRUD for event sponsors

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("sponsors"),
      _creationTime: v.number(),
      name: v.string(),
      logo: v.optional(v.string()),
      walletAddress: v.string(),
      contribution: v.optional(v.number()),
    }),
  ),
  handler: async (ctx) => {
    return await ctx.db.query("sponsors").collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    logo: v.optional(v.string()),
    walletAddress: v.string(),
    contribution: v.optional(v.number()),
  },
  returns: v.id("sponsors"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("sponsors", {
      name: args.name,
      logo: args.logo,
      walletAddress: args.walletAddress,
      contribution: args.contribution,
    });
  },
});
