import { afterEach, describe, expect, it } from "vitest";
import {
  CHAIN_CONFIGS,
  getChainKeyById,
  getChainLabel,
  getConfiguredBuddyEventsAddress,
  getPublicRpcUrl,
  getUsdcAddressForChain,
  getX402NetworkForChain,
  normalizeSupportedChainKey,
} from "@/lib/chains";

const originalEnv = { ...process.env };

describe("chain registry", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("resolves both supported chains with expected metadata", () => {
    expect(CHAIN_CONFIGS.monadTestnet.chainId).toBe(10143);
    expect(CHAIN_CONFIGS.monadTestnet.caip2).toBe("eip155:10143");
    expect(getUsdcAddressForChain("monadTestnet")).toBe(
      "0x534b2f3A21130d7a60830c2Df862319e593943A3",
    );
    expect(getX402NetworkForChain("monadTestnet")).toBe("eip155:10143");

    expect(CHAIN_CONFIGS.baseMainnet.chainId).toBe(8453);
    expect(CHAIN_CONFIGS.baseMainnet.caip2).toBe("eip155:8453");
    expect(getUsdcAddressForChain("baseMainnet")).toBe(
      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    );
    expect(getX402NetworkForChain("baseMainnet")).toBe("eip155:8453");
  });

  it("maps chain IDs and labels consistently", () => {
    expect(getChainKeyById(10143)).toBe("monadTestnet");
    expect(getChainKeyById(8453)).toBe("baseMainnet");
    expect(getChainKeyById(1)).toBeUndefined();

    expect(getChainLabel("monadTestnet")).toBe("Monad Testnet");
    expect(getChainLabel("baseMainnet")).toBe("Base Mainnet");
  });

  it("normalizes unknown chain keys back to the default", () => {
    expect(normalizeSupportedChainKey("monadTestnet")).toBe("monadTestnet");
    expect(normalizeSupportedChainKey("baseMainnet")).toBe("baseMainnet");
    expect(normalizeSupportedChainKey("something-else")).toBe("monadTestnet");
    expect(normalizeSupportedChainKey(undefined)).toBe("monadTestnet");
  });

  it("prefers environment overrides for RPC and contract addresses", () => {
    process.env.NEXT_PUBLIC_BASE_RPC = "https://base.example.invalid";
    process.env.BASE_BUDDY_EVENTS_CONTRACT =
      "0x1111111111111111111111111111111111111111";

    expect(getPublicRpcUrl("baseMainnet")).toBe("https://base.example.invalid");
    expect(getConfiguredBuddyEventsAddress("baseMainnet")).toBe(
      "0x1111111111111111111111111111111111111111",
    );
  });
});
