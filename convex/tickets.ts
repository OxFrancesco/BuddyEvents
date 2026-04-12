/// convex/tickets.ts — Ticket management
/// Purchase recording, listing, and queries

import {
  query,
  mutation,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v, type Infer } from "convex/values";
import {
  requireServiceAccess,
  requireSignedInUser,
  requireSignedInUserOrService,
} from "./lib/auth";
import { chainIdValidator, chainKeyValidator, withDefaultTicketChain } from "./lib/chains";
import {
  listOwnedWalletAddresses,
  resolveUserByAnyWalletAddress,
  userOwnsAddress,
} from "./lib/walletOwnership";

const ticketStatusValidator = v.union(
  v.literal("active"),
  v.literal("listed"),
  v.literal("transferred"),
  v.literal("refunded"),
);

const purchaseSourceValidator = v.union(
  v.literal("wallet"),
  v.literal("x402"),
  v.literal("telegram"),
  v.literal("pi"),
  v.literal("free"),
  v.literal("reconcile"),
);

const ticketListItemValidator = v.object({
  _id: v.id("tickets"),
  _creationTime: v.number(),
  eventId: v.id("events"),
  tokenId: v.optional(v.number()),
  chainKey: chainKeyValidator,
  chainId: chainIdValidator,
  contractAddress: v.optional(v.string()),
  buyerAddress: v.string(),
  buyerAgentId: v.optional(v.string()),
  purchasePrice: v.number(),
  purchaseSource: v.optional(purchaseSourceValidator),
  purchaseReference: v.optional(v.string()),
  txHash: v.string(),
  qrCode: v.string(),
  checkedInAt: v.optional(v.number()),
  checkedInBy: v.optional(v.string()),
  status: ticketStatusValidator,
  listedPrice: v.optional(v.number()),
});

const scanStatusValidator = v.union(
  v.literal("valid"),
  v.literal("not_found"),
  v.literal("unauthorized"),
  v.literal("inactive"),
  v.literal("already_checked_in"),
);

const scanResultValidator = v.object({
  ok: v.boolean(),
  status: scanStatusValidator,
  message: v.string(),
  ticketId: v.optional(v.id("tickets")),
  eventId: v.optional(v.id("events")),
  buyerAddress: v.optional(v.string()),
  checkedInAt: v.optional(v.number()),
});
type ScanResult = Infer<typeof scanResultValidator>;

function normalizeTicketRecord(
  ticket: Doc<"tickets">,
  event?: Pick<Doc<"events">, "chainKey" | "chainId" | "contractAddress"> | null,
) {
  const normalized = withDefaultTicketChain(ticket, event);
  return {
    ...normalized,
    contractAddress: ticket.contractAddress ?? event?.contractAddress,
  };
}

async function generateUniqueQrCode(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `be_${crypto.randomUUID()}`;
    const existing = await ctx.db
      .query("tickets")
      .withIndex("by_qr_code", (q) => q.eq("qrCode", candidate))
      .unique();
    if (!existing) return candidate;
  }
  throw new Error("Failed to generate a unique QR code");
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function issueTicketQrToken(
  ctx: MutationCtx,
  args: {
    ticketId: Id<"tickets">;
    eventId: Id<"events">;
    buyerAddress: string;
    ttlMs?: number;
  },
) {
  const now = Date.now();
  const expiresAt = now + (args.ttlMs ?? 1000 * 60 * 60 * 24);

  const ownerUser = await resolveUserByAnyWalletAddress(ctx, args.buyerAddress);

  const token = `be_qr_${crypto.randomUUID()}`;
  const tokenHash = await sha256Hex(token);

  await ctx.db.insert("ticketQrTokens", {
    ticketId: args.ticketId,
    eventId: args.eventId,
    userId: ownerUser?._id,
    token,
    tokenHash,
    expiresAt,
    issuedAt: now,
  });

  return { token, expiresAt };
}

// ========== Queries ==========

export const listByEvent = query({
  args: {
    eventId: v.id("events"),
    serviceToken: v.optional(v.string()),
  },
  returns: v.array(ticketListItemValidator),
  handler: async (ctx, args) => {
    const actor = await requireSignedInUserOrService(ctx, args.serviceToken);
    if (actor && actor.role !== "admin") {
      throw new Error("Admin access required");
    }

    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const event = await ctx.db.get(args.eventId);
    return tickets.map((ticket) => normalizeTicketRecord(ticket, event));
  },
});

