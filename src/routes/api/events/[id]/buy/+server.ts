import { json, type RequestHandler } from "@sveltejs/kit";
import {
  type HTTPRequestContext,
  type RouteConfig,
  x402HTTPResourceServer,
  x402ResourceServer,
} from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { type SupportedChainKey } from "@/lib/chains";
import { parseJson, startWorkflowAndRun } from "@/lib/effect/workflows";
import { resolveIdempotencyKey } from "@/lib/idempotency";
import {
  PAY_TO_ADDRESS,
  formatUsdcPrice,
  getFacilitatorClient,
  getX402Network,
  getX402UsdcAddress,
  toAtomicUsdcAmount,
} from "@/lib/x402";
import { SvelteKitAdapter } from "$lib/server/x402/sveltekit-adapter";
import {
  getConvexClient,
  getConvexServiceToken,
} from "$lib/server/services/convex";

type BuyTicketResponse = {
  success: boolean;
  ticketId: string | null;
  qrCode: string | null;
  workflowId: string | null;
  eventId: string;
  buyer: string;
  message: string;
  txHash: string | null;
  timestamp: string;
};

function isEvmAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function extractEventIdFromPath(path: string): string | null {
  const match = path.match(/\/api\/events\/([^/]+)\/buy$/);
  return match?.[1] ?? null;
}

async function loadEventFromPath(path: string): Promise<Doc<"events"> | null> {
  const eventId = extractEventIdFromPath(path);
  if (!eventId) return null;
  const convex = getConvexClient();
  return convex.query(api.events.get, { id: eventId as Id<"events"> });
}

async function loadTeamWallet(event: Doc<"events">): Promise<string> {
  if (!event.teamId) return PAY_TO_ADDRESS;
  const convex = getConvexClient();
  const team = await convex.query(api.teams.get, { id: event.teamId });
  return team?.walletAddress ?? PAY_TO_ADDRESS;
}

const httpServers = new Map<SupportedChainKey, x402HTTPResourceServer>();

function createHttpServer(chainKey: SupportedChainKey) {
  const facilitatorClient = getFacilitatorClient(chainKey);
  const resourceServer = new x402ResourceServer(facilitatorClient);
  const network = getX402Network(chainKey);
  const usdcAddress = getX402UsdcAddress(chainKey);
  const scheme = new ExactEvmScheme();

  scheme.registerMoneyParser(
    async (amount: number, requestedNetwork: string) => {
      if (requestedNetwork !== network) {
        return null;
      }

      return {
        amount: toAtomicUsdcAmount(amount),
        asset: usdcAddress,
        extra: { name: "USDC", version: "2" },
      };
    },
  );
  resourceServer.register(network, scheme);

  const routeConfig: RouteConfig = {
    accepts: {
      scheme: "exact",
      network: network as Network,
      payTo: async (context: HTTPRequestContext) => {
        const event = await loadEventFromPath(context.path);
        if (!event || event.chainKey !== chainKey) return PAY_TO_ADDRESS;
        return loadTeamWallet(event);
      },
      price: async (context: HTTPRequestContext) => {
        const event = await loadEventFromPath(context.path);
        return formatUsdcPrice(
          !event || event.chainKey !== chainKey ? 0.001 : event.price,
        );
      },
    },
    resource: "https://buddyevents.local/api/events/[id]/buy",
    description: "Purchase event ticket",
    mimeType: "application/json",
  };

  const httpServer = new x402HTTPResourceServer(resourceServer, {
    "GET /api/events/*/buy": routeConfig,
  });

  httpServer.onProtectedRequest(async (context) => {
    const event = await loadEventFromPath(context.path);
    if (!event) return { abort: true as const, reason: "Event not found" };
    if (event.chainKey !== chainKey) {
      return { abort: true as const, reason: "Event chain mismatch" };
    }
    if (event.status !== "active") {
      return { abort: true as const, reason: "Event not active" };
    }
    if (event.ticketsSold >= event.maxTickets) {
      return { abort: true as const, reason: "Event sold out" };
    }
    if (event.price <= 0) {
      return { grantAccess: true as const };
    }
    return;
  });

  return httpServer;
}

function getHttpServer(chainKey: SupportedChainKey) {
  const existing = httpServers.get(chainKey);
  if (existing) return existing;
  const server = createHttpServer(chainKey);
  httpServers.set(chainKey, server);
  return server;
}

function buildContext(request: Request): HTTPRequestContext {
  const adapter = new SvelteKitAdapter(request);

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
  headers?: Record<string, string> | Headers,
) {
  const response = json(body, { status });
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      response.headers.set(key, value);
    });
  } else if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
  }
  return response;
}

