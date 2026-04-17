import { json, type RequestHandler } from "@sveltejs/kit";
import { api } from "@/convex/_generated/api";
import {
  readTelegramInitData,
  verifyTelegramInitData,
} from "@/lib/telegramAuth";
import { getClerkClient } from "$lib/server/services/clerk";
import {
  getConvexClient,
  getConvexServiceToken,
} from "$lib/server/services/convex";

export const POST: RequestHandler = async (event) => {
  try {
    const body = (await event.request.json()) as {
      initData?: string;
      walletAddress?: string;
    };
    const initData = body.initData?.trim();
    if (!initData) {
      return json({ error: "initData is required" }, { status: 400 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return json(
        { error: "TELEGRAM_BOT_TOKEN missing on server" },
        { status: 500 },
      );
    }

    if (!verifyTelegramInitData(initData, botToken)) {
      return json(
        { error: "Invalid Telegram init data signature" },
        { status: 401 },
      );
    }

    const parsed = readTelegramInitData(initData, 10 * 60);
    const telegramUserId = String(parsed.user.id);
    const walletAddress = body.walletAddress?.trim();

    const convex = getConvexClient();
    const clerkClient = getClerkClient();
    const serviceToken = getConvexServiceToken();

    const linked = await convex.query(api.users.getByTelegramUserId, {
      telegramUserId,
      serviceToken,
    });

    let clerkUserId = linked?.clerkId;
    if (!clerkUserId && walletAddress) {
      const byWallet = await convex.query(api.users.getByWallet, {
        walletAddress,
        serviceToken,
      });
      clerkUserId = byWallet?.clerkId;
    }

    if (!clerkUserId) {
      const externalId = `tg:${telegramUserId}`;
      const existing = await clerkClient.users.getUserList({
        externalId: [externalId],
        limit: 1,
      });
      if (existing.data.length > 0) {
        clerkUserId = existing.data[0].id;
      } else {
        const created = await clerkClient.users.createUser({
          externalId,
          firstName: parsed.user.first_name,
          lastName: parsed.user.last_name,
          skipLegalChecks: true,
        });
        clerkUserId = created.id;
      }
    }

    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    await convex.mutation(api.users.upsertTelegramLink, {
      clerkId: clerkUserId,
      email: clerkUser.primaryEmailAddress?.emailAddress,
      walletAddress,
      telegramUserId,
      telegramUsername: parsed.user.username,
      telegramFirstName: parsed.user.first_name,
      telegramLastName: parsed.user.last_name,
      telegramPhotoUrl: parsed.user.photo_url,
      serviceToken,
    });

    const signInToken = await clerkClient.signInTokens.createSignInToken({
      userId: clerkUserId,
      expiresInSeconds: 300,
    });

    return json({
      ok: true,
      clerkUserId,
      ticket: signInToken.token,
      expiresInSeconds: 300,
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Auth start failed",
      },
      { status: 500 },
    );
  }
};
