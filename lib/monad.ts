/// lib/monad.ts — Legacy shim for Monad-specific imports

import { monadTestnet } from "viem/chains";
import {
  CHAIN_CONFIGS,
  getConfiguredBuddyEventsAddress,
  getPublicRpcUrl,
} from "./chains";
import { BUDDY_EVENTS_ABI, ERC20_ABI } from "./contracts";

export { monadTestnet, BUDDY_EVENTS_ABI, ERC20_ABI };

export const BUDDY_EVENTS_ADDRESS =
  getConfiguredBuddyEventsAddress("monadTestnet");
export const MONAD_USDC_TESTNET = CHAIN_CONFIGS.monadTestnet.usdcAddress;
export const MONAD_TESTNET_CHAIN_ID = CHAIN_CONFIGS.monadTestnet.chainId;
export const MONAD_CAIP2 = CHAIN_CONFIGS.monadTestnet.caip2;
export const MONAD_MAINNET_CAIP2 = "eip155:143" as const;
export const MONAD_TESTNET_RPC = getPublicRpcUrl("monadTestnet");
export const MONAD_MAINNET_RPC = "https://rpc.monad.xyz";
