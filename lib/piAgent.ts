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

type ParsedPiInput = {
  intent: PiIntent;
  args: Record<string, unknown>;
};

type ChatCompletionsResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

function getConvexClient() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  }
  return new ConvexHttpClient(convexUrl);
}

function getConvexServiceToken() {
  const token = process.env.CONVEX_SERVICE_TOKEN;
  if (!token) {
    throw new Error("CONVEX_SERVICE_TOKEN is not set");
  }
  return token;
}

function isPiIntent(value: unknown): value is PiIntent {
  return (
    value === "find_events" ||
    value === "find_tickets" ||
    value === "connect_wallet" ||
    value === "buy_ticket" ||
    value === "create_event" ||
    value === "get_event_qr"
  );
}

function normalizeArgId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function extractCommandArg(rawInput: string, command: "buy" | "qr") {
  const match = rawInput.match(
    new RegExp(String.raw`\/${command}(?:@[a-zA-Z0-9_]+)?\s+([a-zA-Z0-9_-]+)`, "i"),
  );
  return match?.[1];
}

function parseIntentByKeywords(rawInput: string): ParsedPiInput {
  const input = rawInput.trim().toLowerCase();
  const buyEventId = extractCommandArg(rawInput, "buy");
  const qrTicketId = extractCommandArg(rawInput, "qr");

  if (/^\/events(?:@[a-z0-9_]+)?\b/.test(input)) {
    return { intent: "find_events", args: {} };
  }
  if (/^\/tickets(?:@[a-z0-9_]+)?\b/.test(input)) {
    return { intent: "find_tickets", args: {} };
  }
  if (/^\/wallet(?:@[a-z0-9_]+)?\b/.test(input)) {
    return { intent: "connect_wallet", args: {} };
  }
  if (/^\/buy(?:@[a-z0-9_]+)?\b/.test(input)) {
    return { intent: "buy_ticket", args: buyEventId ? { eventId: buyEventId } : {} };
  }
  if (/^\/create(?:@[a-z0-9_]+)?\b/.test(input)) {
    return { intent: "create_event", args: {} };
  }
  if (/^\/qr(?:@[a-z0-9_]+)?\b/.test(input)) {
    return { intent: "get_event_qr", args: qrTicketId ? { ticketId: qrTicketId } : {} };
  }

  if (input.includes("find") && input.includes("event")) {
    return { intent: "find_events", args: {} };
  }
  if (input.includes("ticket") && input.includes("my")) {
    return { intent: "find_tickets", args: {} };
  }
  if (input.includes("connect") && input.includes("wallet")) {
    return { intent: "connect_wallet", args: {} };
  }
  if (input.includes("buy") && (input.includes("ticket") || input.includes("event"))) {
    return { intent: "buy_ticket", args: buyEventId ? { eventId: buyEventId } : {} };
  }
  if (input.includes("create") && input.includes("event")) {
    return { intent: "create_event", args: {} };
  }
  if (input.includes("qr")) {
    return { intent: "get_event_qr", args: qrTicketId ? { ticketId: qrTicketId } : {} };
  }
  return { intent: "find_events", args: {} };
}

async function classifyIntentWithLlm(rawInput: string): Promise<ParsedPiInput | null> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.OPENROUTER_MODEL?.trim() || "z-ai/glm-5";
  const controller = new AbortController();
  const timeoutFromEnv = Number(process.env.PI_INTENT_TIMEOUT_MS ?? 4000);
  const timeoutMs =
    Number.isFinite(timeoutFromEnv) && timeoutFromEnv > 0 ? timeoutFromEnv : 4000;
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        ...(process.env.NEXT_PUBLIC_APP_URL
          ? { "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL }
          : {}),
        ...(process.env.OPENROUTER_APP_NAME
          ? { "X-Title": process.env.OPENROUTER_APP_NAME }
          : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "Classify the user request into one PI intent and extract IDs when present.",
              "Allowed intents: find_events, find_tickets, connect_wallet, buy_ticket, create_event, get_event_qr.",
              "Return only JSON with shape: {\"intent\":\"...\",\"args\":{\"eventId\":\"...\",\"ticketId\":\"...\"}}.",
              "Use args only when explicitly present in the user text.",
              "If uncertain, choose find_events and keep args empty.",
            ].join(" "),
          },
          { role: "user", content: rawInput },
        ],
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) return null;

    const completion = (await response.json()) as ChatCompletionsResponse;
    const content = completion.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as {
      intent?: unknown;
      args?: Record<string, unknown>;
    };
    if (!isPiIntent(parsed.intent)) return null;

    const args: Record<string, unknown> = {};
    const eventId = normalizeArgId(parsed.args?.eventId);
    const ticketId = normalizeArgId(parsed.args?.ticketId);
    if (eventId) args.eventId = eventId;
    if (ticketId) args.ticketId = ticketId;

    return { intent: parsed.intent, args };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function parseIntentAndArgs(
  rawInput: string,
  keywordFallback: ParsedPiInput,
): Promise<ParsedPiInput> {
  const looksLikeSlashCommand = rawInput.trim().startsWith("/");
  if (looksLikeSlashCommand) return keywordFallback;

  const llm = await classifyIntentWithLlm(rawInput);
  if (!llm) return keywordFallback;

  return {
    intent: llm.intent,
    args: {
      ...keywordFallback.args,
      ...llm.args,
    },
  };
}

