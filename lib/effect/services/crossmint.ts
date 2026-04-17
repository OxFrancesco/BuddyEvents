import { Context, Effect, Layer, pipe } from "effect";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { SupportedChainKey } from "@/lib/chains";
import {
  ensureAutomationCrossmintWalletForUser,
  executeAutomationCreateEvent,
} from "@/lib/crossmint/server";
import { ExternalServiceError, WorkflowPermanentError } from "../errors";
import { AppConfigTag } from "../config";
import { ConvexServiceTag } from "./convex";

export type CrossmintService = {
  readonly ensureUserWallet: (
    userId: Id<"users">,
    purpose?: "human_primary" | "automation",
  ) => Effect.Effect<
    {
      walletId: string;
      walletAddress: string;
      chainKey: SupportedChainKey;
      blockchain: string;
    },
    ExternalServiceError | WorkflowPermanentError
  >;
  readonly executeCreateEvent: (args: {
    userId: Id<"users">;
    chainKey: SupportedChainKey;
    priceUsdc: number;
    eventName: string;
    maxTickets: number;
    idempotencyKey: string;
  }) => Effect.Effect<
    {
      walletId: string;
      walletAddress: string;
      transactionId?: string;
      txHash: string;
      state?: string;
    },
    ExternalServiceError
  >;
};

export class CrossmintServiceTag extends Context.Tag(
  "@buddyevents/CrossmintService",
)<CrossmintServiceTag, CrossmintService>() {}

export const CrossmintServiceLayer = Layer.effect(
  CrossmintServiceTag,
  Effect.gen(function* () {
    const convex = yield* ConvexServiceTag;
    const config = yield* AppConfigTag;

    const loadUser = (
      userId: Id<"users">,
    ): Effect.Effect<Doc<"users">, ExternalServiceError> =>
      pipe(
        convex.query<Doc<"users"> | null>(api.users.getById, {
          userId,
          serviceToken: config.convexServiceToken,
        }),
        Effect.flatMap((user) =>
          user
            ? Effect.succeed(user)
            : Effect.fail(
                new ExternalServiceError({
                  message: "Unable to load user for Crossmint operation",
                  cause: new Error("User profile not found"),
                  details: { userId },
                }),
              ),
        ),
      );

    const ensureUserWallet = (
      userId: Id<"users">,
      purpose: "human_primary" | "automation" = "automation",
    ) =>
      purpose !== "automation"
        ? Effect.fail(
            new WorkflowPermanentError({
              message:
                "Human Crossmint wallets must be provisioned from the authenticated web flow",
              details: { userId, purpose },
            }),
          )
        : pipe(
            loadUser(userId),
            Effect.flatMap((user) =>
              Effect.tryPromise({
                try: () =>
                  ensureAutomationCrossmintWalletForUser({
                    convex: convex.client,
                    user,
                  }),
                catch: (error) =>
                  new ExternalServiceError({
                    message: "Crossmint automation wallet provisioning failed",
                    cause: error,
                    details: { userId, purpose },
                  }),
              }),
            ),
          );

    const executeCreateEvent = (args: {
      userId: Id<"users">;
      chainKey: SupportedChainKey;
      priceUsdc: number;
      eventName: string;
      maxTickets: number;
      idempotencyKey: string;
    }) =>
      pipe(
        loadUser(args.userId),
        Effect.flatMap((user) =>
          Effect.tryPromise({
            try: async () => {
              const result = await executeAutomationCreateEvent({
                convex: convex.client,
                user,
                chainKey: args.chainKey,
                priceUsdc: args.priceUsdc,
                eventName: args.eventName,
                maxTickets: args.maxTickets,
              });
              return {
                walletId: result.wallet.walletId,
                walletAddress: result.wallet.walletAddress,
                transactionId: result.transactionId,
                txHash: result.txHash,
                state: result.state,
              };
            },
            catch: (error) =>
              new ExternalServiceError({
                message: "Crossmint event creation failed",
                cause: error,
                details: args,
              }),
          }),
        ),
      );

    return {
      ensureUserWallet,
      executeCreateEvent,
    };
  }),
);
