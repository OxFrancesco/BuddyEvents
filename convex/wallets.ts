import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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
  args: { userId: v.id("users") },
  returns: v.union(walletValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

export const getByWalletAddress = query({
  args: { walletAddress: v.string() },
  returns: v.union(walletValidator, v.null()),
  handler: async (ctx, args) => {
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
  },
  returns: v.id("wallets"),
  handler: async (ctx, args) => {
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
