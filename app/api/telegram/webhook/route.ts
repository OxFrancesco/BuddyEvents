import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { executePiAction } from "../../../../lib/piAgent";
import type { PiExecutionResult } from "../../../../lib/piAgent";
import {
  sendTelegramMessage,
  verifyTelegramWebhookSecret,
} from "../../../../lib/telegram";

type TelegramInlineKeyboardButton = {
  text: string;
  url?: string;
  web_app?: { url: string };
};

type ChatCompletionsResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id: number };
    from?: { id: number; username?: string };
  };
};

type EventData = {
  _id: string;
  name: string;
  description?: string;
  startTime: number;
  endTime: number;
  location?: string;
  price: number;
  maxTickets: number;
  ticketsSold?: number;
  status?: string;
};

const HELP_MESSAGE = [
  "BuddyEvents PI Agent Commands:",
  "- /events list active events",
  "- /tickets list your tickets",
  "- /wallet connect or fetch wallet",
  "- /buy <eventId> purchase a ticket",
  "- /qr <ticketId> generate a QR token",
  "",
  "Tips:",
  "- Use /events to get event IDs.",
  "- Open the Mini App for richer flows.",
].join("\n");

function getConvexClient() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(convexUrl);
}

function getConvexServiceToken() {
  const token = process.env.CONVEX_SERVICE_TOKEN;
  if (!token) throw new Error("CONVEX_SERVICE_TOKEN is not set");
  return token;
}

function parseCommand(text: string): string {
  const firstToken = text.split(/\s+/)[0] ?? "";
  return firstToken.split("@")[0].toLowerCase();
}

function toGCalDate(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function buildGCalUrl(event: EventData): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.name,
    dates: `${toGCalDate(event.startTime)}/${toGCalDate(event.endTime)}`,
    details: event.description || `BuddyEvents · ${event.price === 0 ? "Free" : `$${event.price}`} · ID: ${event._id}`,
    location: event.location || "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function buildMiniAppButton(): TelegramInlineKeyboardButton | null {
  const miniAppUrl = process.env.NEXT_PUBLIC_TELEGRAM_MINIAPP_URL;
  if (!miniAppUrl) return null;
  return { text: "🚀 Open Mini App", web_app: { url: miniAppUrl } };
}

function formatEventCard(event: EventData, index: number): string {
  const start = new Date(event.startTime);
  const end = new Date(event.endTime);
  const dateStr = start.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const timeStr = `${start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} – ${end.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}`;
  const price = event.price === 0 ? "Free" : `$${event.price}`;
  const tickets =
    event.ticketsSold !== undefined
      ? `${event.maxTickets - event.ticketsSold}/${event.maxTickets} left`
      : `${event.maxTickets} total`;

  const lines = [
    `${index + 1}. *${event.name}*`,
    `   📅 ${dateStr}`,
    `   🕐 ${timeStr} UTC`,
  ];
  if (event.location) lines.push(`   📍 ${event.location}`);
  lines.push(`   🎟 ${price} · ${tickets}`);
  lines.push(`   ID: \`${event._id}\``);
  return lines.join("\n");
}

function formatEventsResponse(result: PiExecutionResult): {
  text: string;
  buttons: TelegramInlineKeyboardButton[][];
} {
  const events = (Array.isArray(result.data) ? result.data : []) as EventData[];
  if (events.length === 0) {
    return { text: "📭 No active events right now.", buttons: [] };
  }

  const header = `🎉 *${events.length} Active Event${events.length > 1 ? "s" : ""}*\n`;
  const cards = events.map((e, i) => formatEventCard(e, i)).join("\n\n");
  const footer = "\n\n_Use /buy <ID> to purchase a ticket_";

  const buttons: TelegramInlineKeyboardButton[][] = events.map((e) => [
    { text: `📅 Add "${e.name}" to Calendar`, url: buildGCalUrl(e) },
  ]);

  return { text: header + cards + footer, buttons };
}

function asRecord(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return data as Record<string, unknown>;
}

