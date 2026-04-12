import { ConvexHttpClient } from "convex/browser";
import { Context, Effect, Layer } from "effect";
import { AppConfigTag } from "../config";
import { ExternalServiceError } from "../errors";
import { withStandardEffectPolicy } from "../logging";

export type ConvexService = {
  readonly client: ConvexHttpClient;
  readonly query: <T>(
    reference: unknown,
    args: Record<string, unknown>,
  ) => Effect.Effect<T, ExternalServiceError>;
  readonly mutation: <T>(
    reference: unknown,
    args: Record<string, unknown>,
  ) => Effect.Effect<T, ExternalServiceError>;
};

export class ConvexServiceTag extends Context.Tag("@buddyevents/ConvexService")<
  ConvexServiceTag,
  ConvexService
>() {}

export const ConvexServiceLayer = Layer.effect(
  ConvexServiceTag,
  Effect.gen(function* () {
    const config = yield* AppConfigTag;
    const client = new ConvexHttpClient(config.convexUrl);

    const query = <T>(reference: unknown, args: Record<string, unknown>) =>
      withStandardEffectPolicy(
        "convex.query",
        Effect.tryPromise({
          try: () => client.query(reference as never, args as never),
          catch: (error) =>
            new ExternalServiceError({
              message: "Convex query failed",
              cause: error,
              details: { args },
            }),
        }),
      ) as Effect.Effect<T, ExternalServiceError>;

    const mutation = <T>(reference: unknown, args: Record<string, unknown>) =>
      withStandardEffectPolicy(
        "convex.mutation",
        Effect.tryPromise({
          try: () => client.mutation(reference as never, args as never),
          catch: (error) =>
            new ExternalServiceError({
              message: "Convex mutation failed",
              cause: error,
              details: { args },
            }),
        }),
      ) as Effect.Effect<T, ExternalServiceError>;

    return { client, query, mutation };
  }),
);
