/// lib/wagmi.ts — Wagmi config for BuddyEvents supported chains

import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { CHAIN_CONFIGS, getPublicRpcUrl } from "@/lib/chains";

const supportedChains = [
  CHAIN_CONFIGS.monadTestnet.viemChain,
  CHAIN_CONFIGS.baseMainnet.viemChain,
] as const;

const transports = {
  10143: http(getPublicRpcUrl("monadTestnet")),
  8453: http(getPublicRpcUrl("baseMainnet")),
} as Record<10143 | 8453, ReturnType<typeof http>>;

export const wagmiConfig = createConfig({
  chains: supportedChains,
  connectors: [
    injected(),
    walletConnect({
      projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "demo",
    }),
  ],
  transports,
});
