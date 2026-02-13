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

export async function POST(request: Request) {
  try {
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

    if (text === "/start") {
      await sendTelegramMessage({
        chat_id: chatId,
        text:
          "Welcome to BuddyEvents PI Agent.\nUse /events, /tickets, /buy <eventId>, /wallet, /qr <ticketId>.",
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Webhook failed" },
      { status: 500 },
    );
  }
}
