import { json, type RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async () => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const miniAppUrl =
    process.env.PUBLIC_TELEGRAM_MINIAPP_URL ??
    process.env.NEXT_PUBLIC_TELEGRAM_MINIAPP_URL;
  const convexUrl =
    process.env.PUBLIC_CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  const serviceToken = process.env.CONVEX_SERVICE_TOKEN;

  const checks: Record<string, string> = {
    TELEGRAM_BOT_TOKEN: botToken
      ? `set (${botToken.length} chars, ends …${botToken.slice(-4)})`
      : "MISSING",
    TELEGRAM_WEBHOOK_SECRET: webhookSecret
      ? `set (${webhookSecret.length} chars)`
      : "MISSING",
    NEXT_PUBLIC_TELEGRAM_MINIAPP_URL: miniAppUrl ?? "MISSING",
    NEXT_PUBLIC_CONVEX_URL: convexUrl ?? "MISSING",
    CONVEX_SERVICE_TOKEN: serviceToken
      ? `set (${serviceToken.length} chars)`
      : "MISSING",
  };

  if (botToken) {
    try {
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      const payload = await resp.json();
      const botValid = (payload as { ok: boolean }).ok === true;
      checks.BOT_GETME = botValid
        ? `OK (@${(payload as { result: { username: string } }).result.username})`
        : `FAILED: ${JSON.stringify(payload)}`;
    } catch (error) {
      checks.BOT_GETME = `ERROR: ${error instanceof Error ? error.message : "unknown"}`;
    }
  }

  return json({ checks, timestamp: new Date().toISOString() });
};