function fmtUtc(ms: unknown): string | null {
  if (typeof ms !== "number") return null;
  return new Date(ms).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

function formatFailure(result: PiExecutionResult): string {
  if (result.message.includes("Authenticated user required")) {
    return [
      "🔒 I need your account linked before I can do that.",
      "Open the BuddyEvents Mini App once, then try again.",
    ].join("\n");
  }
  return `❌ I couldn't complete that request: ${result.message}`;
}

function formatGenericResponse(result: PiExecutionResult): string {
  if (!result.ok) return formatFailure(result);

  if (result.intent === "find_tickets") {
    const tickets = Array.isArray(result.data) ? result.data : [];
    if (tickets.length === 0) {
      return "🎟 You don't have any tickets yet. Use /events to find one, then /buy <eventId>.";
    }
    const rows = tickets.slice(0, 8).map((ticket, index) => {
      const rec = asRecord(ticket);
      const ticketId = rec?._id ?? rec?.ticketId ?? "unknown";
      const eventId = rec?.eventId ?? "unknown";
      const status = rec?.status ?? "active";
      return `${index + 1}. Ticket \`${String(ticketId)}\` for event \`${String(eventId)}\` (${String(status)})`;
    });
    return [
      `🎟 You have ${tickets.length} ticket${tickets.length === 1 ? "" : "s"}.`,
      ...rows,
      "",
      "Need a fresh QR? Send /qr <ticketId>.",
    ].join("\n");
  }

  if (result.intent === "connect_wallet") {
    const data = asRecord(result.data);
    const walletAddress = data?.walletAddress;
    const blockchain = data?.blockchain;
    return [
      "✅ Your wallet is connected.",
      walletAddress ? `Address: \`${String(walletAddress)}\`` : null,
      blockchain ? `Network: ${String(blockchain)}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (result.intent === "buy_ticket") {
    const data = asRecord(result.data);
    const ticketId = data?.ticketId;
    const expiry = fmtUtc(data?.qrTokenExpiresAt);
    return [
      "✅ Your ticket purchase is complete.",
      ticketId ? `Ticket ID: \`${String(ticketId)}\`` : null,
      result.txHash ? `Transaction: \`${result.txHash}\`` : null,
      expiry ? `QR expires at: ${expiry} UTC` : null,
      "",
      ticketId ? `To refresh your QR later: /qr ${String(ticketId)}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (result.intent === "get_event_qr") {
    const data = asRecord(result.data);
    const token = data?.token;
    const expiry = fmtUtc(data?.expiresAt);
    return [
      "✅ I generated a new QR token for your ticket.",
      token ? `Token: \`${String(token)}\`` : null,
      expiry ? `Expires at: ${expiry} UTC` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (result.intent === "create_event") {
    const data = asRecord(result.data);
    const eventId = data?.eventId;
    return [
      "✅ Event created successfully.",
      eventId ? `Event ID: \`${String(eventId)}\`` : null,
      result.txHash ? `Transaction: \`${result.txHash}\`` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return `✅ ${result.message}`;
}

function shouldUseLlmReplies() {
  return process.env.PI_TELEGRAM_LLM_REPLIES?.toLowerCase() !== "false";
}

function getReplyModel() {
  return (
    process.env.OPENROUTER_REPLY_MODEL?.trim() ||
    process.env.OPENROUTER_MODEL?.trim() ||
    "z-ai/glm-5"
  );
}

function getReplyTimeoutMs() {
  const timeoutFromEnv = Number(process.env.PI_TELEGRAM_REPLY_TIMEOUT_MS ?? 5000);
  return Number.isFinite(timeoutFromEnv) && timeoutFromEnv > 0 ? timeoutFromEnv : 5000;
}

function looksLikeSmallTalk(input: string) {
  const text = input.trim().toLowerCase();
  if (!text || text.startsWith("/")) return false;
  return (
    /^(hi|hello|hey|yo)\b/.test(text) ||
    /\bhow are you\b/.test(text) ||
    /\bwhat('?| i)s up\b/.test(text) ||
    /\bthanks?\b/.test(text) ||
    /\bgood (morning|afternoon|evening)\b/.test(text)
  );
}

async function maybeGenerateSmallTalkReply(userInput: string): Promise<string | null> {
  if (!shouldUseLlmReplies()) return null;

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;

  const model = getReplyModel();
  const timeoutMs = getReplyTimeoutMs();
  const controller = new AbortController();
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
        temperature: 0.6,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You are BuddyEvents Telegram assistant.",
              "For small-talk, answer naturally in 1-2 short sentences.",
              "Then suggest one concrete next action related to events.",
              "Return JSON only in shape: {\"text\":\"...\"}.",
            ].join(" "),
          },
          { role: "user", content: userInput },
        ],
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) return null;
    const completion = (await response.json()) as ChatCompletionsResponse;
    const content = completion.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as { text?: unknown };
    if (typeof parsed.text !== "string") return null;

    const text = parsed.text.trim();
    return text ? text.slice(0, 3500) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function maybeGenerateLlmReply(args: {
  userInput: string;
  result: PiExecutionResult;
  fallbackText: string;
}): Promise<string | null> {
  if (!shouldUseLlmReplies()) return null;

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;

  const model = getReplyModel();
  const timeoutMs = getReplyTimeoutMs();

  const controller = new AbortController();
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
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You are BuddyEvents Telegram assistant.",
              "Write a short, natural, helpful reply in plain text.",
              "Use only facts in the provided JSON.",
              "Never invent IDs, tx hashes, prices, or dates.",
              "If an action failed, explain briefly and suggest the next command.",
              "Return JSON only in shape: {\"text\":\"...\"}.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              userInput: args.userInput,
              intent: args.result.intent,
              ok: args.result.ok,
              message: args.result.message,
              txHash: args.result.txHash,
              data: args.result.data ?? null,
              fallbackText: args.fallbackText,
            }),
          },
        ],
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) return null;

    const completion = (await response.json()) as ChatCompletionsResponse;
    const content = completion.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as { text?: unknown };
    if (typeof parsed.text !== "string") return null;

    const trimmed = parsed.text.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, 3500);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export async function POST(request: Request) {
  const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
  if (!verifyTelegramWebhookSecret(secretHeader)) {
    return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate;
  const text = update.message?.text?.trim();
  const chatId = update.message?.chat?.id;
  const telegramUserId = update.message?.from?.id;

  if (!text || !chatId) {
    return NextResponse.json({ ok: true });
  }

  const command = parseCommand(text);

  const miniAppBtn = buildMiniAppButton();

  try {
    if (looksLikeSmallTalk(text)) {
      const smallTalk = await maybeGenerateSmallTalkReply(text);
      if (smallTalk) {
        const rows: TelegramInlineKeyboardButton[][] = [];
        if (miniAppBtn) rows.push([miniAppBtn]);
        await sendTelegramMessage({
          chat_id: chatId,
          text: smallTalk,
          reply_markup: rows.length > 0 ? { inline_keyboard: rows } : undefined,
        });
        return NextResponse.json({ ok: true });
      }
    }

    if (command === "/start") {
      console.log("[telegram/webhook] /start from chat", chatId);
      const rows: TelegramInlineKeyboardButton[][] = [];
      if (miniAppBtn) rows.push([miniAppBtn]);
      await sendTelegramMessage({
        chat_id: chatId,
        text: "👋 *Welcome to BuddyEvents!*\n\nYour event companion on Telegram.\nSend /help for commands and tips.",
        parse_mode: "Markdown",
        reply_markup: rows.length > 0 ? { inline_keyboard: rows } : undefined,
      });
      return NextResponse.json({ ok: true });
    }

    if (command === "/help") {
      const rows: TelegramInlineKeyboardButton[][] = [];
      if (miniAppBtn) rows.push([miniAppBtn]);
      await sendTelegramMessage({
        chat_id: chatId,
        text: HELP_MESSAGE,
        parse_mode: "Markdown",
        reply_markup: rows.length > 0 ? { inline_keyboard: rows } : undefined,
      });
      return NextResponse.json({ ok: true });
    }

    const convex = getConvexClient();
    const serviceToken = getConvexServiceToken();
    const user = telegramUserId
      ? await convex.query(api.users.getByTelegramUserId, {
          telegramUserId: String(telegramUserId),
          serviceToken,
        })
      : null;

    const result = await executePiAction({
      source: "telegram_bot",
      rawInput: text,
      userId: user?._id,
    });

    if (result.intent === "find_events") {
      const { text: msgText, buttons } = formatEventsResponse(result);
      const llmText = await maybeGenerateLlmReply({
        userInput: text,
        result,
        fallbackText: msgText,
      });
      const rows = [...buttons];
      if (miniAppBtn) rows.push([miniAppBtn]);
      await sendTelegramMessage({
        chat_id: chatId,
        text: llmText ?? msgText,
        parse_mode: llmText ? undefined : "Markdown",
        reply_markup: rows.length > 0 ? { inline_keyboard: rows } : undefined,
      });
    } else {
      const msgText = formatGenericResponse(result);
      const llmText = await maybeGenerateLlmReply({
        userInput: text,
        result,
        fallbackText: msgText,
      });
      const rows: TelegramInlineKeyboardButton[][] = [];
      if (miniAppBtn) rows.push([miniAppBtn]);
      await sendTelegramMessage({
        chat_id: chatId,
        text: llmText ?? msgText,
        parse_mode: llmText ? undefined : "Markdown",
        reply_markup: rows.length > 0 ? { inline_keyboard: rows } : undefined,
      });
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[telegram/webhook] Failed for chat", chatId, "command", command, "error:", errMsg);
    try {
      await sendTelegramMessage({
        chat_id: chatId,
        text: `⚠️ Something went wrong: ${errMsg.slice(0, 200)}`,
      });
    } catch (replyErr) {
      console.error("[telegram/webhook] Reply-with-error also failed:", replyErr);
    }
  }

  return NextResponse.json({ ok: true });
}
