import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { api } from "@/convex/_generated/api";
import { ensureHumanCrossmintWalletForUser } from "@/lib/crossmint/server";

function getConvexClient() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  }
  return new ConvexHttpClient(convexUrl);
}

function getConvexServiceToken() {
  const token = process.env.CONVEX_SERVICE_TOKEN;
  if (!token) {
    throw new Error("CONVEX_SERVICE_TOKEN is not set");
  }
  return token;
}

async function ensureUserRecord(convex: ConvexHttpClient, clerkUserId: string) {
  const serviceToken = getConvexServiceToken();
  let user = await convex.query(api.users.getByClerkId, {
    clerkId: clerkUserId,
    serviceToken,
  });

  if (user) {
    return user;
  }

  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(clerkUserId);
  const createdId = await convex.mutation(api.users.upsertByClerkId, {
    clerkId: clerkUserId,
    email: clerkUser.primaryEmailAddress?.emailAddress,
    serviceToken,
  });

  user = await convex.query(api.users.getById, {
    userId: createdId,
    serviceToken,
  });

  if (!user) {
    throw new Error("Failed to create user profile");
  }

  return user;
}

export async function POST(request: Request) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      signerAddress?: string;
      forceRelink?: boolean;
    };

    if (!body.signerAddress) {
      return NextResponse.json(
        { error: "signerAddress is required" },
        { status: 400 },
      );
    }

    const convex = getConvexClient();
    const user = await ensureUserRecord(convex, clerkUserId);
    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(clerkUserId);
    const email = clerkUser.primaryEmailAddress?.emailAddress;

    if (!email) {
      return NextResponse.json(
        { error: "A primary email is required before provisioning a smart wallet." },
        { status: 400 },
      );
    }

    const wallet = await ensureHumanCrossmintWalletForUser({
      convex,
      user,
      email,
      signerAddress: body.signerAddress,
      forceRelink: body.forceRelink,
    });

    return NextResponse.json({ ok: true, wallet, relinked: !!body.forceRelink });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Crossmint wallet provisioning failed";
    const status = message.toLowerCase().includes("confirmation required") ? 409 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
