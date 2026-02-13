/// convex/sponsors.ts — Sponsor management
/// CRUD for event sponsors

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdminOrService } from "./lib/auth";

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
    serviceToken: v.optional(v.string()),
  },
  returns: v.id("sponsors"),
  handler: async (ctx, args) => {
    await requireAdminOrService(ctx, args.serviceToken);

    return await ctx.db.insert("sponsors", {
      name: args.name,
      logo: args.logo,
      walletAddress: args.walletAddress,
      contribution: args.contribution,
    });
  },
});
