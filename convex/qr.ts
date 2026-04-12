import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireSignedInUserOrService } from "./lib/auth";
import { userOwnsAddress } from "./lib/walletOwnership";

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function issueQrToken(
  ctx: MutationCtx,
  args: {
    ticketId: Id<"tickets">;
    eventId: Id<"events">;
    userId?: Id<"users">;
    expiresAt: number;
  },
) {
  const token = `be_qr_${crypto.randomUUID()}`;
  const tokenHash = await sha256Hex(token);
  const now = Date.now();

  const ticketQrTokenId = await ctx.db.insert("ticketQrTokens", {
    ticketId: args.ticketId,
    eventId: args.eventId,
    userId: args.userId,
    token,
    tokenHash,
    expiresAt: args.expiresAt,
    issuedAt: now,
  });

  return { ticketQrTokenId, token, tokenHash };
}

async function userOwnsTicket(
  ctx: MutationCtx,
  user: Doc<"users">,
  ticket: Doc<"tickets">,
): Promise<boolean> {
  return await userOwnsAddress(ctx, user, ticket.buyerAddress);
}

const qrIssueResultValidator = v.object({
  ticketQrTokenId: v.id("ticketQrTokens"),
  token: v.string(),
  expiresAt: v.number(),
});

export const issueForTicket = mutation({
  args: {
    ticketId: v.id("tickets"),
    eventId: v.id("events"),
    userId: v.optional(v.id("users")),
    expiresAt: v.optional(v.number()),
    serviceToken: v.optional(v.string()),
  },
  returns: qrIssueResultValidator,
  handler: async (ctx, args) => {
    const actor = await requireSignedInUserOrService(ctx, args.serviceToken);
    const now = Date.now();
    const expiry = args.expiresAt ?? now + 1000 * 60 * 60 * 24;
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) throw new Error("Ticket not found");
    if (ticket.eventId !== args.eventId) {
      throw new Error("Ticket does not belong to provided eventId");
    }

    if (actor) {
      if (actor.role !== "admin" && !(await userOwnsTicket(ctx, actor, ticket))) {
        throw new Error("Forbidden");
      }
      if (args.userId !== undefined && args.userId !== actor._id) {
        throw new Error("userId must match the signed-in user");
      }
    }

    const existing = await ctx.db
      .query("ticketQrTokens")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .collect();
    for (const token of existing) {
      if (token.revokedAt === undefined && token.expiresAt > now) {
        await ctx.db.patch(token._id, { revokedAt: now });
      }
    }

    const result = await issueQrToken(ctx, {
      ticketId: args.ticketId,
      eventId: args.eventId,
      userId: args.userId,
      expiresAt: expiry,
    });

    await ctx.db.patch(args.ticketId, {
      qrCode: result.token,
    });

    return {
      ticketQrTokenId: result.ticketQrTokenId,
      token: result.token,
      expiresAt: expiry,
    };
  },
});

type ValidateAndCheckInResult = {
  ok: boolean;
  status: "valid" | "invalid" | "expired" | "already_checked_in";
  message: string;
  ticketId?: Id<"tickets">;
  eventId?: Id<"events">;
  checkedInAt?: number;
};

