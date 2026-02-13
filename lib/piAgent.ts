import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  createOrGetCircleWalletForUser,
  executeBuyTicketWithCircleWallet,
} from "./circle";

export type PiSource = "telegram_bot" | "telegram_mini_app" | "api";
export type PiIntent =
  | "find_events"
  | "find_tickets"
  | "connect_wallet"
  | "buy_ticket"
  | "create_event"
  | "get_event_qr";

export type PiExecutionInput = {
  source: PiSource;
  rawInput: string;
  userId?: Id<"users">;
  intent?: PiIntent;
  args?: Record<string, unknown>;
};

export type PiExecutionResult = {
  ok: boolean;
  intent: PiIntent;
  message: string;
  data?: unknown;
  txHash?: string;
};

function getConvexClient() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  }
  return new ConvexHttpClient(convexUrl);
}

function parseIntent(rawInput: string): PiIntent {
  const input = rawInput.trim().toLowerCase();
  if (input.startsWith("/events")) return "find_events";
  if (input.startsWith("/tickets")) return "find_tickets";
  if (input.startsWith("/wallet")) return "connect_wallet";
  if (input.startsWith("/buy")) return "buy_ticket";
  if (input.startsWith("/create")) return "create_event";
  if (input.startsWith("/qr")) return "get_event_qr";

  if (input.includes("find") && input.includes("event")) return "find_events";
  if (input.includes("ticket") && input.includes("my")) return "find_tickets";
  if (input.includes("connect") && input.includes("wallet")) return "connect_wallet";
  if (input.includes("buy") && input.includes("ticket")) return "buy_ticket";
  if (input.includes("create") && input.includes("event")) return "create_event";
  if (input.includes("qr")) return "get_event_qr";
  return "find_events";
}

function extractBuyEventId(rawInput: string) {
  const match = rawInput.match(/\/buy\s+([a-zA-Z0-9_-]+)/);
  return match?.[1];
}

function extractQrTicketId(rawInput: string) {
  const match = rawInput.match(/\/qr\s+([a-zA-Z0-9_-]+)/);
  return match?.[1];
}

