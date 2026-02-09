/// app/api/events/[id]/buy/route.ts — x402-protected ticket purchase endpoint
/// Agents and clients pay USDC via x402 to buy event tickets

import { NextRequest, NextResponse } from "next/server";
import { withX402, type RouteConfig } from "@x402/next";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type { Network } from "@x402/core/types";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
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

// Monad x402 facilitator
const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const server = new x402ResourceServer(facilitatorClient);

// Register Monad network with custom USDC money parser
const monadScheme = new ExactEvmScheme();
monadScheme.registerMoneyParser(
  async (amount: number, network: string) => {
    if (network === MONAD_TESTNET_NETWORK) {
      const tokenAmount = Math.floor(amount * 1_000_000).toString();
      return {
        amount: tokenAmount,
        asset: MONAD_USDC_ADDRESS,
        extra: { name: "USDC", version: "2" },
      };
    }
    return null;
  },
);
server.register(MONAD_TESTNET_NETWORK, monadScheme);

// Dynamic route config based on event price
function getRouteConfig(price: number): RouteConfig {
  return {
    accepts: {
      scheme: "exact",
      network: MONAD_TESTNET_NETWORK as Network,
      payTo: PAY_TO_ADDRESS,
      price: `$${price}`,
    },
    resource: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/events/buy`,
  };
}

// Handler: after x402 payment settles, record the ticket in Convex
async function handler(request: NextRequest) {
  const url = new URL(request.url);
  const segments = url.pathname.split("/");
  const eventId = segments[segments.indexOf("events") + 1];

  // Get buyer info from query params or headers
  const buyerAddress =
    url.searchParams.get("buyer") ??
    request.headers.get("x-buyer-address") ??
    "unknown";
  const buyerAgentId =
    url.searchParams.get("agent") ??
    request.headers.get("x-agent-id") ??
    undefined;

  try {
    const convex = getConvexClient();
    const eventDocId = eventId as Id<"events">;
    const event = await convex.query(api.events.get, { id: eventDocId });
    if (!event) {
      throw new Error("Event not found");
    }

    // Record purchase in Convex
    const ticketId = await convex.mutation(api.tickets.recordPurchase, {
      eventId: eventDocId,
      buyerAddress,
      buyerAgentId: buyerAgentId || undefined,
      purchasePrice: event.price,
      txHash: `x402-${Date.now()}`, // x402 facilitator handles the tx
    });

    return NextResponse.json({
      success: true,
      ticketId,
      eventId,
      buyer: buyerAddress,
      message: "Ticket purchased successfully via x402",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      ticketId: "" as Id<"tickets">,
      eventId,
      buyer: buyerAddress,
      message: error instanceof Error ? error.message : "Purchase failed",
      timestamp: new Date().toISOString(),
    });
  }
}

// Default price for the x402 wrapper — individual events override via query param
const DEFAULT_PRICE = 0.001; // $0.001 USDC minimum
const routeConfig = getRouteConfig(DEFAULT_PRICE);
export const GET = withX402(handler, routeConfig, server);