export const GET: RequestHandler = async (event) => {
  const eventId = event.params.id ?? "";
  const requestedBuyerRaw =
    event.url.searchParams.get("buyer") ??
    event.request.headers.get("x-buyer-address");
  const requestedBuyer = requestedBuyerRaw?.trim() || undefined;
  const buyerAgentId =
    event.url.searchParams.get("agent") ??
    event.request.headers.get("x-agent-id") ??
    undefined;

  try {
    const convex = getConvexClient();
    getConvexServiceToken();
    const loadedEvent = await convex.query(api.events.get, {
      id: eventId as Id<"events">,
    });

    if (!loadedEvent) {
      return jsonWithHeaders(
        {
          success: false,
          ticketId: null,
          qrCode: null,
          workflowId: null,
          eventId,
          buyer: requestedBuyer ?? "",
          message: "Event not found",
          txHash: null,
          timestamp: new Date().toISOString(),
        },
        404,
      );
    }

    const httpServer = getHttpServer(loadedEvent.chainKey);
    const processResult = await httpServer.processHTTPRequest(
      buildContext(event.request),
    );

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
          qrCode: null,
          workflowId: null,
          eventId,
          buyer: requestedBuyer ?? "",
          message,
          txHash: null,
          timestamp: new Date().toISOString(),
        },
        processResult.response.status,
        processResult.response.headers,
      );
    }

    if (processResult.type === "no-payment-required") {
      if (!requestedBuyer || !isEvmAddress(requestedBuyer)) {
        return jsonWithHeaders(
          {
            success: false,
            ticketId: null,
            qrCode: null,
            workflowId: null,
            eventId,
            buyer: requestedBuyer ?? "",
            message: "buyer must be a valid wallet address for free events",
            txHash: null,
            timestamp: new Date().toISOString(),
          },
          400,
        );
      }

      const idempotencyKey = resolveIdempotencyKey({
        explicitKey: event.request.headers.get("Idempotency-Key") ?? undefined,
        fallbackNamespace: "free-ticket",
        fallbackParts: [eventId, requestedBuyer, buyerAgentId ?? "user"],
      });

      const workflow = await startWorkflowAndRun({
        workflowName: "ticket_purchase",
        idempotencyKey,
        source: "x402_free",
        payload: {
          eventId: eventId as Id<"events">,
          buyerAddress: requestedBuyer,
          buyerAgentId: buyerAgentId ?? undefined,
          purchasePrice: loadedEvent.price,
          purchaseSource: "free" as const,
          purchaseReference: idempotencyKey,
          txHash: `free:${idempotencyKey}`,
        },
      });
      const purchase = parseJson<{ ticketId: string; qrToken: string }>(
        workflow.completed?.resultJson,
      );

      if (!purchase) {
        return jsonWithHeaders(
          {
            success: false,
            ticketId: null,
            qrCode: null,
            workflowId: workflow.execution._id,
            eventId,
            buyer: requestedBuyer,
            message: "Ticket workflow queued",
            txHash: null,
            timestamp: new Date().toISOString(),
          },
          202,
        );
      }

      return jsonWithHeaders(
        {
          success: true,
          ticketId: purchase.ticketId,
          qrCode: purchase.qrToken,
          workflowId: workflow.execution._id,
          eventId,
          buyer: requestedBuyer ?? "",
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
          qrCode: null,
          workflowId: null,
          eventId,
          buyer: requestedBuyer ?? "",
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

    const settledBuyerCandidate = settlement.payer ?? requestedBuyer;
    if (!settledBuyerCandidate || !isEvmAddress(settledBuyerCandidate)) {
      return jsonWithHeaders(
        {
          success: false,
          ticketId: null,
          qrCode: null,
          workflowId: null,
          eventId,
          buyer: settledBuyerCandidate ?? "",
          message: "Unable to determine a valid buyer wallet address",
          txHash: settlement.transaction ?? null,
          timestamp: new Date().toISOString(),
        },
        400,
      );
    }

    const idempotencyKey = resolveIdempotencyKey({
      explicitKey: event.request.headers.get("Idempotency-Key") ?? undefined,
      fallbackNamespace: "x402-ticket",
      fallbackParts: [
        eventId,
        settledBuyerCandidate,
        settlement.transaction ?? "missing-tx",
        buyerAgentId ?? "user",
      ],
    });

    const workflow = await startWorkflowAndRun({
      workflowName: "ticket_purchase",
      idempotencyKey,
      source: "x402",
      payload: {
        eventId: eventId as Id<"events">,
        buyerAddress: settledBuyerCandidate,
        buyerAgentId: buyerAgentId ?? undefined,
        purchasePrice: loadedEvent.price,
        purchaseSource: "x402" as const,
        purchaseReference: idempotencyKey,
        txHash: settlement.transaction,
      },
    });
    const purchase = parseJson<{ ticketId: string; qrToken: string }>(
      workflow.completed?.resultJson,
    );

    if (!purchase) {
      return jsonWithHeaders(
        {
          success: false,
          ticketId: null,
          qrCode: null,
          workflowId: workflow.execution._id,
          eventId,
          buyer: settledBuyerCandidate,
          message: "Ticket workflow queued",
          txHash: settlement.transaction,
          timestamp: new Date().toISOString(),
        },
        202,
        settlement.headers as Record<string, string>,
      );
    }

    return jsonWithHeaders(
      {
        success: true,
        ticketId: purchase.ticketId,
        qrCode: purchase.qrToken,
        workflowId: workflow.execution._id,
        eventId,
        buyer: settledBuyerCandidate,
        message: "Ticket purchased successfully via x402",
        txHash: settlement.transaction,
        timestamp: new Date().toISOString(),
      },
      200,
      settlement.headers as Record<string, string>,
    );
  } catch (error) {
    return jsonWithHeaders(
      {
        success: false,
        ticketId: null,
        qrCode: null,
        workflowId: null,
        eventId,
        buyer: requestedBuyer ?? "",
        message: error instanceof Error ? error.message : "Purchase failed",
        txHash: null,
        timestamp: new Date().toISOString(),
      },
      500,
    );
  }
};
