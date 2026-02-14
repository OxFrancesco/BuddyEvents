import { NextResponse } from "next/server";

export async function GET() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const miniAppUrl = process.env.NEXT_PUBLIC_TELEGRAM_MINIAPP_URL;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const serviceToken = process.env.CONVEX_SERVICE_TOKEN;

  const checks: Record<string, string> = {
    TELEGRAM_BOT_TOKEN: botToken ? `set (${botToken.length} chars, ends …${botToken.slice(-4)})` : "MISSING",
    TELEGRAM_WEBHOOK_SECRET: webhookSecret ? `set (${webhookSecret.length} chars)` : "MISSING",
    NEXT_PUBLIC_TELEGRAM_MINIAPP_URL: miniAppUrl ?? "MISSING",
    NEXT_PUBLIC_CONVEX_URL: convexUrl ?? "MISSING",
    CONVEX_SERVICE_TOKEN: serviceToken ? `set (${serviceToken.length} chars)` : "MISSING",
  };

  // Quick bot token validity test
  let botValid = false;
  if (botToken) {
    try {
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      const json = await resp.json();
      botValid = (json as { ok: boolean }).ok === true;
      checks.BOT_GETME = botValid ? `OK (@${(json as { result: { username: string } }).result.username})` : `FAILED: ${JSON.stringify(json)}`;
    } catch (e) {
      checks.BOT_GETME = `ERROR: ${e instanceof Error ? e.message : "unknown"}`;
    }
  }

  return NextResponse.json({ checks, timestamp: new Date().toISOString() });
}
