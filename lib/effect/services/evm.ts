import {
  createPublicClient,
  getContract,
  http,
  parseEventLogs,
  type TransactionReceipt,
} from "viem";
import { Context, Effect, Layer } from "effect";
import {
  getChainConfig,
  getConfiguredBuddyEventsAddress,
  getPublicRpcUrl,
  type SupportedChainKey,
} from "@/lib/chains";
import { BUDDY_EVENTS_ABI } from "@/lib/contracts";
import { ExternalServiceError, WorkflowTransientError } from "../errors";

export type EvmService = {
  readonly waitForReceipt: (
    chainKey: SupportedChainKey,
    txHash: `0x${string}`,
  ) => Effect.Effect<Pick<TransactionReceipt, "logs">, WorkflowTransientError>;
  readonly extractCreatedEventId: (
    chainKey: SupportedChainKey,
    txHash: `0x${string}`,
  ) => Effect.Effect<number, ExternalServiceError | WorkflowTransientError>;
};

export class EvmServiceTag extends Context.Tag("@buddyevents/EvmService")<
  EvmServiceTag,
  EvmService
>() {}

type ReceiptClient = {
  waitForTransactionReceipt(args: {
    hash: `0x${string}`;
  }): Promise<Pick<TransactionReceipt, "logs">>;
};

export const EvmServiceLayer = Layer.succeed(
  EvmServiceTag,
  (() => {
    const clients = new Map<SupportedChainKey, ReceiptClient>();

    const publicClientFor = (chainKey: SupportedChainKey) => {
      const existing = clients.get(chainKey);
      if (existing) return existing;

      const chain = getChainConfig(chainKey);
      const client = createPublicClient({
        chain: chain.viemChain,
        transport: http(getPublicRpcUrl(chainKey)),
      });
      clients.set(chainKey, client);
      return client;
    };

    return {
      waitForReceipt: (chainKey: SupportedChainKey, txHash: `0x${string}`) =>
        Effect.tryPromise({
          try: () =>
            publicClientFor(chainKey).waitForTransactionReceipt({
              hash: txHash,
            }) as Promise<Pick<TransactionReceipt, "logs">>,
          catch: (error) =>
            new WorkflowTransientError({
              message: `${getChainConfig(chainKey).displayName} receipt not available yet`,
              cause: error,
              details: { chainKey, txHash },
            }),
        }),
      extractCreatedEventId: (chainKey: SupportedChainKey, txHash: `0x${string}`) =>
        Effect.gen(function* () {
          const receipt = yield* Effect.tryPromise({
            try: () =>
              publicClientFor(chainKey).waitForTransactionReceipt({
                hash: txHash,
              }) as Promise<Pick<TransactionReceipt, "logs">>,
            catch: (error) =>
              new WorkflowTransientError({
                message: `${getChainConfig(chainKey).displayName} event creation receipt unavailable`,
                cause: error,
                details: { chainKey, txHash },
              }),
          });

          const logs = parseEventLogs({
            abi: BUDDY_EVENTS_ABI,
            eventName: "EventCreated",
            logs: receipt.logs,
          });
          const created = logs[0];
          const eventId = created?.args?.eventId;
          if (typeof eventId !== "bigint") {
            return yield* Effect.fail(
              new ExternalServiceError({
                message: "Unable to parse EventCreated log",
                details: { chainKey, txHash },
              }),
            );
          }
          return Number(eventId);
        }),
    };
  })(),
);

export function createChainContractClient(chainKey: SupportedChainKey) {
  return getContract({
    address: getConfiguredBuddyEventsAddress(chainKey),
    abi: BUDDY_EVENTS_ABI,
    client: {
      public: createPublicClient({
        chain: getChainConfig(chainKey).viemChain,
        transport: http(getPublicRpcUrl(chainKey)),
      }),
    },
  });
}
