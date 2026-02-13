import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../convex/_generated/api";
import { getWalletBalance, getCircleConfigForServer } from "../../../../../lib/circle";

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

export async function GET() {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const convex = getConvexClient();
    const serviceToken = getConvexServiceToken();
    const user = await convex.query(api.users.getByClerkId, {
      clerkId: clerkUserId,
      serviceToken,
    });
    if (!user) {
      return NextResponse.json(
        { error: "No profile found. Connect wallet first." },
        { status: 400 },
      );
    }

    const wallet = await convex.query(api.wallets.getByUser, {
      userId: user._id,
      serviceToken,
    });
    if (!wallet) {
      return NextResponse.json(
        { error: "No linked Circle wallet found." },
        { status: 404 },
      );
    }

    const config = getCircleConfigForServer();
    const balances = await getWalletBalance(config.apiKey, wallet.walletId);
    return NextResponse.json({ ok: true, wallet, balances });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to fetch balance",
      },
      { status: 500 },
    );
  }
}
