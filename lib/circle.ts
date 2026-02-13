/// lib/circle.ts — Circle Wallet SDK integration
/// Developer-controlled wallets for platform + agent wallet creation

import type { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { BUDDY_EVENTS_ADDRESS, MONAD_USDC_TESTNET } from "./monad";

const CIRCLE_API_BASE = "https://api.circle.com/v1/w3s";

interface CircleWalletConfig {
  apiKey: string;
  entitySecretCiphertext: string;
}

function getCircleConfigFromEnv(): CircleWalletConfig {
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecretCiphertext = process.env.CIRCLE_ENTITY_SECRET_CIPHERTEXT;
  if (!apiKey || !entitySecretCiphertext) {
    throw new Error("CIRCLE_API_KEY/CIRCLE_ENTITY_SECRET_CIPHERTEXT missing");
  }
  return { apiKey, entitySecretCiphertext };
}

function getWalletSetIdFromEnv() {
  const walletSetId = process.env.CIRCLE_WALLET_SET_ID;
  if (!walletSetId) throw new Error("CIRCLE_WALLET_SET_ID is not configured");
  return walletSetId;
}

function getConvexServiceToken() {
  const token = process.env.CONVEX_SERVICE_TOKEN;
  if (!token) throw new Error("CONVEX_SERVICE_TOKEN is not set");
  return token;
}

// Create a wallet set (one-time setup for the platform)
export async function createWalletSet(
  config: CircleWalletConfig,
  name: string,
) {
  const response = await fetch(`${CIRCLE_API_BASE}/developer/walletSets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      name,
      entitySecretCiphertext: config.entitySecretCiphertext,
    }),
  });

  if (!response.ok) throw new Error(`Circle API error: ${response.status}`);
  const data = await response.json();
  return data.data.walletSet;
}

// Create developer-controlled wallets on Monad (via EVM)
export async function createWallets(
  config: CircleWalletConfig,
  walletSetId: string,
  count: number = 1,
  blockchain: string = "MONAD-TESTNET",
) {
  const response = await fetch(`${CIRCLE_API_BASE}/developer/wallets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      accountType: "SCA",
      blockchains: [blockchain],
      count,
      entitySecretCiphertext: config.entitySecretCiphertext,
      walletSetId,
    }),
  });

  if (!response.ok) throw new Error(`Circle API error: ${response.status}`);
  const data = await response.json();
  return data.data.wallets;
}

// Get wallet balance
export async function getWalletBalance(apiKey: string, walletId: string) {
  const response = await fetch(
    `${CIRCLE_API_BASE}/wallets/${walletId}/balances`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  );

  if (!response.ok) throw new Error(`Circle API error: ${response.status}`);
  const data = await response.json();
  return data.data.tokenBalances;
}

// Transfer tokens between wallets
export async function transferTokens(
  config: CircleWalletConfig,
  walletId: string,
  destinationAddress: string,
  tokenAddress: string,
  amount: string,
) {
  const response = await fetch(
    `${CIRCLE_API_BASE}/developer/wallets/${walletId}/tokenTransfers`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        entitySecretCiphertext: config.entitySecretCiphertext,
        amounts: [amount],
        destinationAddress,
        tokenAddress,
        blockchain: "MONAD-TESTNET",
      }),
    },
  );

  if (!response.ok) throw new Error(`Circle API error: ${response.status}`);
  const data = await response.json();
  return data.data;
}

export async function createContractExecutionTransaction(
  config: CircleWalletConfig,
  args: {
    walletId: string;
    contractAddress: string;
    abiFunctionSignature: string;
    abiParameters: Array<string | number | boolean | Array<unknown>>;
    blockchain?: string;
  },
) {
  const response = await fetch(
    `${CIRCLE_API_BASE}/developer/transactions/contractExecution`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        entitySecretCiphertext: config.entitySecretCiphertext,
        walletId: args.walletId,
        blockchain: args.blockchain ?? "MONAD-TESTNET",
        contractAddress: args.contractAddress,
        abiFunctionSignature: args.abiFunctionSignature,
        abiParameters: args.abiParameters,
        fee: {
          type: "level",
          config: { feeLevel: "MEDIUM" },
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Circle contract execution error: ${response.status}`);
  }
  const data = await response.json();
  const tx = data?.data;
  if (!tx) throw new Error("Circle contract execution missing transaction data");
  return tx as { transactionId?: string; id?: string };
}

export async function createOrGetCircleWalletForUser(
  convex: ConvexHttpClient,
  userId: Id<"users">,
) {
  const serviceToken = getConvexServiceToken();
  const existing = await convex.query(api.wallets.getByUser, {
    userId,
    serviceToken,
  });
  if (existing) {
    return {
      walletId: existing.walletId,
      walletAddress: existing.walletAddress,
      blockchain: existing.blockchain,
    };
  }

  const config = getCircleConfigFromEnv();
  const walletSetId = getWalletSetIdFromEnv();
  const wallets = await createWallets(config, walletSetId, 1, "MONAD-TESTNET");
  const created = wallets?.[0];
  if (!created?.id || !created?.address) {
    throw new Error("Circle did not return a wallet");
  }

  await convex.mutation(api.wallets.upsertCircleWallet, {
    userId,
    walletId: created.id,
    walletAddress: created.address,
    blockchain: created.blockchain ?? "MONAD-TESTNET",
    serviceToken,
  });

  return {
    walletId: created.id,
    walletAddress: created.address,
    blockchain: created.blockchain ?? "MONAD-TESTNET",
  };
}

export async function executeBuyTicketWithCircleWallet(args: {
  walletId: string;
  onChainEventId: number;
  priceUsdc: number;
  mode?: "buy_ticket" | "create_event";
  eventName?: string;
  maxTickets?: number;
}) {
  const config = getCircleConfigFromEnv();

  if (args.mode === "create_event") {
    const createTx = await createContractExecutionTransaction(config, {
      walletId: args.walletId,
      contractAddress: BUDDY_EVENTS_ADDRESS,
      abiFunctionSignature: "createEvent(string,uint256,uint256)",
      abiParameters: [
        args.eventName ?? `Telegram Event ${Date.now()}`,
        Math.floor(args.priceUsdc * 1_000_000),
        args.maxTickets ?? 100,
      ],
    });
    return {
      txHash: (createTx.transactionId ?? createTx.id ?? "") as string,
      onChainEventId: undefined as number | undefined,
    };
  }

  const usdcUnits = Math.floor(args.priceUsdc * 1_000_000);
  if (usdcUnits > 0) {
    await createContractExecutionTransaction(config, {
      walletId: args.walletId,
      contractAddress: MONAD_USDC_TESTNET,
      abiFunctionSignature: "approve(address,uint256)",
      abiParameters: [BUDDY_EVENTS_ADDRESS, usdcUnits],
    });
  }

  const buyTx = await createContractExecutionTransaction(config, {
    walletId: args.walletId,
    contractAddress: BUDDY_EVENTS_ADDRESS,
    abiFunctionSignature: "buyTicket(uint256)",
    abiParameters: [args.onChainEventId],
  });

  return {
    txHash: (buyTx.transactionId ?? buyTx.id ?? "") as string,
  };
}

export function getCircleConfigForServer() {
  return getCircleConfigFromEnv();
}
