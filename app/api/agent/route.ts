/// app/api/agent/route.ts — Agent registration and lookup API
/// POST: register agent, GET: lookup agent by wallet

import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";

function getConvexClient() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  }
  return new ConvexHttpClient(convexUrl);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const wallet = url.searchParams.get("wallet");

  if (!wallet) {
    return NextResponse.json(
      { error: "wallet parameter required" },
      { status: 400 },
    );
  }

  try {
    const convex = getConvexClient();
    const agent = await convex.query(api.agents.getByWallet, {
      walletAddress: wallet,
    });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
    return NextResponse.json({ agent });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lookup failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const convex = getConvexClient();
    const body = await request.json();
    const agentId = await convex.mutation(api.agents.register, {
      name: body.name,
      walletAddress: body.walletAddress,
      ownerAddress: body.ownerAddress,
    });

    return NextResponse.json({ agentId }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Registration failed" },
      { status: 400 },
    );
  }
}
