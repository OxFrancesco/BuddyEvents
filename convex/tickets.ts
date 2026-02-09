/// convex/tickets.ts — Ticket management
/// Purchase recording, listing, and queries

import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ========== Queries ==========

export const listByEvent = query({
  args: { eventId: v.id("events") },
  returns: v.array(
    v.object({
      _id: v.id("tickets"),
      _creationTime: v.number(),
      eventId: v.id("events"),
      tokenId: v.optional(v.number()),
      buyerAddress: v.string(),
      buyerAgentId: v.optional(v.string()),
      purchasePrice: v.number(),
      txHash: v.string(),
      status: v.union(
        v.literal("active"),
        v.literal("listed"),
        v.literal("transferred"),
        v.literal("refunded"),
      ),
      listedPrice: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tickets")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
  },
});

export const listByBuyer = query({
  args: { buyerAddress: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("tickets"),
      _creationTime: v.number(),
      eventId: v.id("events"),
      tokenId: v.optional(v.number()),
      buyerAddress: v.string(),
      buyerAgentId: v.optional(v.string()),
      purchasePrice: v.number(),
      txHash: v.string(),
      status: v.union(
        v.literal("active"),
        v.literal("listed"),
        v.literal("transferred"),
        v.literal("refunded"),
      ),
      listedPrice: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tickets")
      .withIndex("by_buyer", (q) => q.eq("buyerAddress", args.buyerAddress))
      .collect();
  },
});

// ========== Mutations ==========

export const recordPurchase = mutation({
  args: {
    eventId: v.id("events"),
    tokenId: v.optional(v.number()),
    buyerAddress: v.string(),
    buyerAgentId: v.optional(v.string()),
    purchasePrice: v.number(),
    txHash: v.string(),
  },
  returns: v.id("tickets"),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (event.status !== "active") throw new Error("Event not active");
    if (event.ticketsSold >= event.maxTickets) throw new Error("Sold out");

    // Increment tickets sold
    await ctx.db.patch(args.eventId, {
      ticketsSold: event.ticketsSold + 1,
    });

    return await ctx.db.insert("tickets", {
      eventId: args.eventId,
      tokenId: args.tokenId,
      buyerAddress: args.buyerAddress,
      buyerAgentId: args.buyerAgentId,
      purchasePrice: args.purchasePrice,
      txHash: args.txHash,
      status: "active" as const,
    });
  },
});

export const listForSale = mutation({
  args: {
    ticketId: v.id("tickets"),
    price: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) throw new Error("Ticket not found");
    if (ticket.status !== "active") throw new Error("Ticket not available");

    await ctx.db.patch(args.ticketId, {
      status: "listed" as const,
      listedPrice: args.price,
    });
    return null;
  },
});

export const recordTransfer = internalMutation({
  args: {
    ticketId: v.id("tickets"),
    newBuyerAddress: v.string(),
    txHash: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.ticketId, {
      buyerAddress: args.newBuyerAddress,
      status: "active" as const,
      listedPrice: undefined,
    });
    return null;
  },
});
