/// convex/tickets.ts — Ticket management
/// Purchase recording, listing, and queries

import {
  query,
  mutation,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v, type Infer } from "convex/values";
import { requireSignedInUserOrService } from "./lib/auth";

const ticketStatusValidator = v.union(
  v.literal("active"),
  v.literal("listed"),
  v.literal("transferred"),
  v.literal("refunded"),
);

const ticketListItemValidator = v.object({
  _id: v.id("tickets"),
  _creationTime: v.number(),
  eventId: v.id("events"),
  tokenId: v.optional(v.number()),
  buyerAddress: v.string(),
  buyerAgentId: v.optional(v.string()),
  purchasePrice: v.number(),
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

  const ownerUser = await ctx.db
    .query("users")
    .withIndex("by_wallet", (q) => q.eq("walletAddress", args.buyerAddress))
    .unique();

  const token = `be_qr_${crypto.randomUUID()}`;
  const tokenHash = await sha256Hex(token);

  await ctx.db.insert("ticketQrTokens", {
    ticketId: args.ticketId,
    eventId: args.eventId,
    userId: ownerUser?._id,
    tokenHash,
    expiresAt,
    issuedAt: now,
  });

  return { token, expiresAt };
}

function isSameAddress(a: string | undefined, b: string): boolean {
  if (!a) return false;
  return a.toLowerCase() === b.toLowerCase();
}

async function userOwnsAddress(
  ctx: MutationCtx | QueryCtx,
  user: Doc<"users">,
  address: string,
): Promise<boolean> {
  if (isSameAddress(user.walletAddress, address)) return true;

  const wallets = await ctx.db
    .query("wallets")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();

  return wallets.some((wallet) => isSameAddress(wallet.walletAddress, address));
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

    return await ctx.db
      .query("tickets")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
  },
});

export const listByBuyer = query({
  args: {
    buyerAddress: v.string(),
    serviceToken: v.optional(v.string()),
  },
  returns: v.array(ticketListItemValidator),
  handler: async (ctx, args): Promise<Array<Doc<"tickets">>> => {
    const actor = await requireSignedInUserOrService(ctx, args.serviceToken);
    if (
      actor &&
      actor.role !== "admin" &&
      !(await userOwnsAddress(ctx, actor, args.buyerAddress))
    ) {
      throw new Error("Forbidden");
    }

    return await ctx.db
      .query("tickets")
      .withIndex("by_buyer", (q) => q.eq("buyerAddress", args.buyerAddress))
      .collect();
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

    if (!actor || actor.role === "admin") return ticket;
    if (await userOwnsAddress(ctx, actor, ticket.buyerAddress)) {
      return ticket;
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

    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (event.status !== "active") throw new Error("Event not active");
    if (event.ticketsSold >= event.maxTickets) throw new Error("Sold out");

    // Increment tickets sold
    await ctx.db.patch(args.eventId, {
      ticketsSold: event.ticketsSold + 1,
    });

    const ticketId = await ctx.db.insert("tickets", {
      eventId: args.eventId,
      tokenId: args.tokenId,
      buyerAddress,
      buyerAgentId: args.buyerAgentId,
      purchasePrice: event.price,
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

    // Keep legacy ticket.qrCode in sync while the app migrates to tokenized QR.
    await ctx.db.patch(ticketId, { qrCode: qr.token });

    return {
      ticketId,
      qrToken: qr.token,
      qrTokenExpiresAt: qr.expiresAt,
    };
}

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
    if (actor?.walletAddress) {
      organizerCandidates.add(actor.walletAddress.toLowerCase());
    }
    if (actor) {
      const wallets = await ctx.db
        .query("wallets")
        .withIndex("by_user", (q) => q.eq("userId", actor._id))
        .collect();
      for (const wallet of wallets) {
        organizerCandidates.add(wallet.walletAddress.toLowerCase());
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
    const checkedInBy = actor?.walletAddress ?? actor?._id ?? args.organizerAddress;
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
