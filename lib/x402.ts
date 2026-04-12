/// lib/x402.ts — Shared x402 payment helpers for supported chains

import { getAuthHeaders } from "@coinbase/cdp-sdk/auth";
import { HTTPFacilitatorClient } from "@x402/core/server";
import type { Network } from "@x402/core/types";
import {
  getChainConfig,
  getUsdcAddressForChain,
  getX402NetworkForChain,
  type SupportedChainKey,
} from "./chains";

export const PAY_TO_ADDRESS =
  (process.env.PAY_TO_ADDRESS as `0x${string}`) ??
  ("0x0000000000000000000000000000000000000000" as `0x${string}`);

const facilitatorClients = new Map<SupportedChainKey, HTTPFacilitatorClient>();

function createMissingCdpCredentialError(chainKey: SupportedChainKey) {
  const chain = getChainConfig(chainKey);
  const apiKeyIdVar = chain.facilitator.cdpApiKeyIdEnvVar ?? "BASE_X402_CDP_API_KEY_ID";
  const apiKeySecretVar =
    chain.facilitator.cdpApiKeySecretEnvVar ?? "BASE_X402_CDP_API_KEY_SECRET";
  return new Error(
    `Missing ${chain.displayName} x402 facilitator credentials. Set ${apiKeyIdVar} and ${apiKeySecretVar}.`,
  );
}

async function createCdpAuthHeaders(chainKey: SupportedChainKey) {
  const chain = getChainConfig(chainKey);
  const apiKeyIdVar = chain.facilitator.cdpApiKeyIdEnvVar;
  const apiKeySecretVar = chain.facilitator.cdpApiKeySecretEnvVar;
  const apiKeyId = apiKeyIdVar ? process.env[apiKeyIdVar]?.trim() : undefined;
  const apiKeySecret = apiKeySecretVar ? process.env[apiKeySecretVar]?.trim() : undefined;

  if (!apiKeyId || !apiKeySecret) {
    throw createMissingCdpCredentialError(chainKey);
  }

  const baseUrl = new URL(chain.facilitator.url);
  const buildHeaders = async (
    requestMethod: "GET" | "POST",
    path: "verify" | "settle" | "supported",
  ) =>
    await getAuthHeaders({
      apiKeyId,
      apiKeySecret,
      requestMethod,
      requestHost: baseUrl.host,
      requestPath: `${baseUrl.pathname}/${path}`,
    });

  return {
    verify: await buildHeaders("POST", "verify"),
    settle: await buildHeaders("POST", "settle"),
    supported: await buildHeaders("GET", "supported"),
  };
}

export function getFacilitatorClient(chainKey: SupportedChainKey) {
  const existing = facilitatorClients.get(chainKey);
  if (existing) return existing;

  const chain = getChainConfig(chainKey);
  const client = new HTTPFacilitatorClient({
    url: chain.facilitator.url,
    createAuthHeaders:
      chain.facilitator.auth === "cdp"
        ? async () => await createCdpAuthHeaders(chainKey)
        : undefined,
  });
  facilitatorClients.set(chainKey, client);
  return client;
}

export function getX402Network(chainKey: SupportedChainKey): Network {
  return getX402NetworkForChain(chainKey) as Network;
}

export function getX402UsdcAddress(chainKey: SupportedChainKey): `0x${string}` {
  return getUsdcAddressForChain(chainKey);
}

export function formatUsdcPrice(amountUsd: number) {
  const normalized = Number.isFinite(amountUsd) && amountUsd > 0 ? amountUsd : 0.001;
  return `$${normalized.toFixed(6)}`;
}

export function toAtomicUsdcAmount(amountUsd: number) {
  const normalized = Number.isFinite(amountUsd) && amountUsd > 0 ? amountUsd : 0.001;
  return Math.floor(normalized * 1_000_000).toString();
}
