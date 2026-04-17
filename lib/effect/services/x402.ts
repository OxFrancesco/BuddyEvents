import { Context, Effect, Layer } from "effect";
import { buildDeterministicIdempotencyKey } from "@/lib/idempotency";

export type X402Service = {
  readonly derivePurchaseReference: (args: {
    eventId: string;
    buyerAddress: string;
    txHash?: string | null;
    idempotencyKey?: string | null;
  }) => Effect.Effect<string>;
};

export class X402ServiceTag extends Context.Tag("@buddyevents/X402Service")<
  X402ServiceTag,
  X402Service
>() {}

export const X402ServiceLayer = Layer.succeed(X402ServiceTag, {
  derivePurchaseReference: (args) =>
    Effect.succeed(
      args.txHash?.trim() ||
        args.idempotencyKey?.trim() ||
        buildDeterministicIdempotencyKey("ticket-purchase", [
          args.eventId,
          args.buyerAddress,
        ]),
    ),
});