export const listByBuyer = query({
  args: {
    buyerAddress: v.string(),
    serviceToken: v.optional(v.string()),
  },
  returns: v.array(ticketListItemValidator),
  handler: async (ctx, args) => {
    const actor = await requireSignedInUserOrService(ctx, args.serviceToken);
    if (
      actor &&
      actor.role !== "admin" &&
      !(await userOwnsAddress(ctx, actor, args.buyerAddress))
    ) {
      throw new Error("Forbidden");
    }

    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_buyer", (q) => q.eq("buyerAddress", args.buyerAddress))
      .collect();
    const events = await Promise.all(
      Array.from(new Set(tickets.map((ticket) => ticket.eventId))).map((id) => ctx.db.get(id)),
    );
    const eventsById = new Map(
      events.filter((event): event is Doc<"events"> => event !== null).map((event) => [event._id, event]),
    );

    return tickets.map((ticket) => normalizeTicketRecord(ticket, eventsById.get(ticket.eventId)));
  },
});

export const listMine = query({
  args: {},
  returns: v.array(ticketListItemValidator),
  handler: async (ctx) => {
    const actor = await requireSignedInUser(ctx);
    const ownedAddresses = await listOwnedWalletAddresses(ctx, actor);
    const ticketsById = new Map<Id<"tickets">, Doc<"tickets">>();

    for (const address of ownedAddresses) {
      const tickets = await ctx.db
        .query("tickets")
        .withIndex("by_buyer", (q) => q.eq("buyerAddress", address))
        .collect();
      for (const ticket of tickets) {
        ticketsById.set(ticket._id, ticket);
      }
    }

    const tickets = Array.from(ticketsById.values()).sort(
      (a, b) => b._creationTime - a._creationTime,
    );
    const events = await Promise.all(
      Array.from(new Set(tickets.map((ticket) => ticket.eventId))).map((id) => ctx.db.get(id)),
    );
    const eventsById = new Map(
      events
        .filter((event): event is Doc<"events"> => event !== null)
        .map((event) => [event._id, event]),
    );

    return tickets.map((ticket) =>
      normalizeTicketRecord(ticket, eventsById.get(ticket.eventId)),
    );
  },
});

export const get = query({
  args: {
    id: v.id("tickets"),
    serviceToken: v.optional(v.string()),
  },
  returns: v.union(ticketListItemValidator, v.null()),
  handler: async (ctx, args) => {
    const actor = await requireSignedInUserOrService(ctx, args.serviceToken);
    const ticket = await ctx.db.get(args.id);
    if (!ticket) return null;

    const event = await ctx.db.get(ticket.eventId);
    const normalizedTicket = normalizeTicketRecord(ticket, event);

    if (!actor || actor.role === "admin") return normalizedTicket;
    if (await userOwnsAddress(ctx, actor, ticket.buyerAddress)) {
      return normalizedTicket;
    }
    throw new Error("Forbidden");
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
    purchaseSource: v.optional(purchaseSourceValidator),
    purchaseReference: v.optional(v.string()),
    txHash: v.string(),
    serviceToken: v.optional(v.string()),
  },
  returns: v.id("tickets"),
  handler: async (ctx, args) => {
    const result = await recordPurchaseWithQrToken(ctx, args);
    return result.ticketId;
  },
});

