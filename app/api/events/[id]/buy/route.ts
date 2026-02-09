/// app/api/events/[id]/buy/route.ts — x402-protected ticket purchase endpoint
/// Dynamic per-event pricing + real settlement tx recording

import { NextRequest, NextResponse } from "next/server";
import { NextAdapter } from "@x402/next";
import {
  HTTPFacilitatorClient,
  type HTTPRequestContext,
  type RouteConfig,
  x402HTTPResourceServer,
  x402ResourceServer,
} from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type { Network } from "@x402/core/types";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import {
  FACILITATOR_URL,
  MONAD_TESTNET_NETWORK,
  MONAD_USDC_ADDRESS,
  PAY_TO_ADDRESS,
} from "../../../../../lib/x402";

function getConvexClient() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  }
  return new ConvexHttpClient(convexUrl);
}

function extractEventIdFromPath(path: string): string | null {
  const match = path.match(/\/api\/events\/([^/]+)\/buy$/);
  return match?.[1] ?? null;
}

async function loadEventFromPath(path: string): Promise<Doc<"events"> | null> {
  const eventId = extractEventIdFromPath(path);
  if (!eventId) return null;
  const convex = getConvexClient();
  return await convex.query(api.events.get, { id: eventId as Id<"events"> });
}

async function loadTeamWallet(event: Doc<"events">): Promise<string> {
  const convex = getConvexClient();
  const team = await convex.query(api.teams.get, { id: event.teamId });
  return team?.walletAddress ?? PAY_TO_ADDRESS;
}

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitatorClient);

const monadScheme = new ExactEvmScheme();
monadScheme.registerMoneyParser(async (amount: number, network: string) => {
  if (network === MONAD_TESTNET_NETWORK) {
    const tokenAmount = Math.floor(amount * 1_000_000).toString();
    return {
      amount: tokenAmount,
      asset: MONAD_USDC_ADDRESS,
      extra: { name: "USDC", version: "2" },
    };
  }
  return null;
});
resourceServer.register(MONAD_TESTNET_NETWORK, monadScheme);

const routeConfig: RouteConfig = {
  accepts: {
    scheme: "exact",
    network: MONAD_TESTNET_NETWORK as Network,
    payTo: async (context: HTTPRequestContext) => {
      const event = await loadEventFromPath(context.path);
      if (!event) return PAY_TO_ADDRESS;
      return await loadTeamWallet(event);
    },
    price: async (context: HTTPRequestContext) => {
      const event = await loadEventFromPath(context.path);
      const price = event?.price ?? 0.001;
      const normalized = Number.isFinite(price) && price > 0 ? price : 0.001;
      return `$${normalized.toFixed(6)}`;
    },
  },
  resource: "https://buddyevents.local/api/events/[id]/buy",
  description: "Purchase event ticket",
  mimeType: "application/json",
};

const httpServer = new x402HTTPResourceServer(resourceServer, {
  "GET /api/events/*/buy": routeConfig,
});

// Grant free events without payment; block invalid/sold-out events up-front.
httpServer.onProtectedRequest(async (context) => {
  const event = await loadEventFromPath(context.path);
  if (!event) return { abort: true as const, reason: "Event not found" };
  if (event.status !== "active")
    return { abort: true as const, reason: "Event not active" };
  if (event.ticketsSold >= event.maxTickets)
    return { abort: true as const, reason: "Event sold out" };
  if (event.price <= 0) return { grantAccess: true as const };
  return;
});

type BuyTicketResponse = {
  success: boolean;
  ticketId: string | null;
  eventId: string;
  buyer: string;
  message: string;
  txHash: string | null;
  timestamp: string;
};

function buildContext(request: NextRequest): HTTPRequestContext {
  const adapter = new NextAdapter(request);
  return {
    adapter,
    path: adapter.getPath(),
    method: adapter.getMethod(),
    paymentHeader:
      adapter.getHeader("PAYMENT-SIGNATURE") ??
      adapter.getHeader("payment-signature") ??
      adapter.getHeader("X-PAYMENT") ??
      adapter.getHeader("x-payment"),
  };
}

function jsonWithHeaders(
  body: BuyTicketResponse,
  status: number,
  headers?: Record<string, string>,
) {
  const response = NextResponse.json(body, { status });
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
  }
  return response;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const eventId = extractEventIdFromPath(url.pathname) ?? "";

  const requestedBuyer =
    url.searchParams.get("buyer") ??
    request.headers.get("x-buyer-address") ??
    "unknown";
  const buyerAgentId =
    url.searchParams.get("agent") ??
    request.headers.get("x-agent-id") ??
    undefined;

  try {
    const convex = getConvexClient();
    const event = await convex.query(api.events.get, {
      id: eventId as Id<"events">,
    });
    if (!event) {
      return jsonWithHeaders(
        {
          success: false,
          ticketId: null,
          eventId,
          buyer: requestedBuyer,
          message: "Event not found",
          txHash: null,
          timestamp: new Date().toISOString(),
        },
        404,
      );
    }

    const processResult = await httpServer.processHTTPRequest(buildContext(request));

    if (processResult.type === "payment-error") {
      const message =
        typeof processResult.response.body === "object" &&
        processResult.response.body !== null
          ? JSON.stringify(processResult.response.body)
          : "Payment required";

      return jsonWithHeaders(
        {
          success: false,
          ticketId: null,
          eventId,
          buyer: requestedBuyer,
          message,
          txHash: null,
          timestamp: new Date().toISOString(),
        },
        processResult.response.status,
        processResult.response.headers,
      );
    }

    if (processResult.type === "no-payment-required") {
      const ticketId = await convex.mutation(api.tickets.recordPurchase, {
        eventId: eventId as Id<"events">,
        buyerAddress: requestedBuyer,
        buyerAgentId: buyerAgentId ?? undefined,
        purchasePrice: event.price,
        txHash: `free-${Date.now()}`,
      });

      return jsonWithHeaders(
        {
          success: true,
          ticketId,
          eventId,
          buyer: requestedBuyer,
          message: "Free ticket granted",
          txHash: null,
          timestamp: new Date().toISOString(),
        },
        200,
      );
    }

    const settlement = await httpServer.processSettlement(
      processResult.paymentPayload,
      processResult.paymentRequirements,
      processResult.declaredExtensions,
    );

    if (!settlement.success) {
      return jsonWithHeaders(
        {
          success: false,
          ticketId: null,
          eventId,
          buyer: requestedBuyer,
          message:
            settlement.errorMessage ??
            settlement.errorReason ??
            "Settlement failed",
          txHash: settlement.transaction ?? null,
          timestamp: new Date().toISOString(),
        },
        402,
      );
    }

    const settledBuyer = settlement.payer ?? requestedBuyer;
    const ticketId = await convex.mutation(api.tickets.recordPurchase, {
      eventId: eventId as Id<"events">,
      buyerAddress: settledBuyer,
      buyerAgentId: buyerAgentId ?? undefined,
      purchasePrice: event.price,
      txHash: settlement.transaction,
    });

    return jsonWithHeaders(
      {
        success: true,
        ticketId,
        eventId,
        buyer: settledBuyer,
        message: "Ticket purchased successfully via x402",
        txHash: settlement.transaction,
        timestamp: new Date().toISOString(),
      },
      200,
      settlement.headers,
    );
  } catch (error) {
    return jsonWithHeaders(
      {
        success: false,
        ticketId: null,
        eventId,
        buyer: requestedBuyer,
        message: error instanceof Error ? error.message : "Purchase failed",
        txHash: null,
        timestamp: new Date().toISOString(),
      },
      500,
    );
  }
}
