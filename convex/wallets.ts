import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireSignedInUserOrService } from "./lib/auth";

function isSameAddress(a: string | undefined, b: string): boolean {
  if (!a) return false;
  return a.toLowerCase() === b.toLowerCase();
}

const walletValidator = v.object({
  _id: v.id("wallets"),
  _creationTime: v.number(),
  userId: v.optional(v.id("users")),
  provider: v.union(v.literal("circle")),
  walletId: v.string(),
  walletAddress: v.string(),
  blockchain: v.string(),
  status: v.union(v.literal("active"), v.literal("suspended")),
});

export const getByUser = query({
  args: {
    userId: v.id("users"),
    serviceToken: v.optional(v.string()),
  },
  returns: v.union(walletValidator, v.null()),
  handler: async (ctx, args) => {
    const actor = await requireSignedInUserOrService(ctx, args.serviceToken);
    if (actor && actor.role !== "admin" && actor._id !== args.userId) {
      throw new Error("Forbidden");
    }

    return await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

export const getByWalletAddress = query({
  args: {
    walletAddress: v.string(),
    serviceToken: v.optional(v.string()),
  },
  returns: v.union(walletValidator, v.null()),
  handler: async (ctx, args) => {
    const actor = await requireSignedInUserOrService(ctx, args.serviceToken);
    if (
      actor &&
      actor.role !== "admin" &&
      !isSameAddress(actor.walletAddress, args.walletAddress)
    ) {
      throw new Error("Forbidden");
    }

    return await ctx.db
      .query("wallets")
      .withIndex("by_wallet_address", (q) =>
        q.eq("walletAddress", args.walletAddress),
      )
      .unique();
  },
});

export const upsertCircleWallet = mutation({
  args: {
    userId: v.optional(v.id("users")),
    walletId: v.string(),
    walletAddress: v.string(),
    blockchain: v.string(),
    serviceToken: v.optional(v.string()),
  },
  returns: v.id("wallets"),
  handler: async (ctx, args) => {
    const actor = await requireSignedInUserOrService(ctx, args.serviceToken);
    if (
      actor &&
      actor.role !== "admin" &&
      args.userId !== undefined &&
      args.userId !== actor._id
    ) {
      throw new Error("Forbidden");
    }

    const existingByWalletId = await ctx.db
      .query("wallets")
      .withIndex("by_wallet_id", (q) => q.eq("walletId", args.walletId))
      .unique();

    if (existingByWalletId) {
      await ctx.db.patch(existingByWalletId._id, {
        userId: args.userId ?? existingByWalletId.userId,
        walletAddress: args.walletAddress,
        blockchain: args.blockchain,
        status: "active",
      });
      return existingByWalletId._id;
    }

    const existingByAddress = await ctx.db
      .query("wallets")
      .withIndex("by_wallet_address", (q) =>
        q.eq("walletAddress", args.walletAddress),
      )
      .unique();
    if (existingByAddress) {
      await ctx.db.patch(existingByAddress._id, {
        userId: args.userId ?? existingByAddress.userId,
        walletId: args.walletId,
        blockchain: args.blockchain,
        status: "active",
      });
      return existingByAddress._id;
    }

    return await ctx.db.insert("wallets", {
      userId: args.userId,
      provider: "circle",
      walletId: args.walletId,
      walletAddress: args.walletAddress,
      blockchain: args.blockchain,
      status: "active",
    });
  },
});
