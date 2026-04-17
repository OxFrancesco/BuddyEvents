import type { Doc } from "../_generated/dataModel";
import { v } from "convex/values";
import {
  CHAIN_CONFIGS,
  DEFAULT_CHAIN_KEY,
  type SupportedChainId,
  type SupportedChainKey,
  normalizeSupportedChainKey,
} from "../../lib/chains";

export const chainKeyValidator = v.union(
  v.literal("monadTestnet"),
  v.literal("baseMainnet"),
);

export const chainIdValidator = v.union(v.literal(10143), v.literal(8453));

export function resolveEventChainKey(event: {
  chainKey?: string;
}): SupportedChainKey {
  return normalizeSupportedChainKey(event.chainKey);
}

export function resolveEventChainId(event: {
  chainKey?: string;
  chainId?: number;
}): SupportedChainId {
  const chainKey = resolveEventChainKey(event);
  const configured = CHAIN_CONFIGS[chainKey].chainId;
  return event.chainId === 8453 || event.chainId === 10143
    ? event.chainId
    : configured;
}

export function withDefaultEventChain<
  T extends { chainKey?: string; chainId?: number },
>(value: T): T & { chainKey: SupportedChainKey; chainId: SupportedChainId } {
  const chainKey = resolveEventChainKey(value);
  return {
    ...value,
    chainKey,
    chainId: resolveEventChainId(value),
  };
}

export function withDefaultWalletChain<
  T extends { chainKey?: string; blockchain: string },
>(value: T): T & { chainKey: SupportedChainKey } {
  if (
    value.chainKey &&
    normalizeSupportedChainKey(value.chainKey) === value.chainKey
  ) {
    return value as T & { chainKey: SupportedChainKey };
  }

  const normalizedBlockchain = value.blockchain.toUpperCase();
  if (normalizedBlockchain === "BASE") {
    return {
      ...value,
      chainKey: "baseMainnet",
    };
  }

  return {
    ...value,
    chainKey: DEFAULT_CHAIN_KEY,
  };
}

export function withDefaultTicketChain<
  T extends { chainKey?: string; chainId?: number },
>(
  value: T,
  event?: Pick<
    Doc<"events">,
    "chainKey" | "chainId" | "contractAddress"
  > | null,
): T & { chainKey: SupportedChainKey; chainId: SupportedChainId } {
  const chainKey = normalizeSupportedChainKey(
    value.chainKey ?? event?.chainKey,
  );
  const chainId =
    value.chainId === 8453 || value.chainId === 10143
      ? value.chainId
      : event?.chainId === 8453 || event?.chainId === 10143
        ? event.chainId
        : CHAIN_CONFIGS[chainKey].chainId;

  return {
    ...value,
    chainKey,
    chainId,
  };
}
