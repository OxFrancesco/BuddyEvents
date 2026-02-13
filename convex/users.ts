import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./lib/auth";

const roleValidator = v.union(v.literal("user"), v.literal("admin"));

const userValidator = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  clerkId: v.string(),
  email: v.optional(v.string()),
  walletAddress: v.optional(v.string()),
  telegramUserId: v.optional(v.string()),
  telegramUsername: v.optional(v.string()),
  telegramFirstName: v.optional(v.string()),
  telegramLastName: v.optional(v.string()),
  telegramPhotoUrl: v.optional(v.string()),
  telegramLinkedAt: v.optional(v.number()),
  role: roleValidator,
});

export const upsertMe = mutation({
  args: {
    walletAddress: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: identity.email ?? existing.email,
        walletAddress: args.walletAddress ?? existing.walletAddress,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId: identity.subject,
      email: identity.email,
      walletAddress: args.walletAddress,
      telegramUserId: undefined,
      telegramUsername: undefined,
      telegramFirstName: undefined,
      telegramLastName: undefined,
      telegramPhotoUrl: undefined,
      telegramLinkedAt: undefined,
      role: "user" as const,
    });
  },
});

export const me = query({
  args: {},
  returns: v.union(userValidator, v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
  },
});

export const setRole = mutation({
  args: {
    userId: v.id("users"),
    role: roleValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    await ctx.db.patch(args.userId, { role: args.role });
    return null;
  },
});

export const getByClerkId = query({
  args: { clerkId: v.string() },
  returns: v.union(userValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();
  },
});

export const getByWallet = query({
  args: { walletAddress: v.string() },
  returns: v.union(userValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .unique();
  },
});

export const getByTelegramUserId = query({
  args: { telegramUserId: v.string() },
  returns: v.union(userValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_telegram_user_id", (q) =>
        q.eq("telegramUserId", args.telegramUserId),
      )
      .unique();
  },
});

export const getById = query({
  args: { userId: v.id("users") },
  returns: v.union(userValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

export const upsertTelegramLink = mutation({
  args: {
    clerkId: v.string(),
    email: v.optional(v.string()),
    walletAddress: v.optional(v.string()),
    telegramUserId: v.string(),
    telegramUsername: v.optional(v.string()),
    telegramFirstName: v.optional(v.string()),
    telegramLastName: v.optional(v.string()),
    telegramPhotoUrl: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const existingByTelegram = await ctx.db
      .query("users")
      .withIndex("by_telegram_user_id", (q) =>
        q.eq("telegramUserId", args.telegramUserId),
      )
      .unique();

    if (existingByTelegram && existingByTelegram.clerkId !== args.clerkId) {
      throw new Error("Telegram account is already linked to another user");
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    const patch = {
      email: args.email ?? existing?.email,
      walletAddress: args.walletAddress ?? existing?.walletAddress,
      telegramUserId: args.telegramUserId,
      telegramUsername: args.telegramUsername,
      telegramFirstName: args.telegramFirstName,
      telegramLastName: args.telegramLastName,
      telegramPhotoUrl: args.telegramPhotoUrl,
      telegramLinkedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      walletAddress: args.walletAddress,
      telegramUserId: args.telegramUserId,
      telegramUsername: args.telegramUsername,
      telegramFirstName: args.telegramFirstName,
      telegramLastName: args.telegramLastName,
      telegramPhotoUrl: args.telegramPhotoUrl,
      telegramLinkedAt: Date.now(),
      role: "user" as const,
    });
  },
});

export const upsertByClerkId = mutation({
  args: {
    clerkId: v.string(),
    email: v.optional(v.string()),
    walletAddress: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email ?? existing.email,
        walletAddress: args.walletAddress ?? existing.walletAddress,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      walletAddress: args.walletAddress,
      role: "user" as const,
      telegramUserId: undefined,
      telegramUsername: undefined,
      telegramFirstName: undefined,
      telegramLastName: undefined,
      telegramPhotoUrl: undefined,
      telegramLinkedAt: undefined,
    });
  },
});

export const bootstrapAdmin = mutation({
  args: {
    clerkId: v.string(),
    bootstrapToken: v.string(),
    email: v.optional(v.string()),
    walletAddress: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const expectedToken = process.env.ADMIN_BOOTSTRAP_TOKEN;
    if (!expectedToken) {
      throw new Error("ADMIN_BOOTSTRAP_TOKEN is not configured");
    }
    if (args.bootstrapToken !== expectedToken) {
      throw new Error("Invalid bootstrap token");
    }

    const existingAdmins = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .collect();
    if (existingAdmins.length > 0) {
      throw new Error("Admin bootstrap already completed");
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        role: "admin" as const,
        email: args.email ?? existing.email,
        walletAddress: args.walletAddress ?? existing.walletAddress,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      walletAddress: args.walletAddress,
      telegramUserId: undefined,
      telegramUsername: undefined,
      telegramFirstName: undefined,
      telegramLastName: undefined,
      telegramPhotoUrl: undefined,
      telegramLinkedAt: undefined,
      role: "admin" as const,
    });
  },
});