function sameAddress(a?: string, b?: string) {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export async function executePiAction(
  input: PiExecutionInput,
): Promise<PiExecutionResult> {
  const convex = getConvexClient();
  const intent = input.intent ?? parseIntent(input.rawInput);

  const runId = await convex.mutation(api.agentRuns.startRun, {
    userId: input.userId,
    source: input.source,
    intent,
    rawInput: input.rawInput,
    normalizedArgs: input.args ? JSON.stringify(input.args) : undefined,
  });

  try {
    if (intent === "find_events") {
      const events = await convex.query(api.events.list, {
        status: "active",
        moderationStatus: "approved",
      });
      const top = events.slice(0, 8);
      const result: PiExecutionResult = {
        ok: true,
        intent,
        message:
          top.length === 0
            ? "No active events found"
            : `Found ${top.length} active event(s)`,
        data: top,
      };
      await convex.mutation(api.agentRuns.finishRun, {
        runId,
        status: "success",
        response: JSON.stringify(result.data),
      });
      return result;
    }

    if (intent === "find_tickets") {
      const user = input.userId
        ? await convex.query(api.users.getById, { userId: input.userId })
        : null;
      const circleWallet = input.userId
        ? await convex.query(api.wallets.getByUser, { userId: input.userId })
        : null;
      const buyerAddress =
        (input.args?.buyerAddress as string | undefined) ??
        circleWallet?.walletAddress ??
        user?.walletAddress;
      if (!buyerAddress) {
        throw new Error("No linked wallet. Connect wallet first.");
      }
      const tickets = await convex.query(api.tickets.listByBuyer, { buyerAddress });
      const result: PiExecutionResult = {
        ok: true,
        intent,
        message: `Found ${tickets.length} ticket(s)`,
        data: tickets,
      };
      await convex.mutation(api.agentRuns.finishRun, {
        runId,
        status: "success",
        response: JSON.stringify(result.data),
      });
      return result;
    }

    if (intent === "connect_wallet") {
      if (!input.userId) throw new Error("Authenticated user required");
      const wallet = await createOrGetCircleWalletForUser(convex, input.userId);
      const result: PiExecutionResult = {
        ok: true,
        intent,
        message: "Circle wallet linked",
        data: wallet,
      };
      await convex.mutation(api.agentRuns.finishRun, {
        runId,
        status: "success",
        response: JSON.stringify(result.data),
      });
      return result;
    }

    if (intent === "buy_ticket") {
      if (!input.userId) throw new Error("Authenticated user required");
      const eventId =
        (input.args?.eventId as string | undefined) ??
        extractBuyEventId(input.rawInput);
      if (!eventId) {
        throw new Error("Event ID missing. Example: /buy <eventId>");
      }

      const wallet = await createOrGetCircleWalletForUser(convex, input.userId);
      const event = await convex.query(api.events.get, {
        id: eventId as Id<"events">,
      });
      if (!event) throw new Error("Event not found");
      if (event.onChainEventId === undefined) {
        throw new Error("Event missing on-chain event ID");
      }

      const chainResult = await executeBuyTicketWithCircleWallet({
        walletId: wallet.walletId,
        onChainEventId: event.onChainEventId,
        priceUsdc: event.price,
      });
      const purchase = await convex.mutation(api.tickets.recordPurchaseAndIssueQr, {
        eventId: eventId as Id<"events">,
        buyerAddress: wallet.walletAddress,
        buyerAgentId: "pi_telegram",
        purchasePrice: event.price,
        txHash: chainResult.txHash,
      });
      const result: PiExecutionResult = {
        ok: true,
        intent,
        message: "Ticket purchased",
        txHash: chainResult.txHash,
        data: purchase,
      };
      await convex.mutation(api.agentRuns.finishRun, {
        runId,
        status: "success",
        response: JSON.stringify(result.data),
        txHash: chainResult.txHash,
      });
      return result;
    }

    if (intent === "create_event") {
      if (!input.userId) throw new Error("Authenticated user required");
      const me = await convex.query(api.users.getById, { userId: input.userId });
      if (!me || me.role !== "admin") {
        throw new Error("Admin access required for event creation");
      }

      const args = input.args ?? {};
      const required = ["name", "teamId", "startTime", "endTime", "price", "maxTickets"];
      for (const key of required) {
        if (args[key] === undefined) {
          throw new Error(`Missing create_event arg: ${key}`);
        }
      }

      const wallet = await createOrGetCircleWalletForUser(convex, input.userId);
      const createTx = await executeBuyTicketWithCircleWallet({
        walletId: wallet.walletId,
        onChainEventId: 0,
        priceUsdc: 0,
        mode: "create_event",
        eventName: String(args.name),
        maxTickets: Number(args.maxTickets),
      });

      const eventId = await convex.mutation(api.events.create, {
        name: String(args.name),
        description: String(args.description ?? ""),
        startTime: Number(args.startTime),
        endTime: Number(args.endTime),
        price: Number(args.price),
        maxTickets: Number(args.maxTickets),
        teamId: String(args.teamId) as Id<"teams">,
        sponsors: [],
        location: String(args.location ?? ""),
        creatorAddress: wallet.walletAddress,
      });
      const result: PiExecutionResult = {
        ok: true,
        intent,
        message: "Event created",
        txHash: createTx.txHash,
        data: { eventId, onChainEventId: createTx.onChainEventId },
      };
      await convex.mutation(api.agentRuns.finishRun, {
        runId,
        status: "success",
        response: JSON.stringify(result.data),
        txHash: createTx.txHash,
      });
      return result;
    }

    // get_event_qr
    if (!input.userId) throw new Error("Authenticated user required");
    const ticketId =
      (input.args?.ticketId as string | undefined) ??
      extractQrTicketId(input.rawInput);
    if (!ticketId) throw new Error("ticketId is required");
    const ticket = await convex.query(api.tickets.get, {
      id: ticketId as Id<"tickets">,
    });
    if (!ticket) throw new Error("Ticket not found");
    const user = await convex.query(api.users.getById, { userId: input.userId });
    const linkedWallet = await convex.query(api.wallets.getByUser, {
      userId: input.userId,
    });
    if (
      !sameAddress(user?.walletAddress, ticket.buyerAddress) &&
      !sameAddress(linkedWallet?.walletAddress, ticket.buyerAddress)
    ) {
      throw new Error("You do not own this ticket");
    }

    const issued = await convex.mutation(api.qr.issueForTicket, {
      ticketId: ticket._id,
      eventId: ticket.eventId,
      userId: input.userId,
    });

    const result: PiExecutionResult = {
      ok: true,
      intent,
      message: "QR token generated",
      data: issued,
    };
    await convex.mutation(api.agentRuns.finishRun, {
      runId,
      status: "success",
      response: JSON.stringify(result.data),
    });
    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "PI action execution failed";
    await convex.mutation(api.agentRuns.finishRun, {
      runId,
      status: "failed",
      error: message,
    });
    return {
      ok: false,
      intent,
      message,
    };
  }
}
