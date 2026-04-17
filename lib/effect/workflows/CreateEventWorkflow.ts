import { Effect } from "effect";
import { api } from "@/convex/_generated/api";
import { getChainConfig, getConfiguredBuddyEventsAddress } from "@/lib/chains";
import { ConvexServiceTag } from "../services/convex";
import { CrossmintServiceTag } from "../services/crossmint";
import { EvmServiceTag } from "../services/evm";
import { type CreateEventWorkflowPayload } from "./shared";
import type { WorkflowDefinition, WorkflowRunContext } from "./registry";

type CreateEventResult = {
  eventId: string;
  onChainEventId: number;
  txHash: string;
};

type CachedEventStep = { eventId: string };
type CachedWalletStep = {
  walletId: string;
  walletAddress: string;
  blockchain: string;
};
type CachedCreateTxStep = {
  transactionId?: string;
  txHash: string;
  state?: string;
};

export const CreateEventWorkflow: WorkflowDefinition<
  CreateEventWorkflowPayload,
  CreateEventResult
> = {
  name: "create_event",
  run: (context: WorkflowRunContext<CreateEventWorkflowPayload>) =>
    Effect.gen(function* () {
      const convex = yield* ConvexServiceTag;
      const crossmint = yield* CrossmintServiceTag;
      const evm = yield* EvmServiceTag;
      const chain = getChainConfig(context.payload.chainKey);

      const provisionalStep =
        context.getCompletedStep<CachedEventStep>("createProvisional");
      const eventId =
        provisionalStep?.eventId ??
        (yield* context.step(
          "createProvisional",
          context.payload,
          convex.mutation<string>(api.events.createProvisional, {
            name: context.payload.name,
            description: context.payload.description,
            startTime: context.payload.startTime,
            endTime: context.payload.endTime,
            price: context.payload.price,
            maxTickets: context.payload.maxTickets,
            chainKey: context.payload.chainKey,
            teamId: context.payload.teamId,
            sponsors: context.payload.sponsors,
            location: context.payload.location,
            creatorAddress: context.payload.creatorAddress,
            chainReference: context.payload.chainReference,
            serviceToken: context.serviceToken,
          }),
          context.payload.chainReference,
        ));

      const walletStep = context.getCompletedStep<CachedWalletStep>(
        "ensureAutomationWallet",
      );
      if (!walletStep) {
        yield* context.step(
          "ensureAutomationWallet",
          {
            userId: context.payload.creatorUserId,
            purpose: "automation",
            chainKey: context.payload.chainKey,
          },
          crossmint.ensureUserWallet(
            context.payload.creatorUserId,
            "automation",
          ),
          context.payload.creatorUserId,
        );
      }

      const createTxStep = context.getCompletedStep<CachedCreateTxStep>(
        "submitCrossmintCreate",
      );
      const createTx =
        createTxStep ??
        (yield* context.step(
          "submitCrossmintCreate",
          {
            userId: context.payload.creatorUserId,
            eventId,
            chainReference: context.payload.chainReference,
          },
          crossmint.executeCreateEvent({
            userId: context.payload.creatorUserId,
            chainKey: context.payload.chainKey,
            priceUsdc: context.payload.price,
            eventName: context.payload.name,
            maxTickets: context.payload.maxTickets,
            idempotencyKey: context.execution.idempotencyKey,
          }),
          context.payload.chainReference,
        ));

      const txHash = createTx.txHash;
      if (!txHash) {
        throw new Error("Crossmint transaction did not return a tx hash");
      }

      const onChainEventId = yield* context.step(
        "extractCreatedEventId",
        { txHash, eventId },
        evm.extractCreatedEventId(
          context.payload.chainKey,
          txHash as `0x${string}`,
        ),
        txHash,
      );

      yield* context.step(
        "markChainConfirmed",
        { eventId, onChainEventId, txHash },
        convex.mutation<null>(api.events.markChainConfirmed, {
          id: eventId,
          chainKey: context.payload.chainKey,
          chainId: chain.chainId,
          onChainEventId,
          contractAddress: getConfiguredBuddyEventsAddress(
            context.payload.chainKey,
          ),
          chainReference: context.payload.chainReference,
          serviceToken: context.serviceToken,
        }),
        context.payload.chainReference,
      );

      return {
        eventId,
        onChainEventId,
        txHash,
      };
    }),
  onFailure: (context, error) =>
    Effect.gen(function* () {
      const convex = yield* ConvexServiceTag;
      const provisional =
        context.getCompletedStep<CachedEventStep>("createProvisional");
      if (!provisional?.eventId) return;

      yield* Effect.ignore(
        convex.mutation<null>(api.events.markChainFailed, {
          id: provisional.eventId,
          error:
            error instanceof Error
              ? error.message
              : "Unknown create_event failure",
          chainReference: context.payload.chainReference,
          serviceToken: context.serviceToken,
        }),
      );
    }),
};
