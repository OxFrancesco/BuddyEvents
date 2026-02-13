import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { api } from "../../../../../convex/_generated/api";
import { createOrGetCircleWalletForUser } from "../../../../../lib/circle";

function getConvexClient() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(convexUrl);
}

export async function POST() {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const convex = getConvexClient();
    let user = await convex.query(api.users.getByClerkId, { clerkId: clerkUserId });
    if (!user) {
      const clerk = await clerkClient();
      const clerkUser = await clerk.users.getUser(clerkUserId);
      const createdId = await convex.mutation(api.users.upsertByClerkId, {
        clerkId: clerkUserId,
        email: clerkUser.primaryEmailAddress?.emailAddress,
      });
      user = await convex.query(api.users.getById, { userId: createdId });
    }
    if (!user) throw new Error("Failed to create user profile");

    const wallet = await createOrGetCircleWalletForUser(convex, user._id);
    return NextResponse.json({ ok: true, wallet });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Wallet link failed" },
      { status: 500 },
    );
  }
}
