import { parseEventLogs } from "viem";
import { Effect } from "effect";
import { api } from "@/convex/_generated/api";
import { BUDDY_EVENTS_ABI } from "@/lib/contracts";
import { ConvexServiceTag } from "../services/convex";
import { EvmServiceTag } from "../services/evm";
import { WorkflowPermanentError } from "../errors";
import type { TicketPurchaseWorkflowPayload } from "./shared";
import type { WorkflowDefinition, WorkflowRunContext } from "./registry";

type TicketPurchaseResult = {
  ticketId: string;
  qrToken: string;
  qrTokenExpiresAt: number;
  txHash: string;
  buyerAddress: string;
  eventId: string;
};

export const TicketPurchaseWorkflow: WorkflowDefinition<
  TicketPurchaseWorkflowPayload,
  TicketPurchaseResult
> = {
  name: "ticket_purchase",
  run: (context: WorkflowRunContext<TicketPurchaseWorkflowPayload>) =>
    Effect.gen(function* () {
      const convex = yield* ConvexServiceTag;
      const evm = yield* EvmServiceTag;

      const event = yield* convex.query<{
        _id: string;
        chainKey: "monadTestnet" | "baseMainnet";
        onChainEventId?: number;
      }>(api.events.get, {
        id: context.payload.eventId,
      });

      if (!event) {
        return yield* Effect.fail(
          new WorkflowPermanentError({
            message: "Event not found",
            details: { eventId: context.payload.eventId },
          }),
        );
      }

      let tokenId: number | undefined;
      if (
        context.payload.purchaseSource === "wallet" &&
        context.payload.txHash.startsWith("0x")
      ) {
        const receipt = yield* context.step(
          "verifyWalletReceipt",
          {
            txHash: context.payload.txHash,
            purchaseReference: context.payload.purchaseReference,
          },
          evm.waitForReceipt(event.chainKey, context.payload.txHash as `0x${string}`),
          context.payload.txHash,
        );

        const purchaseLogs = parseEventLogs({
          abi: BUDDY_EVENTS_ABI,
          eventName: "TicketPurchased",
          logs: receipt.logs,
        });
        const purchaseLog = purchaseLogs[0];

        if (!purchaseLog) {
          return yield* Effect.fail(
            new WorkflowPermanentError({
              message: "Wallet transaction does not include a TicketPurchased log",
              details: { txHash: context.payload.txHash },
            }),
          );
        }

        const purchasedEventId = purchaseLog.args.eventId;
        const buyer = purchaseLog.args.buyer;
        const purchasedTokenId = purchaseLog.args.tokenId;

        if (
          typeof purchasedEventId === "bigint" &&
          event.onChainEventId !== undefined &&
          Number(purchasedEventId) !== event.onChainEventId
        ) {
          return yield* Effect.fail(
            new WorkflowPermanentError({
              message: "Wallet transaction event ID does not match requested event",
              details: {
                txHash: context.payload.txHash,
                expectedEventId: event.onChainEventId,
                receivedEventId: Number(purchasedEventId),
              },
            }),
          );
        }

        if (
          typeof buyer === "string" &&
          buyer.toLowerCase() !== context.payload.buyerAddress.toLowerCase()
        ) {
          return yield* Effect.fail(
            new WorkflowPermanentError({
              message: "Wallet transaction buyer does not match request",
              details: {
                txHash: context.payload.txHash,
                expectedBuyer: context.payload.buyerAddress,
                receivedBuyer: buyer,
              },
            }),
          );
        }

        tokenId = typeof purchasedTokenId === "bigint" ? Number(purchasedTokenId) : undefined;
      }

      const purchase = yield* context.step(
        "recordPurchase",
        context.payload,
        convex.mutation<{
          ticketId: string;
          qrToken: string;
          qrTokenExpiresAt: number;
        }>(api.tickets.recordPurchaseAndIssueQr, {
          eventId: context.payload.eventId,
          tokenId,
          buyerAddress: context.payload.buyerAddress,
          buyerAgentId: context.payload.buyerAgentId,
          purchasePrice: context.payload.purchasePrice,
          purchaseSource: context.payload.purchaseSource,
          purchaseReference: context.payload.purchaseReference,
          txHash: context.payload.txHash,
          serviceToken: context.serviceToken,
        }),
        context.payload.purchaseReference,
      );

      return {
        ticketId: purchase.ticketId,
        qrToken: purchase.qrToken,
        qrTokenExpiresAt: purchase.qrTokenExpiresAt,
        txHash: context.payload.txHash,
        buyerAddress: context.payload.buyerAddress,
        eventId: context.payload.eventId,
      };
    }),
};
