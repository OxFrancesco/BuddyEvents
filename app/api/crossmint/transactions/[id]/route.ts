import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { auth } from "@clerk/nextjs/server";
import { api } from "@/convex/_generated/api";
import { getHumanTransaction } from "@/lib/crossmint/server";

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

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const convex = getConvexClient();
    const actor = await convex.query(api.users.getByClerkId, {
      clerkId: clerkUserId,
      serviceToken: getConvexServiceToken(),
    });
    if (!actor) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const response = await getHumanTransaction({
      convex,
      userId: actor._id,
      transactionId: id,
    });

    return NextResponse.json({ ok: true, ...response });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Crossmint transaction lookup failed",
      },
      { status: 500 },
    );
  }
}
