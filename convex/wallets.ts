import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireServiceAccess, requireSignedInUserOrService } from "./lib/auth";
import { chainKeyValidator, withDefaultWalletChain } from "./lib/chains";
import { userOwnsAddress } from "./lib/walletOwnership";

const walletProviderValidator = v.union(v.literal("circle"), v.literal("crossmint"));
const walletPurposeValidator = v.union(
  v.literal("human_primary"),
  v.literal("automation"),
);
const walletControlModeValidator = v.union(
  v.literal("external_wallet"),
  v.literal("server"),
);
const walletRecoveryModeValidator = v.union(
  v.literal("email"),
  v.literal("server"),
);

const walletValidator = v.object({
  _id: v.id("wallets"),
  _creationTime: v.number(),
  userId: v.optional(v.id("users")),
  provider: walletProviderValidator,
  walletId: v.string(),
  walletAddress: v.string(),
  chainKey: chainKeyValidator,
  blockchain: v.string(),
  purpose: v.optional(walletPurposeValidator),
  controlMode: v.optional(walletControlModeValidator),
  recoveryMode: v.optional(walletRecoveryModeValidator),
  linkedSignerAddress: v.optional(v.string()),
  linkedEmail: v.optional(v.string()),
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

    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    return wallet ? withDefaultWalletChain(wallet) : null;
  },
});

export const listByUser = query({
  args: {
    userId: v.id("users"),
    serviceToken: v.optional(v.string()),
  },
  returns: v.array(walletValidator),
  handler: async (ctx, args) => {
    const actor = await requireSignedInUserOrService(ctx, args.serviceToken);
    if (actor && actor.role !== "admin" && actor._id !== args.userId) {
      throw new Error("Forbidden");
    }

    const wallets = await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    return wallets.map((wallet) => withDefaultWalletChain(wallet));
  },
});

export const getByUserAndPurpose = query({
  args: {
    userId: v.id("users"),
    purpose: walletPurposeValidator,
    serviceToken: v.optional(v.string()),
  },
  returns: v.union(walletValidator, v.null()),
  handler: async (ctx, args) => {
    const actor = await requireSignedInUserOrService(ctx, args.serviceToken);
    if (actor && actor.role !== "admin" && actor._id !== args.userId) {
      throw new Error("Forbidden");
    }

    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_user_and_purpose", (q) =>
        q.eq("userId", args.userId).eq("purpose", args.purpose),
      )
      .unique();
    return wallet ? withDefaultWalletChain(wallet) : null;
  },
});

export const getByUserAndChain = query({
  args: {
    userId: v.id("users"),
    chainKey: chainKeyValidator,
    serviceToken: v.optional(v.string()),
  },
  returns: v.union(walletValidator, v.null()),
  handler: async (ctx, args) => {
    const actor = await requireSignedInUserOrService(ctx, args.serviceToken);
    if (actor && actor.role !== "admin" && actor._id !== args.userId) {
      throw new Error("Forbidden");
    }

    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_user_and_chain", (q) =>
        q.eq("userId", args.userId).eq("chainKey", args.chainKey),
      )
      .unique();
    return wallet ? withDefaultWalletChain(wallet) : null;
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
      !(await userOwnsAddress(ctx, actor, args.walletAddress))
    ) {
      throw new Error("Forbidden");
    }

    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_wallet_address", (q) =>
        q.eq("walletAddress", args.walletAddress),
      )
      .unique();
    return wallet ? withDefaultWalletChain(wallet) : null;
  },
});

export const upsertCircleWallet = mutation({
  args: {
    userId: v.optional(v.id("users")),
    walletId: v.string(),
    walletAddress: v.string(),
    chainKey: chainKeyValidator,
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
        chainKey: args.chainKey,
        blockchain: args.blockchain,
        purpose: existingByWalletId.purpose ?? "automation",
        controlMode: existingByWalletId.controlMode ?? "server",
        recoveryMode: existingByWalletId.recoveryMode ?? "server",
        status: "active",
      });
      return existingByWalletId._id;
    }

    const existingByUserAndChain =
      args.userId === undefined
        ? null
        : await ctx.db
            .query("wallets")
            .withIndex("by_user_and_chain", (q) =>
              q.eq("userId", args.userId).eq("chainKey", args.chainKey),
            )
            .unique();
    if (existingByUserAndChain) {
      await ctx.db.patch(existingByUserAndChain._id, {
        walletId: args.walletId,
        walletAddress: args.walletAddress,
        chainKey: args.chainKey,
        blockchain: args.blockchain,
        purpose: existingByUserAndChain.purpose ?? "automation",
        controlMode: existingByUserAndChain.controlMode ?? "server",
        recoveryMode: existingByUserAndChain.recoveryMode ?? "server",
        status: "active",
      });
      return existingByUserAndChain._id;
    }

    const existingByAddress = await ctx.db
      .query("wallets")
      .withIndex("by_wallet_address", (q) => q.eq("walletAddress", args.walletAddress))
      .unique();
    if (existingByAddress) {
      await ctx.db.patch(existingByAddress._id, {
        userId: args.userId ?? existingByAddress.userId,
        walletId: args.walletId,
        chainKey: args.chainKey,
        blockchain: args.blockchain,
        purpose: existingByAddress.purpose ?? "automation",
        controlMode: existingByAddress.controlMode ?? "server",
        recoveryMode: existingByAddress.recoveryMode ?? "server",
        status: "active",
      });
      return existingByAddress._id;
    }

    return await ctx.db.insert("wallets", {
      userId: args.userId,
      provider: "circle",
      walletId: args.walletId,
      walletAddress: args.walletAddress,
      chainKey: args.chainKey,
      blockchain: args.blockchain,
      purpose: "automation",
      controlMode: "server",
      recoveryMode: "server",
      status: "active",
    });
  },
});

