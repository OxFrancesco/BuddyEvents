/// lib/chains.ts — Shared multichain registry for BuddyEvents

import { base, monadTestnet } from "viem/chains";

export const supportedChainKeys = ["monadTestnet", "baseMainnet"] as const;
export type SupportedChainKey = (typeof supportedChainKeys)[number];

export const DEFAULT_CHAIN_KEY: SupportedChainKey = "monadTestnet";

export type SupportedChainId = 10143 | 8453;

type ChainConfig = {
  key: SupportedChainKey;
  chainId: SupportedChainId;
  caip2: `eip155:${number}`;
  viemChain: typeof monadTestnet | typeof base;
  displayName: string;
  shortName: string;
  nativeSymbol: string;
  rpcEnvVar: string;
  rpcLegacyEnvVar?: string;
  defaultRpcUrl: string;
  contractEnvVar: string;
  legacyContractEnvVar?: string;
  usdcAddress: `0x${string}`;
  circleBlockchain: "MONAD-TESTNET" | "BASE";
  x402Network: `eip155:${number}`;
  facilitator: {
    url: string;
    auth: "none" | "cdp";
    cdpApiKeyIdEnvVar?: string;
    cdpApiKeySecretEnvVar?: string;
  };
  faucetUrl?: string;
};

export const CHAIN_CONFIGS: Record<SupportedChainKey, ChainConfig> = {
  monadTestnet: {
    key: "monadTestnet",
    chainId: 10143,
    caip2: "eip155:10143",
    viemChain: monadTestnet,
    displayName: "Monad Testnet",
    shortName: "Monad",
    nativeSymbol: "MON",
    rpcEnvVar: "NEXT_PUBLIC_MONAD_RPC",
    rpcLegacyEnvVar: "MONAD_RPC_URL",
    defaultRpcUrl: "https://testnet-rpc.monad.xyz",
    contractEnvVar: "MONAD_BUDDY_EVENTS_CONTRACT",
    legacyContractEnvVar: "NEXT_PUBLIC_BUDDY_EVENTS_CONTRACT",
    usdcAddress: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
    circleBlockchain: "MONAD-TESTNET",
    x402Network: "eip155:10143",
    facilitator: {
      url: "https://x402-facilitator.molandak.org",
      auth: "none",
    },
    faucetUrl: "https://faucet.monad.xyz",
  },
  baseMainnet: {
    key: "baseMainnet",
    chainId: 8453,
    caip2: "eip155:8453",
    viemChain: base,
    displayName: "Base Mainnet",
    shortName: "Base",
    nativeSymbol: "ETH",
    rpcEnvVar: "NEXT_PUBLIC_BASE_RPC",
    defaultRpcUrl: "https://mainnet.base.org",
    contractEnvVar: "BASE_BUDDY_EVENTS_CONTRACT",
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    circleBlockchain: "BASE",
    x402Network: "eip155:8453",
    facilitator: {
      url: "https://api.cdp.coinbase.com/platform/v2/x402",
      auth: "cdp",
      cdpApiKeyIdEnvVar: "BASE_X402_CDP_API_KEY_ID",
      cdpApiKeySecretEnvVar: "BASE_X402_CDP_API_KEY_SECRET",
    },
  },
};

export const SUPPORTED_CHAINS = supportedChainKeys.map((key) => CHAIN_CONFIGS[key]);

export function isSupportedChainKey(value: unknown): value is SupportedChainKey {
  return typeof value === "string" && value in CHAIN_CONFIGS;
}

export function normalizeSupportedChainKey(value?: string | null): SupportedChainKey {
  if (value && isSupportedChainKey(value)) {
    return value;
  }
  return DEFAULT_CHAIN_KEY;
}

export function getChainConfig(chainKey: SupportedChainKey) {
  return CHAIN_CONFIGS[chainKey];
}

export function getChainKeyById(
  chainId: number | null | undefined,
): SupportedChainKey | undefined {
  return SUPPORTED_CHAINS.find((chain) => chain.chainId === chainId)?.key;
}

export function getChainLabel(chainKey: SupportedChainKey) {
  return getChainConfig(chainKey).displayName;
}

export function getPublicRpcUrl(chainKey: SupportedChainKey) {
  const chain = getChainConfig(chainKey);
  const primary = process.env[chain.rpcEnvVar]?.trim();
  if (primary) return primary;
  const legacy = chain.rpcLegacyEnvVar ? process.env[chain.rpcLegacyEnvVar]?.trim() : undefined;
  return legacy || chain.defaultRpcUrl;
}

export function getConfiguredBuddyEventsAddress(
  chainKey: SupportedChainKey,
): `0x${string}` {
  const chain = getChainConfig(chainKey);
  const primary = process.env[chain.contractEnvVar]?.trim();
  if (primary) return primary as `0x${string}`;
  const legacy = chain.legacyContractEnvVar
    ? process.env[chain.legacyContractEnvVar]?.trim()
    : undefined;
  return ((legacy || "0x0000000000000000000000000000000000000000") as `0x${string}`);
}

export function getDefaultContractAddressForChain(chainKey: SupportedChainKey) {
  return getConfiguredBuddyEventsAddress(chainKey);
}

export function getCircleBlockchain(chainKey: SupportedChainKey) {
  return getChainConfig(chainKey).circleBlockchain;
}

export function getUsdcAddressForChain(chainKey: SupportedChainKey) {
  return getChainConfig(chainKey).usdcAddress;
}

export function getX402NetworkForChain(chainKey: SupportedChainKey) {
  return getChainConfig(chainKey).x402Network;
}
