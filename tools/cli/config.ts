import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import {
  DEFAULT_CHAIN_KEY,
  getConfiguredBuddyEventsAddress,
  getPublicRpcUrl,
  getUsdcAddressForChain,
  normalizeSupportedChainKey,
  type SupportedChainKey,
} from "@/lib/chains";

export type StoredCliChainConfig = {
  rpcUrl: string;
  contractAddress: string;
  usdcAddress: string;
};

export type StoredCliConfig = {
  apiUrl: string;
  convexUrl: string;
  walletAddress: string;
  privateKey: string;
  defaultChainKey: SupportedChainKey;
  chains: Record<SupportedChainKey, StoredCliChainConfig>;
};

type LegacyStoredCliConfig = Partial<
  Omit<StoredCliConfig, "chains" | "defaultChainKey">
> & {
  defaultChainKey?: string;
  monadRpc?: string;
  contractAddress?: string;
  usdcAddress?: string;
  chains?: Partial<Record<SupportedChainKey, Partial<StoredCliChainConfig>>>;
};

function defaultChainConfig(chainKey: SupportedChainKey): StoredCliChainConfig {
  return {
    rpcUrl: getPublicRpcUrl(chainKey),
    contractAddress: getConfiguredBuddyEventsAddress(chainKey),
    usdcAddress: getUsdcAddressForChain(chainKey),
  };
}

export const defaultCliConfig = (): StoredCliConfig => ({
  apiUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000",
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL?.trim() || "",
  walletAddress: "",
  privateKey: "",
  defaultChainKey: normalizeSupportedChainKey(
    process.env.BUDDYEVENTS_DEFAULT_CHAIN ?? DEFAULT_CHAIN_KEY,
  ),
  chains: {
    monadTestnet: defaultChainConfig("monadTestnet"),
    baseMainnet: defaultChainConfig("baseMainnet"),
  },
});

function normalizeCliConfig(raw?: LegacyStoredCliConfig): StoredCliConfig {
  const defaults = defaultCliConfig();
  const legacy = raw ?? {};

  return {
    apiUrl: legacy.apiUrl?.trim() || defaults.apiUrl,
    convexUrl: legacy.convexUrl?.trim() || defaults.convexUrl,
    walletAddress: legacy.walletAddress?.trim() || "",
    privateKey: legacy.privateKey?.trim() || "",
    defaultChainKey: normalizeSupportedChainKey(
      legacy.defaultChainKey ?? defaults.defaultChainKey,
    ),
    chains: {
      monadTestnet: {
        ...defaults.chains.monadTestnet,
        ...(legacy.chains?.monadTestnet ?? {}),
        rpcUrl:
          legacy.monadRpc?.trim() ||
          legacy.chains?.monadTestnet?.rpcUrl?.trim() ||
          defaults.chains.monadTestnet.rpcUrl,
        contractAddress:
          legacy.contractAddress?.trim() ||
          legacy.chains?.monadTestnet?.contractAddress?.trim() ||
          defaults.chains.monadTestnet.contractAddress,
        usdcAddress:
          legacy.usdcAddress?.trim() ||
          legacy.chains?.monadTestnet?.usdcAddress?.trim() ||
          defaults.chains.monadTestnet.usdcAddress,
      },
      baseMainnet: {
        ...defaults.chains.baseMainnet,
        ...(legacy.chains?.baseMainnet ?? {}),
        rpcUrl:
          legacy.chains?.baseMainnet?.rpcUrl?.trim() ||
          defaults.chains.baseMainnet.rpcUrl,
        contractAddress:
          legacy.chains?.baseMainnet?.contractAddress?.trim() ||
          defaults.chains.baseMainnet.contractAddress,
        usdcAddress:
          legacy.chains?.baseMainnet?.usdcAddress?.trim() ||
          defaults.chains.baseMainnet.usdcAddress,
      },
    },
  };
}

export function defaultCliConfigPath() {
  return path.join(os.homedir(), ".buddyevents", "config.json");
}

export async function loadCliConfig(configPath?: string) {
  const resolvedPath = configPath || defaultCliConfigPath();
  try {
    const raw = await fs.readFile(resolvedPath, "utf8");
    return {
      path: resolvedPath,
      config: normalizeCliConfig(JSON.parse(raw) as LegacyStoredCliConfig),
    };
  } catch {
    return {
      path: resolvedPath,
      config: defaultCliConfig(),
    };
  }
}

export async function saveCliConfig(
  config: StoredCliConfig,
  configPath?: string,
) {
  const resolvedPath = configPath || defaultCliConfigPath();
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  await fs.writeFile(
    resolvedPath,
    JSON.stringify(normalizeCliConfig(config), null, 2),
    "utf8",
  );
  return resolvedPath;
}