function sameAddress(a?: string, b?: string) {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export async function executePiAction(
  input: PiExecutionInput,
): Promise<PiExecutionResult> {
  const convex = getConvexClient();
  const serviceToken = getConvexServiceToken();
  const keywordParse = parseIntentByKeywords(input.rawInput);
  const parsed = input.intent ? null : await parseIntentAndArgs(input.rawInput, keywordParse);
  const intent = input.intent ?? parsed?.intent ?? keywordParse.intent;
  const args = {
    ...keywordParse.args,
    ...(parsed?.args ?? {}),
    ...(input.args ?? {}),
  };

  const runId = await convex.mutation(api.agentRuns.startRun, {
    userId: input.userId,
    source: input.source,
    intent,
    rawInput: input.rawInput,
    normalizedArgs: Object.keys(args).length > 0 ? JSON.stringify(args) : undefined,
    serviceToken,
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
        serviceToken,
      });
      return result;
    }

    if (intent === "find_tickets") {
      const user = input.userId
        ? await convex.query(api.users.getById, { userId: input.userId, serviceToken })
        : null;
      const circleWallet = input.userId
        ? await convex.query(api.wallets.getByUser, { userId: input.userId, serviceToken })
        : null;
      const buyerAddress =
        (args.buyerAddress as string | undefined) ??
        circleWallet?.walletAddress ??
        user?.walletAddress;
      if (!buyerAddress) {
        throw new Error("No linked wallet. Connect wallet first.");
      }
      const tickets = await convex.query(api.tickets.listByBuyer, {
        buyerAddress,
        serviceToken,
      });
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
        serviceToken,
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
        serviceToken,
      });
      return result;
    }

    if (intent === "buy_ticket") {
      if (!input.userId) throw new Error("Authenticated user required");
      const eventId =
        (args.eventId as string | undefined) ??
        extractCommandArg(input.rawInput, "buy");
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
        serviceToken,
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
        serviceToken,
      });
      return result;
    }

    if (intent === "create_event") {
      if (!input.userId) throw new Error("Authenticated user required");
      const me = await convex.query(api.users.getById, { userId: input.userId, serviceToken });
      if (!me || me.role !== "admin") {
        throw new Error("Admin access required for event creation");
      }

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
        serviceToken,
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
        serviceToken,
      });
      return result;
    }

    // get_event_qr
    if (!input.userId) throw new Error("Authenticated user required");
    const ticketId =
      (args.ticketId as string | undefined) ??
      extractCommandArg(input.rawInput, "qr");
    if (!ticketId) throw new Error("ticketId is required");
    const ticket = await convex.query(api.tickets.get, {
      id: ticketId as Id<"tickets">,
      serviceToken,
    });
    if (!ticket) throw new Error("Ticket not found");
    const user = await convex.query(api.users.getById, { userId: input.userId, serviceToken });
    const linkedWallet = await convex.query(api.wallets.getByUser, {
      userId: input.userId,
      serviceToken,
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
      serviceToken,
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
      serviceToken,
    });
    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "PI action execution failed";
    await convex.mutation(api.agentRuns.finishRun, {
      runId,
      status: "failed",
      error: message,
      serviceToken,
    });
    return {
      ok: false,
      intent,
      message,
    };
  }
}
