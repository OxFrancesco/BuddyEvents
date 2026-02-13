/// lib/wagmi.ts — Wagmi config for Monad chain

import { createConfig, http } from "wagmi";
import { monadTestnet } from "viem/chains";
import { walletConnect } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [
    walletConnect({
      projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "demo",
    }),
  ],
  transports: {
    [monadTestnet.id]: http(),
  },
});
