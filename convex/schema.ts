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
    chainKey: v.optional(
      v.union(v.literal("monadTestnet"), v.literal("baseMainnet")),
    ),
    chainId: v.optional(v.union(v.literal(10143), v.literal(8453))),
    teamId: v.optional(v.id("teams")),
    projectId: v.optional(v.id("projects")),
    sponsors: v.array(v.id("sponsors")),
    location: v.string(),
    onChainEventId: v.optional(v.number()),
    contractAddress: v.optional(v.string()),
    chainStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("confirmed"),
        v.literal("failed"),
      ),
    ),
    chainReference: v.optional(v.string()),
    chainLastError: v.optional(v.string()),
    creatorAddress: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("ended"),
      v.literal("cancelled"),
    ),
    submissionSource: v.optional(
      v.union(
        v.literal("foundation_admin"),
        v.literal("project_admin"),
        v.literal("user_submission"),
      ),
    ),
    moderationStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
      ),
    ),
    moderationNotes: v.optional(v.string()),
    reviewedByUserId: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_team", ["teamId"])
    .index("by_creator", ["creatorAddress"])
    .index("by_moderation_status", ["moderationStatus"])
    .index("by_project", ["projectId"])
    .index("by_team_and_moderation", ["teamId", "moderationStatus"])
    .index("by_chain_reference", ["chainReference"]),

  tickets: defineTable({
    eventId: v.id("events"),
    tokenId: v.optional(v.number()), // ERC-721 token ID on the selected chain
    chainKey: v.optional(
      v.union(v.literal("monadTestnet"), v.literal("baseMainnet")),
    ),
    chainId: v.optional(v.union(v.literal(10143), v.literal(8453))),
    contractAddress: v.optional(v.string()),
    buyerAddress: v.string(),
    buyerAgentId: v.optional(v.string()),
    purchasePrice: v.number(),
    purchaseSource: v.optional(
      v.union(
        v.literal("wallet"),
        v.literal("x402"),
        v.literal("telegram"),
        v.literal("pi"),
        v.literal("free"),
        v.literal("reconcile"),
      ),
    ),
    purchaseReference: v.optional(v.string()),
    txHash: v.string(),
    qrCode: v.string(),
    checkedInAt: v.optional(v.number()),
    checkedInBy: v.optional(v.string()),
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
    .index("by_status", ["status"])
    .index("by_qr_code", ["qrCode"])
    .index("by_purchase_reference", ["purchaseReference"])
    .index("by_tx_hash", ["txHash"]),

  teams: defineTable({
    name: v.string(),
    description: v.string(),
    walletAddress: v.string(),
    members: v.array(v.string()),
  }).index("by_wallet", ["walletAddress"]),

  projects: defineTable({
    foundationId: v.id("teams"),
    name: v.string(),
    description: v.string(),
    status: v.union(v.literal("active"), v.literal("archived")),
    walletAddress: v.optional(v.string()),
  })
    .index("by_foundation", ["foundationId"])
    .index("by_status", ["status"]),

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

  users: defineTable({
    clerkId: v.string(),
    email: v.optional(v.string()),
    walletAddress: v.optional(v.string()),
    telegramUserId: v.optional(v.string()),
    telegramUsername: v.optional(v.string()),
    telegramFirstName: v.optional(v.string()),
    telegramLastName: v.optional(v.string()),
    telegramPhotoUrl: v.optional(v.string()),
    telegramLinkedAt: v.optional(v.number()),
    role: v.union(v.literal("user"), v.literal("admin")),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_role", ["role"])
    .index("by_wallet", ["walletAddress"])
    .index("by_telegram_user_id", ["telegramUserId"]),

  agentRuns: defineTable({
    userId: v.optional(v.id("users")),
    source: v.union(
      v.literal("telegram_bot"),
      v.literal("telegram_mini_app"),
      v.literal("api"),
    ),
    intent: v.string(),
    rawInput: v.string(),
    normalizedArgs: v.optional(v.string()),
    status: v.union(
      v.literal("started"),
      v.literal("success"),
      v.literal("failed"),
    ),
    response: v.optional(v.string()),
    error: v.optional(v.string()),
    txHash: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_started_at", ["startedAt"]),

  wallets: defineTable({
    userId: v.optional(v.id("users")),
    provider: v.union(v.literal("circle"), v.literal("crossmint")),
    walletId: v.string(),
    walletAddress: v.string(),
    chainKey: v.optional(
      v.union(v.literal("monadTestnet"), v.literal("baseMainnet")),
    ),
    blockchain: v.string(),
    purpose: v.optional(
      v.union(v.literal("human_primary"), v.literal("automation")),
    ),
    controlMode: v.optional(
      v.union(v.literal("external_wallet"), v.literal("server")),
    ),
    recoveryMode: v.optional(v.union(v.literal("email"), v.literal("server"))),
    linkedSignerAddress: v.optional(v.string()),
    linkedEmail: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("suspended")),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_purpose", ["userId", "purpose"])
    .index("by_user_and_chain", ["userId", "chainKey"])
    .index("by_wallet_address", ["walletAddress"])
    .index("by_wallet_id", ["walletId"]),

  ticketQrTokens: defineTable({
    ticketId: v.id("tickets"),
    eventId: v.id("events"),
    userId: v.optional(v.id("users")),
    token: v.optional(v.string()),
    tokenHash: v.string(),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
    issuedAt: v.number(),
  })
    .index("by_ticket", ["ticketId"])
    .index("by_token_hash", ["tokenHash"])
    .index("by_event", ["eventId"]),

  eventCheckins: defineTable({
    ticketId: v.id("tickets"),
    eventId: v.id("events"),
    checkedInAt: v.number(),
    checkedInByUserId: v.id("users"),
    qrTokenId: v.id("ticketQrTokens"),
  })
    .index("by_event", ["eventId"])
    .index("by_ticket", ["ticketId"]),

  workflowExecutions: defineTable({
    workflowName: v.union(
      v.literal("ticket_purchase"),
      v.literal("create_event"),
      v.literal("provision_wallet"),
      v.literal("provision_circle_wallet"),
      v.literal("refresh_qr"),
      v.literal("telegram_command"),
    ),
    idempotencyKey: v.string(),
    source: v.string(),
    actorUserId: v.optional(v.id("users")),
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("waiting_retry"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    payloadJson: v.string(),
    resultJson: v.optional(v.string()),
    errorJson: v.optional(v.string()),
    leaseOwner: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    nextRunAt: v.number(),
    attempt: v.number(),
    startedAt: v.optional(v.number()),
    updatedAt: v.number(),
    finishedAt: v.optional(v.number()),
  })
    .index("by_workflow_name_and_idempotency_key", [
      "workflowName",
      "idempotencyKey",
    ])
    .index("by_status_and_next_run", ["status", "nextRunAt"])
    .index("by_actor", ["actorUserId"]),

  workflowSteps: defineTable({
    executionId: v.id("workflowExecutions"),
    stepName: v.string(),
    status: v.union(
      v.literal("started"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    attempt: v.number(),
    inputJson: v.optional(v.string()),
    outputJson: v.optional(v.string()),
    errorJson: v.optional(v.string()),
    externalReference: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_execution", ["executionId"])
    .index("by_external_reference", ["externalReference"]),

  workflowSignals: defineTable({
    executionId: v.id("workflowExecutions"),
    signal: v.string(),
    payloadJson: v.optional(v.string()),
    createdAt: v.number(),
    consumedAt: v.optional(v.number()),
  })
    .index("by_execution", ["executionId"])
    .index("by_execution_and_signal", ["executionId", "signal"]),
});
