import { Context, Effect, Layer } from "effect";
import {
  createOrGetCircleWalletForUser,
  executeBuyTicketWithCircleWallet,
  getCircleTransaction,
  getWalletBalance,
  type CircleContractExecutionResult,
  type CircleTransactionResult,
} from "@/lib/circle";
import type { Id } from "@/convex/_generated/dataModel";
import type { SupportedChainKey } from "@/lib/chains";
import { AppConfigTag } from "../config";
import { ExternalServiceError, WorkflowTransientError } from "../errors";
import { ConvexServiceTag } from "./convex";

export type CircleService = {
  readonly ensureUserWallet: (
    userId: Id<"users">,
    chainKey: SupportedChainKey,
  ) => Effect.Effect<
    {
      walletId: string;
      walletAddress: string;
      chainKey: SupportedChainKey;
      blockchain: string;
    },
    ExternalServiceError
  >;
  readonly executeBuyTicket: (args: {
    walletId: string;
    chainKey: SupportedChainKey;
    onChainEventId: number;
    priceUsdc: number;
    idempotencyKey: string;
  }) => Effect.Effect<CircleContractExecutionResult, ExternalServiceError>;
  readonly executeCreateEvent: (args: {
    walletId: string;
    chainKey: SupportedChainKey;
    priceUsdc: number;
    eventName: string;
    maxTickets: number;
    idempotencyKey: string;
  }) => Effect.Effect<CircleContractExecutionResult, ExternalServiceError>;
  readonly getTransaction: (
    transactionId: string,
  ) => Effect.Effect<CircleTransactionResult, WorkflowTransientError>;
  readonly getBalance: (
    walletId: string,
  ) => Effect.Effect<unknown, ExternalServiceError>;
};

export class CircleServiceTag extends Context.Tag("@buddyevents/CircleService")<
  CircleServiceTag,
  CircleService
>() {}

export const CircleServiceLayer = Layer.effect(
  CircleServiceTag,
  Effect.gen(function* () {
    const config = yield* AppConfigTag;
    const convex = yield* ConvexServiceTag;

    const ensureUserWallet = (
      userId: Id<"users">,
      chainKey: SupportedChainKey,
    ) =>
      Effect.tryPromise({
        try: () =>
          createOrGetCircleWalletForUser(convex.client, userId, chainKey),
        catch: (error) =>
          new ExternalServiceError({
            message: "Circle wallet provisioning failed",
            cause: error,
            details: { userId, chainKey },
          }),
      });

    const executeBuyTicket = (args: {
      walletId: string;
      chainKey: SupportedChainKey;
      onChainEventId: number;
      priceUsdc: number;
      idempotencyKey: string;
    }) =>
      Effect.tryPromise({
        try: () =>
          executeBuyTicketWithCircleWallet({
            walletId: args.walletId,
            chainKey: args.chainKey,
            onChainEventId: args.onChainEventId,
            priceUsdc: args.priceUsdc,
            idempotencyKey: args.idempotencyKey,
          }),
        catch: (error) =>
          new ExternalServiceError({
            message: "Circle ticket purchase failed",
            cause: error,
            details: args,
          }),
      });

    const executeCreateEvent = (args: {
      walletId: string;
      chainKey: SupportedChainKey;
      priceUsdc: number;
      eventName: string;
      maxTickets: number;
      idempotencyKey: string;
    }) =>
      Effect.tryPromise({
        try: () =>
          executeBuyTicketWithCircleWallet({
            walletId: args.walletId,
            chainKey: args.chainKey,
            onChainEventId: 0,
            priceUsdc: args.priceUsdc,
            mode: "create_event",
            eventName: args.eventName,
            maxTickets: args.maxTickets,
            idempotencyKey: args.idempotencyKey,
          }),
        catch: (error) =>
          new ExternalServiceError({
            message: "Circle event creation failed",
            cause: error,
            details: args,
          }),
      });

    const getTransaction = (transactionId: string) =>
      Effect.tryPromise({
        try: () => getCircleTransaction({ transactionId }),
        catch: (error) =>
          new WorkflowTransientError({
            message: "Circle transaction status unavailable",
            cause: error,
            details: { transactionId },
          }),
      });

    const getBalance = (walletId: string) =>
      Effect.tryPromise({
        try: () => getWalletBalance(config.circleApiKey!, walletId),
        catch: (error) =>
          new ExternalServiceError({
            message: "Circle balance lookup failed",
            cause: error,
            details: { walletId },
          }),
      });

    return {
      ensureUserWallet,
      executeBuyTicket,
      executeCreateEvent,
      getTransaction,
      getBalance,
    };
  }),
);
