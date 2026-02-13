type TelegramApiResult<T> = {
  ok: boolean;
  result: T;
};

type TelegramInlineKeyboardButton = {
  text: string;
  url?: string;
  web_app?: { url: string };
  callback_data?: string;
};

type TelegramSendMessageArgs = {
  chat_id: number | string;
  text: string;
  parse_mode?: "Markdown" | "HTML";
  reply_markup?: {
    inline_keyboard: TelegramInlineKeyboardButton[][];
  };
};

function getBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return token;
}

function getWebhookSecret() {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) throw new Error("TELEGRAM_WEBHOOK_SECRET is not configured");
  return secret;
}

export async function callTelegramApi<T>(
  method: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const token = getBotToken();
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API HTTP ${response.status}: ${body}`);
  }

  const json = (await response.json()) as TelegramApiResult<T>;
  if (!json.ok) throw new Error(`Telegram API method ${method} failed`);
  return json.result;
}

export async function sendTelegramMessage(args: TelegramSendMessageArgs) {
  return await callTelegramApi("sendMessage", args as Record<string, unknown>);
}

export async function editTelegramMessageText(args: {
  chat_id: number | string;
  message_id: number;
  text: string;
  parse_mode?: "Markdown" | "HTML";
}) {
  return await callTelegramApi(
    "editMessageText",
    args as Record<string, unknown>,
  );
}

export function verifyTelegramWebhookSecret(headerValue: string | null) {
  return headerValue === getWebhookSecret();
}

export function buildMiniAppKeyboard() {
  const miniAppUrl = process.env.NEXT_PUBLIC_TELEGRAM_MINIAPP_URL;
  if (!miniAppUrl) {
    return undefined;
  }
  return {
    inline_keyboard: [
      [{ text: "Open BuddyEvents Mini App", web_app: { url: miniAppUrl } }],
    ],
  };
}
