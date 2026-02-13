import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { readTelegramInitData, verifyTelegramInitData } from "../../../../../lib/telegramAuth";

function getConvexClient() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(convexUrl);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      initData?: string;
      walletAddress?: string;
    };
    const initData = body.initData?.trim();
    if (!initData) {
      return NextResponse.json({ error: "initData is required" }, { status: 400 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json(
        { error: "TELEGRAM_BOT_TOKEN missing on server" },
        { status: 500 },
      );
    }

    if (!verifyTelegramInitData(initData, botToken)) {
      return NextResponse.json(
        { error: "Invalid Telegram init data signature" },
        { status: 401 },
      );
    }

    const parsed = readTelegramInitData(initData, 10 * 60);
    const telegramUserId = String(parsed.user.id);
    const walletAddress = body.walletAddress?.trim();

    const convex = getConvexClient();
    const clerk = await clerkClient();

    const linked = await convex.query(api.users.getByTelegramUserId, {
      telegramUserId,
    });

    let clerkUserId = linked?.clerkId;
    if (!clerkUserId && walletAddress) {
      const byWallet = await convex.query(api.users.getByWallet, { walletAddress });
      clerkUserId = byWallet?.clerkId;
    }

    if (!clerkUserId) {
      const externalId = `tg:${telegramUserId}`;
      const existing = await clerk.users.getUserList({
        externalId: [externalId],
        limit: 1,
      });
      if (existing.data.length > 0) {
        clerkUserId = existing.data[0].id;
      } else {
        const created = await clerk.users.createUser({
          externalId,
          firstName: parsed.user.first_name,
          lastName: parsed.user.last_name,
          skipLegalChecks: true,
        });
        clerkUserId = created.id;
      }
    }

    const clerkUser = await clerk.users.getUser(clerkUserId);
    await convex.mutation(api.users.upsertTelegramLink, {
      clerkId: clerkUserId,
      email: clerkUser.primaryEmailAddress?.emailAddress,
      walletAddress,
      telegramUserId,
      telegramUsername: parsed.user.username,
      telegramFirstName: parsed.user.first_name,
      telegramLastName: parsed.user.last_name,
      telegramPhotoUrl: parsed.user.photo_url,
    });

    const signInToken = await clerk.signInTokens.createSignInToken({
      userId: clerkUserId,
      expiresInSeconds: 300,
    });

    return NextResponse.json({
      ok: true,
      clerkUserId,
      ticket: signInToken.token,
      expiresInSeconds: 300,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Auth start failed",
      },
      { status: 500 },
    );
  }
}