export const recordPurchaseAndIssueQr = mutation({
  args: {
    eventId: v.id("events"),
    tokenId: v.optional(v.number()),
    buyerAddress: v.string(),
    buyerAgentId: v.optional(v.string()),
    purchasePrice: v.number(),
    purchaseSource: v.optional(purchaseSourceValidator),
    purchaseReference: v.optional(v.string()),
    txHash: v.string(),
    serviceToken: v.optional(v.string()),
  },
  returns: v.object({
    ticketId: v.id("tickets"),
    qrToken: v.string(),
    qrTokenExpiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    return await recordPurchaseWithQrToken(ctx, args);
  },
});

async function recordPurchaseWithQrToken(
  ctx: MutationCtx,
  args: {
    eventId: Id<"events">;
    tokenId?: number;
    buyerAddress: string;
    buyerAgentId?: string;
    purchasePrice: number;
    purchaseSource?: Infer<typeof purchaseSourceValidator>;
    purchaseReference?: string;
    txHash: string;
    serviceToken?: string;
  },
) {
  const actor = await requireSignedInUserOrService(ctx, args.serviceToken);
  const buyerAddress = args.buyerAddress.trim();
  if (!buyerAddress) throw new Error("buyerAddress is required");

  if (
    actor &&
    actor.role !== "admin" &&
    !(await userOwnsAddress(ctx, actor, buyerAddress))
  ) {
    throw new Error("buyerAddress does not match caller wallet");
  }

  const purchaseReference = (args.purchaseReference ?? args.txHash).trim();
  if (!purchaseReference) {
    throw new Error("purchaseReference is required");
  }

  const loadExistingResult = async (ticketId: Id<"tickets">) => {
    const ticket = await ctx.db.get(ticketId);
    if (!ticket) throw new Error("Ticket not found");

    const now = Date.now();
    const activeToken = (
      await ctx.db
        .query("ticketQrTokens")
        .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
        .collect()
    )
      .filter((token) => token.revokedAt === undefined && token.expiresAt > now)
      .sort((a, b) => b.issuedAt - a.issuedAt)[0];

    const qr =
      activeToken?.token
        ? {
            token: activeToken.token,
            expiresAt: activeToken.expiresAt,
          }
        : await issueTicketQrToken(ctx, {
            ticketId,
            eventId: ticket.eventId,
            buyerAddress: ticket.buyerAddress,
          });

    await ctx.db.patch(ticketId, { qrCode: qr.token });

    return {
      ticketId,
      qrToken: qr.token,
      qrTokenExpiresAt: qr.expiresAt,
    };
  };

  const existingByPurchaseReference = await ctx.db
    .query("tickets")
    .withIndex("by_purchase_reference", (q) =>
      q.eq("purchaseReference", purchaseReference),
    )
    .unique();

  if (existingByPurchaseReference) {
    return await loadExistingResult(existingByPurchaseReference._id);
  }

  if (args.txHash) {
    const existingByTxHash = await ctx.db
      .query("tickets")
      .withIndex("by_tx_hash", (q) => q.eq("txHash", args.txHash))
      .unique();
    if (existingByTxHash) {
      return await loadExistingResult(existingByTxHash._id);
    }
  }

  const event = await ctx.db.get(args.eventId);
  if (!event) throw new Error("Event not found");
  if (event.status !== "active") throw new Error("Event not active");
  if (event.ticketsSold >= event.maxTickets) throw new Error("Sold out");

  await ctx.db.patch(args.eventId, {
    ticketsSold: event.ticketsSold + 1,
  });

  const ticketId = await ctx.db.insert("tickets", {
    eventId: args.eventId,
    tokenId: args.tokenId,
    chainKey: event.chainKey ?? "monadTestnet",
    chainId: event.chainId ?? 10143,
    contractAddress: event.contractAddress,
    buyerAddress,
    buyerAgentId: args.buyerAgentId,
    purchasePrice: Number.isFinite(args.purchasePrice)
      ? args.purchasePrice
      : event.price,
    purchaseSource: args.purchaseSource,
    purchaseReference,
    txHash: args.txHash,
    qrCode: await generateUniqueQrCode(ctx),
    checkedInAt: undefined,
    checkedInBy: undefined,
    status: "active" as const,
  });

  const qr = await issueTicketQrToken(ctx, {
    ticketId,
    eventId: args.eventId,
    buyerAddress,
  });

  await ctx.db.patch(ticketId, { qrCode: qr.token });

  return {
    ticketId,
    qrToken: qr.token,
    qrTokenExpiresAt: qr.expiresAt,
  };
}

export const backfillChainMetadata = internalMutation({
  args: {},
  returns: v.object({
    updated: v.number(),
  }),
  handler: async (ctx) => {
    const tickets = await ctx.db.query("tickets").collect();
    let updated = 0;

    for (const ticket of tickets) {
      if (ticket.chainKey && ticket.chainId && ticket.contractAddress !== undefined) {
        continue;
      }
      const event = await ctx.db.get(ticket.eventId);
      if (!event) continue;
      const normalized = normalizeTicketRecord(ticket, event);
      await ctx.db.patch(ticket._id, {
        chainKey: normalized.chainKey,
        chainId: normalized.chainId,
        contractAddress: normalized.contractAddress,
      });
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
    const tickets = await ctx.db.query("tickets").collect();
    let updated = 0;

    for (const ticket of tickets) {
      if (ticket.chainKey && ticket.chainId && ticket.contractAddress !== undefined) {
        continue;
      }

      const event = await ctx.db.get(ticket.eventId);
      if (!event) continue;

      const normalized = withDefaultTicketChain(ticket, event);
      await ctx.db.patch(ticket._id, {
        chainKey: normalized.chainKey,
        chainId: normalized.chainId,
        contractAddress: normalized.contractAddress,
      });
      updated += 1;
    }

    return { updated };
  },
});

export const scanForCheckIn = mutation({
  args: {
    qrCode: v.string(),
    organizerAddress: v.optional(v.string()),
    serviceToken: v.optional(v.string()),
  },
  returns: scanResultValidator,
  handler: async (ctx, args): Promise<ScanResult> => {
    const actor = await requireSignedInUserOrService(ctx, args.serviceToken);

    const organizerCandidates = new Set<string>();
    if (actor) {
      const addresses = await listOwnedWalletAddresses(ctx, actor);
      for (const walletAddress of addresses) {
        organizerCandidates.add(walletAddress.toLowerCase());
      }
    } else {
      const organizerAddress = args.organizerAddress?.trim();
      if (!organizerAddress) {
        throw new Error("organizerAddress is required for service calls");
      }
      organizerCandidates.add(organizerAddress.toLowerCase());
    }

    const ticket = await ctx.db
      .query("tickets")
      .withIndex("by_qr_code", (q) => q.eq("qrCode", args.qrCode))
      .unique();

    if (!ticket) {
      return {
        ok: false,
        status: "not_found",
        message: "Ticket not found",
      };
    }

    const event = await ctx.db.get(ticket.eventId);
    if (!event || event.status !== "active") {
      return {
        ok: false,
        status: "inactive",
        message: "Event is not active",
        ticketId: ticket._id,
        eventId: ticket.eventId,
        buyerAddress: ticket.buyerAddress,
      };
    }

    let isAuthorized = actor?.role === "admin";

    if (!isAuthorized) {
      isAuthorized = organizerCandidates.has(event.creatorAddress.toLowerCase());
    }

    if (!isAuthorized && event.teamId) {
      const team = await ctx.db.get(event.teamId);
      if (team) {
        isAuthorized = organizerCandidates.has(team.walletAddress.toLowerCase());
        if (!isAuthorized) {
          isAuthorized = team.members.some((member) =>
            organizerCandidates.has(member.toLowerCase()),
          );
        }
      }
    }

    if (!isAuthorized) {
      return {
        ok: false,
        status: "unauthorized",
        message: "Organizer is not authorized for this event",
        ticketId: ticket._id,
        eventId: ticket.eventId,
        buyerAddress: ticket.buyerAddress,
      };
    }

    if (ticket.status !== "active") {
      return {
        ok: false,
        status: "inactive",
        message: `Ticket is ${ticket.status}`,
        ticketId: ticket._id,
        eventId: ticket.eventId,
        buyerAddress: ticket.buyerAddress,
        checkedInAt: ticket.checkedInAt,
      };
    }

    if (ticket.checkedInAt !== undefined) {
      return {
        ok: false,
        status: "already_checked_in",
        message: "Ticket has already been checked in",
        ticketId: ticket._id,
        eventId: ticket.eventId,
        buyerAddress: ticket.buyerAddress,
        checkedInAt: ticket.checkedInAt,
      };
    }

    const checkedInAt = Date.now();
    const ownedAddresses = actor ? await listOwnedWalletAddresses(ctx, actor) : [];
    const checkedInBy = ownedAddresses[0] ?? actor?._id ?? args.organizerAddress;
    await ctx.db.patch(ticket._id, {
      checkedInAt,
      checkedInBy,
    });

    return {
      ok: true,
      status: "valid",
      message: "Ticket is valid. Check-in complete.",
      ticketId: ticket._id,
      eventId: ticket.eventId,
      buyerAddress: ticket.buyerAddress,
      checkedInAt,
    };
  },
});

export const listForSale = mutation({
  args: {
    ticketId: v.id("tickets"),
    price: v.number(),
    serviceToken: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireSignedInUserOrService(ctx, args.serviceToken);
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) throw new Error("Ticket not found");
    if (ticket.status !== "active") throw new Error("Ticket not available");
    if (
      actor &&
      actor.role !== "admin" &&
      !(await userOwnsAddress(ctx, actor, ticket.buyerAddress))
    ) {
      throw new Error("Forbidden");
    }

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
      checkedInAt: undefined,
      checkedInBy: undefined,
      qrCode: await generateUniqueQrCode(ctx),
      status: "active" as const,
      listedPrice: undefined,
    });
    return null;
  },
});
