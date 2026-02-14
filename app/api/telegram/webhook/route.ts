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

function formatGenericResponse(result: PiExecutionResult): string {
  const status = result.ok ? "✅" : "❌";
  let text = `${status} ${result.message}`;
  if (result.txHash) {
    text += `\n🔗 Tx: \`${result.txHash}\``;
  }
  if (
    result.data &&
    (Array.isArray(result.data) || typeof result.data === "object")
  ) {
    const json = JSON.stringify(result.data, null, 2);
    if (json.length > 10) {
      text += `\n\n\`\`\`\n${json.slice(0, 1500)}\n\`\`\``;
    }
  }
  return text;
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
      const rows = [...buttons];
      if (miniAppBtn) rows.push([miniAppBtn]);
      await sendTelegramMessage({
        chat_id: chatId,
        text: msgText,
        parse_mode: "Markdown",
        reply_markup: rows.length > 0 ? { inline_keyboard: rows } : undefined,
      });
    } else {
      const msgText = formatGenericResponse(result);
      const rows: TelegramInlineKeyboardButton[][] = [];
      if (miniAppBtn) rows.push([miniAppBtn]);
      await sendTelegramMessage({
        chat_id: chatId,
        text: msgText,
        parse_mode: "Markdown",
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