export const getActiveByTicket = query({
  args: { ticketId: v.id("tickets") },
  returns: v.union(
    v.object({
      _id: v.id("ticketQrTokens"),
      ticketId: v.id("tickets"),
      eventId: v.id("events"),
      userId: v.optional(v.id("users")),
      token: v.optional(v.string()),
      tokenHash: v.string(),
      expiresAt: v.number(),
      revokedAt: v.optional(v.number()),
      issuedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const now = Date.now();
    const all = await ctx.db
      .query("ticketQrTokens")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .collect();
    return (
      all.find((token) => token.revokedAt === undefined && token.expiresAt > now) ??
      null
    );
  },
});

export const listActiveByTickets = query({
  args: {
    ticketIds: v.array(v.id("tickets")),
  },
  returns: v.array(
    v.object({
      ticketId: v.id("tickets"),
      token: v.optional(v.string()),
      expiresAt: v.number(),
      issuedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now();
    const results = await Promise.all(
      args.ticketIds.map(async (ticketId) => {
        const tokens = await ctx.db
          .query("ticketQrTokens")
          .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
          .collect();
        const active = tokens
          .filter((token) => token.revokedAt === undefined && token.expiresAt > now)
          .sort((a, b) => b.issuedAt - a.issuedAt)[0];
        return active
          ? {
              ticketId,
              token: active.token,
              expiresAt: active.expiresAt,
              issuedAt: active.issuedAt,
            }
          : null;
      }),
    );

    return results.filter((value): value is NonNullable<typeof value> => value !== null);
  },
});

export const validateAndCheckIn = mutation({
  args: {
    token: v.string(),
    checkedInByUserId: v.optional(v.id("users")),
    serviceToken: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    status: v.union(
      v.literal("valid"),
      v.literal("invalid"),
      v.literal("expired"),
      v.literal("already_checked_in"),
    ),
    message: v.string(),
    ticketId: v.optional(v.id("tickets")),
    eventId: v.optional(v.id("events")),
    checkedInAt: v.optional(v.number()),
  }),
  handler: async (ctx, args): Promise<ValidateAndCheckInResult> => {
    const actor = await requireSignedInUserOrService(ctx, args.serviceToken);

    let checkedInByUserId: Id<"users">;
    if (actor) {
      if (actor.role !== "admin") {
        throw new Error("Admin access required");
      }
      checkedInByUserId = actor._id;
    } else {
      if (!args.checkedInByUserId) {
        throw new Error("checkedInByUserId is required for service calls");
      }
      const admin = await ctx.db.get(args.checkedInByUserId);
      if (!admin || admin.role !== "admin") {
        throw new Error("checkedInByUserId must be an admin user");
      }
      checkedInByUserId = admin._id;
    }

    const now = Date.now();
    const tokenHash = await sha256Hex(args.token);
    const qr = await ctx.db
      .query("ticketQrTokens")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();

    if (!qr) {
      return {
        ok: false,
        status: "invalid" as const,
        message: "QR token not found",
      };
    }
    if (qr.revokedAt !== undefined || qr.expiresAt <= now) {
      return {
        ok: false,
        status: "expired" as const,
        message: "QR token expired or revoked",
        ticketId: qr.ticketId,
        eventId: qr.eventId,
      };
    }

    const ticket = await ctx.db.get(qr.ticketId);
    if (!ticket) {
      return {
        ok: false,
        status: "invalid" as const,
        message: "Ticket not found",
      };
    }
    if (ticket.checkedInAt !== undefined) {
      return {
        ok: false,
        status: "already_checked_in" as const,
        message: "Ticket already checked in",
        ticketId: ticket._id,
        eventId: ticket.eventId,
        checkedInAt: ticket.checkedInAt,
      };
    }

    const existingCheckin = await ctx.db
      .query("eventCheckins")
      .withIndex("by_ticket", (q) => q.eq("ticketId", qr.ticketId))
      .unique();
    if (existingCheckin) {
      return {
        ok: false,
        status: "already_checked_in" as const,
        message: "Ticket already checked in",
        ticketId: qr.ticketId,
        eventId: qr.eventId,
        checkedInAt: existingCheckin.checkedInAt,
      };
    }

    await ctx.db.insert("eventCheckins", {
      ticketId: qr.ticketId,
      eventId: qr.eventId,
      checkedInAt: now,
      checkedInByUserId,
      qrTokenId: qr._id,
    });
    await ctx.db.patch(ticket._id, {
      checkedInAt: now,
      checkedInBy: checkedInByUserId,
    });
    await ctx.db.patch(qr._id, { revokedAt: now });

    return {
      ok: true,
      status: "valid" as const,
      message: "Check-in complete",
      ticketId: qr.ticketId,
      eventId: qr.eventId,
      checkedInAt: now,
    };
  },
});