export const upsertCrossmintWallet = mutation({
  args: {
    userId: v.id("users"),
    walletId: v.string(),
    walletAddress: v.string(),
    chainKey: chainKeyValidator,
    blockchain: v.string(),
    purpose: walletPurposeValidator,
    controlMode: walletControlModeValidator,
    recoveryMode: v.optional(walletRecoveryModeValidator),
    linkedSignerAddress: v.optional(v.string()),
    linkedEmail: v.optional(v.string()),
    serviceToken: v.optional(v.string()),
  },
  returns: v.id("wallets"),
  handler: async (ctx, args) => {
    const actor = await requireSignedInUserOrService(ctx, args.serviceToken);
    if (actor && actor.role !== "admin" && actor._id !== args.userId) {
      throw new Error("Forbidden");
    }

    const existingByWalletId = await ctx.db
      .query("wallets")
      .withIndex("by_wallet_id", (q) => q.eq("walletId", args.walletId))
      .unique();

    const patch = {
      userId: args.userId,
      provider: "crossmint" as const,
      walletAddress: args.walletAddress,
      chainKey: args.chainKey,
      blockchain: args.blockchain,
      purpose: args.purpose,
      controlMode: args.controlMode,
      recoveryMode: args.recoveryMode,
      linkedSignerAddress: args.linkedSignerAddress,
      linkedEmail: args.linkedEmail,
      status: "active" as const,
    };

    if (existingByWalletId) {
      await ctx.db.patch(existingByWalletId._id, patch);
      return existingByWalletId._id;
    }

    const existingByPurpose = await ctx.db
      .query("wallets")
      .withIndex("by_user_and_purpose", (q) =>
        q.eq("userId", args.userId).eq("purpose", args.purpose),
      )
      .unique();
    if (existingByPurpose) {
      await ctx.db.patch(existingByPurpose._id, {
        ...patch,
        walletId: args.walletId,
      });
      return existingByPurpose._id;
    }

    const existingByAddress = await ctx.db
      .query("wallets")
      .withIndex("by_wallet_address", (q) => q.eq("walletAddress", args.walletAddress))
      .unique();
    if (existingByAddress) {
      await ctx.db.patch(existingByAddress._id, {
        ...patch,
        walletId: args.walletId,
      });
      return existingByAddress._id;
    }

    return await ctx.db.insert("wallets", {
      ...patch,
      walletId: args.walletId,
    });
  },
});

export const backfillChainMetadata = internalMutation({
  args: {},
  returns: v.object({
    updated: v.number(),
  }),
  handler: async (ctx) => {
    const wallets = await ctx.db.query("wallets").collect();
    let updated = 0;

    for (const wallet of wallets) {
      const normalized = withDefaultWalletChain(wallet);
      const defaults =
        wallet.provider === "crossmint"
          ? {}
          : {
              purpose: wallet.purpose ?? ("automation" as const),
              controlMode: wallet.controlMode ?? ("server" as const),
              recoveryMode: wallet.recoveryMode ?? ("server" as const),
            };
      const nextPatch = {
        ...(wallet.chainKey ? {} : { chainKey: normalized.chainKey }),
        ...defaults,
      };
      if (Object.keys(nextPatch).length === 0) continue;
      await ctx.db.patch(wallet._id, nextPatch);
      updated += 1;
    }

    return { updated };
  },
});

export const backfillChainMetadataService = mutation({
  args: {
    serviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceAccess(args.serviceToken);
    const wallets = await ctx.db.query("wallets").collect();
    let updated = 0;

    for (const wallet of wallets) {
      if (wallet.chainKey) continue;
      const normalized = withDefaultWalletChain(wallet);
      await ctx.db.patch(wallet._id, { chainKey: normalized.chainKey });
      updated += 1;
    }

    return { updated };
  },
});
