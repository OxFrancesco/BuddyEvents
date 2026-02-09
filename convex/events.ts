/// convex/events.ts — Event CRUD operations
/// Public queries and mutations for event management

import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ========== Queries ==========

export const list = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("active"),
        v.literal("ended"),
        v.literal("cancelled"),
      ),
    ),
  },
  returns: v.array(
    v.object({
      _id: v.id("events"),
      _creationTime: v.number(),
      name: v.string(),
      description: v.string(),
      startTime: v.number(),
      endTime: v.number(),
      price: v.number(),
      maxTickets: v.number(),
      ticketsSold: v.number(),
      teamId: v.id("teams"),
      sponsors: v.array(v.id("sponsors")),
      location: v.string(),
      onChainEventId: v.optional(v.number()),
      contractAddress: v.optional(v.string()),
      creatorAddress: v.string(),
      status: v.union(
        v.literal("draft"),
        v.literal("active"),
        v.literal("ended"),
        v.literal("cancelled"),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db
        .query("events")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect();
    }
    return await ctx.db.query("events").order("desc").collect();
  },
});

export const get = query({
  args: { id: v.id("events") },
  returns: v.union(
    v.object({
      _id: v.id("events"),
      _creationTime: v.number(),
      name: v.string(),
      description: v.string(),
      startTime: v.number(),
      endTime: v.number(),
      price: v.number(),
      maxTickets: v.number(),
      ticketsSold: v.number(),
      teamId: v.id("teams"),
      sponsors: v.array(v.id("sponsors")),
      location: v.string(),
      onChainEventId: v.optional(v.number()),
      contractAddress: v.optional(v.string()),
      creatorAddress: v.string(),
      status: v.union(
        v.literal("draft"),
        v.literal("active"),
        v.literal("ended"),
        v.literal("cancelled"),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ========== Mutations ==========

export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    price: v.number(),
    maxTickets: v.number(),
    teamId: v.id("teams"),
    sponsors: v.optional(v.array(v.id("sponsors"))),
    location: v.string(),
    creatorAddress: v.string(),
  },
  returns: v.id("events"),
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found");

    return await ctx.db.insert("events", {
      name: args.name,
      description: args.description,
      startTime: args.startTime,
      endTime: args.endTime,
      price: args.price,
      maxTickets: args.maxTickets,
      ticketsSold: 0,
      teamId: args.teamId,
      sponsors: args.sponsors ?? [],
      location: args.location,
      creatorAddress: args.creatorAddress,
      status: "active" as const,
    });
  },
});

export const edit = mutation({
  args: {
    id: v.id("events"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    price: v.optional(v.number()),
    location: v.optional(v.string()),
    sponsors: v.optional(v.array(v.id("sponsors"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.id);
    if (!event) throw new Error("Event not found");

    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.description !== undefined) patch.description = args.description;
    if (args.startTime !== undefined) patch.startTime = args.startTime;
    if (args.endTime !== undefined) patch.endTime = args.endTime;
    if (args.price !== undefined) patch.price = args.price;
    if (args.location !== undefined) patch.location = args.location;
    if (args.sponsors !== undefined) patch.sponsors = args.sponsors;

    await ctx.db.patch(args.id, patch);
    return null;
  },
});

export const cancel = mutation({
  args: { id: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.id);
    if (!event) throw new Error("Event not found");

    await ctx.db.patch(args.id, { status: "cancelled" as const });
    return null;
  },
});

// Internal mutation for setting on-chain data after deployment
export const setOnChainData = internalMutation({
  args: {
    id: v.id("events"),
    onChainEventId: v.number(),
    contractAddress: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      onChainEventId: args.onChainEventId,
      contractAddress: args.contractAddress,
    });
    return null;
  },
});
