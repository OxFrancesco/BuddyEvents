import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { auth } from "@clerk/nextjs/server";
import { api } from "@/convex/_generated/api";
import { approveHumanTransaction } from "@/lib/crossmint/server";

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

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      signerAddress?: string;
      signature?: string;
    };

    if (!body.signerAddress || !body.signature) {
      return NextResponse.json(
        { error: "signerAddress and signature are required" },
        { status: 400 },
      );
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

    const response = await approveHumanTransaction({
      convex,
      userId: actor._id,
      transactionId: id,
      signerAddress: body.signerAddress,
      signature: body.signature,
    });

    return NextResponse.json({ ok: true, ...response });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Crossmint transaction approval failed",
      },
      { status: 500 },
    );
  }
}
