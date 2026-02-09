/// convex/schema.ts — Full BuddyEvents data model
/// Events, tickets, teams, sponsors, and agent registrations

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  events: defineTable({
    name: v.string(),
    description: v.string(),
    startTime: v.number(), // unix ms
    endTime: v.number(),
    price: v.number(), // USDC amount (human-readable, e.g. 10.50)
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
  })
    .index("by_status", ["status"])
    .index("by_team", ["teamId"])
    .index("by_creator", ["creatorAddress"]),

  tickets: defineTable({
    eventId: v.id("events"),
    tokenId: v.optional(v.number()), // ERC-721 token ID on Monad
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
  })
    .index("by_event", ["eventId"])
    .index("by_buyer", ["buyerAddress"])
    .index("by_status", ["status"]),

  teams: defineTable({
    name: v.string(),
    description: v.string(),
    walletAddress: v.string(),
    members: v.array(v.string()),
  }).index("by_wallet", ["walletAddress"]),

  sponsors: defineTable({
    name: v.string(),
    logo: v.optional(v.string()),
    walletAddress: v.string(),
    contribution: v.optional(v.number()),
  }),

  agents: defineTable({
    name: v.string(),
    walletAddress: v.string(),
    ownerAddress: v.string(),
    status: v.union(v.literal("active"), v.literal("suspended")),
  }).index("by_wallet", ["walletAddress"]),
});
