/// lib/x402.ts — x402 payment protocol configuration for Monad

import type { Network } from "@x402/core/types";

// Monad x402 Facilitator
export const FACILITATOR_URL = "https://x402-facilitator.molandak.org";

// Network identifiers (CAIP-2)
export const MONAD_TESTNET_NETWORK: Network = "eip155:10143";
export const MONAD_MAINNET_NETWORK: Network = "eip155:143";

// Active network (switch for mainnet)
export const ACTIVE_NETWORK = MONAD_TESTNET_NETWORK;

// USDC on Monad Testnet
export const MONAD_USDC_ADDRESS =
  "0x534b2f3A21130d7a60830c2Df862319e593943A3" as const;

// Platform payment address (receives x402 ticket payments)
export const PAY_TO_ADDRESS =
  (process.env.PAY_TO_ADDRESS as `0x${string}`) ??
  ("0x0000000000000000000000000000000000000000" as `0x${string}`);
