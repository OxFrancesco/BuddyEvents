/// app/api/teams/route.ts — Team management API
/// GET: list teams, POST: create team

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

export async function GET() {
  try {
    const convex = getConvexClient();
    const teams = await convex.query(api.teams.list, {});
    return NextResponse.json({ teams });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list teams" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const convex = getConvexClient();
    const body = await request.json();
    const teamId = await convex.mutation(api.teams.create, {
      name: body.name,
      description: body.description ?? "",
      walletAddress: body.walletAddress,
      members: body.members ?? [],
    });

    return NextResponse.json({ teamId }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create team" },
      { status: 400 },
    );
  }
}
