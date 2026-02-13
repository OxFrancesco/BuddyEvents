import { createHmac, timingSafeEqual } from "node:crypto";

export type TelegramMiniAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

export type TelegramInitData = {
  authDate: number;
  user: TelegramMiniAppUser;
  queryId?: string;
  raw: string;
};

function parseInitData(initData: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    throw new Error("Telegram initData missing hash");
  }
  params.delete("hash");

  const pairs = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);
  const dataCheckString = pairs.join("\n");

  return { params, hash, dataCheckString };
}

export function verifyTelegramInitData(initData: string, botToken: string) {
  const { hash, dataCheckString } = parseInitData(initData);

  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const computed = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const expected = Buffer.from(hash, "hex");
  const actual = Buffer.from(computed, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function readTelegramInitData(
  initData: string,
  maxAgeSeconds: number = 600,
): TelegramInitData {
  const params = new URLSearchParams(initData);
  const userRaw = params.get("user");
  const authDateRaw = params.get("auth_date");

  if (!userRaw || !authDateRaw) {
    throw new Error("Telegram initData missing user/auth_date");
  }

  const user = JSON.parse(userRaw) as TelegramMiniAppUser;
  const authDate = Number(authDateRaw);
  if (!Number.isFinite(authDate)) {
    throw new Error("Invalid Telegram auth_date");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - authDate > maxAgeSeconds) {
    throw new Error("Telegram initData expired");
  }

  return {
    authDate,
    user,
    queryId: params.get("query_id") ?? undefined,
    raw: initData,
  };
}
