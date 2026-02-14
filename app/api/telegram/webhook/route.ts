import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { executePiAction } from "../../../../lib/piAgent";
import {
  buildMiniAppKeyboard,
  sendTelegramMessage,
  verifyTelegramWebhookSecret,
} from "../../../../lib/telegram";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id: number };
    from?: { id: number; username?: string };
  };
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

  try {
    if (command === "/start") {
      console.log("[telegram/webhook] /start from chat", chatId);
      await sendTelegramMessage({
        chat_id: chatId,
        text: "Welcome to BuddyEvents PI Agent.\nSend /help for commands and tips.",
        reply_markup: buildMiniAppKeyboard(),
      });
      return NextResponse.json({ ok: true });
    }

    if (command === "/help") {
      await sendTelegramMessage({
        chat_id: chatId,
        text: HELP_MESSAGE,
        reply_markup: buildMiniAppKeyboard(),
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

    const details =
      result.data && (Array.isArray(result.data) || typeof result.data === "object")
        ? `\n\n${JSON.stringify(result.data, null, 2).slice(0, 2000)}`
        : "";
    await sendTelegramMessage({
      chat_id: chatId,
      text: `${result.ok ? "OK" : "ERROR"}: ${result.message}${details}`,
      reply_markup: buildMiniAppKeyboard(),
    });
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
