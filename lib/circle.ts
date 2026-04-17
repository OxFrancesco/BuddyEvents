/// lib/circle.ts — Circle Wallet SDK integration
/// Developer-controlled wallets for platform + agent wallet creation

import type { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  DEFAULT_CHAIN_KEY,
  getCircleBlockchain,
  getConfiguredBuddyEventsAddress,
  getUsdcAddressForChain,
  type SupportedChainKey,
} from "./chains";

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

// Create developer-controlled wallets on the requested EVM chain
export async function createWallets(
  config: CircleWalletConfig,
  walletSetId: string,
  count: number = 1,
  blockchain: string = getCircleBlockchain(DEFAULT_CHAIN_KEY),
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
  blockchain: string = getCircleBlockchain(DEFAULT_CHAIN_KEY),
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
        blockchain,
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
    idempotencyKey?: string;
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
        idempotencyKey: args.idempotencyKey ?? crypto.randomUUID(),
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
  if (!tx)
    throw new Error("Circle contract execution missing transaction data");
  return tx as {
    transactionId?: string;
    id?: string;
    txHash?: string;
    transactionHash?: string;
    state?: string;
  };
}

export type CircleContractExecutionResult = {
  txHash: string;
  transactionId?: string;
  onChainEventId?: number;
  state?: string;
};

export type CircleTransactionResult = {
  id: string;
  state?: string;
  txHash?: string;
  blockchain?: string;
  errorReason?: string;
  raw: unknown;
};

async function tryGetCircleTransaction(
  apiKey: string,
  path: string,
): Promise<CircleTransactionResult | null> {
  const response = await fetch(`${CIRCLE_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Circle transaction lookup failed (${response.status}): ${body}`,
    );
  }

  const payload = (await response.json()) as {
    data?: Record<string, unknown>;
  };
  const data = payload.data ?? {};
  const id = String(
    data.id ??
      data.transactionId ??
      data.transaction_id ??
      data.refId ??
      "unknown",
  );

  return {
    id,
    state:
      typeof data.state === "string"
        ? data.state
        : typeof data.status === "string"
          ? data.status
          : undefined,
    txHash:
      typeof data.txHash === "string"
        ? data.txHash
        : typeof data.transactionHash === "string"
          ? data.transactionHash
          : typeof data.blockchainTxHash === "string"
            ? data.blockchainTxHash
            : undefined,
    blockchain:
      typeof data.blockchain === "string" ? data.blockchain : undefined,
    errorReason:
      typeof data.errorReason === "string"
        ? data.errorReason
        : typeof data.errorMessage === "string"
          ? data.errorMessage
          : undefined,
    raw: data,
  };
}

export async function getCircleTransaction(args: {
  transactionId: string;
}): Promise<CircleTransactionResult> {
  const config = getCircleConfigFromEnv();
  const candidates = [
    `/transactions/${args.transactionId}`,
    `/developer/transactions/${args.transactionId}`,
    `/developer/transactions/contractExecution/${args.transactionId}`,
  ];

  for (const path of candidates) {
    const transaction = await tryGetCircleTransaction(config.apiKey, path);
    if (transaction) return transaction;
  }

  throw new Error(`Circle transaction not found: ${args.transactionId}`);
}

export async function createOrGetCircleWalletForUser(
  convex: ConvexHttpClient,
  userId: Id<"users">,
  chainKey: SupportedChainKey = DEFAULT_CHAIN_KEY,
) {
  const serviceToken = getConvexServiceToken();
  const existing = await convex.query(api.wallets.getByUserAndChain, {
    userId,
    chainKey,
    serviceToken,
  });
  if (existing) {
    return {
      walletId: existing.walletId,
      walletAddress: existing.walletAddress,
      chainKey: existing.chainKey,
      blockchain: existing.blockchain,
    };
  }

  const config = getCircleConfigFromEnv();
  const walletSetId = getWalletSetIdFromEnv();
  const wallets = await createWallets(
    config,
    walletSetId,
    1,
    getCircleBlockchain(chainKey),
  );
  const created = wallets?.[0];
  if (!created?.id || !created?.address) {
    throw new Error("Circle did not return a wallet");
  }

  await convex.mutation(api.wallets.upsertCircleWallet, {
    userId,
    walletId: created.id,
    walletAddress: created.address,
    chainKey,
    blockchain: created.blockchain ?? getCircleBlockchain(chainKey),
    serviceToken,
  });

  return {
    walletId: created.id,
    walletAddress: created.address,
    chainKey,
    blockchain: created.blockchain ?? getCircleBlockchain(chainKey),
  };
}

export async function executeBuyTicketWithCircleWallet(args: {
  walletId: string;
  chainKey: SupportedChainKey;
  onChainEventId: number;
  priceUsdc: number;
  mode?: "buy_ticket" | "create_event";
  eventName?: string;
  maxTickets?: number;
  idempotencyKey?: string;
}) {
  const config = getCircleConfigFromEnv();
  const contractAddress = getConfiguredBuddyEventsAddress(args.chainKey);
  const usdcAddress = getUsdcAddressForChain(args.chainKey);
  const blockchain = getCircleBlockchain(args.chainKey);

  if (args.mode === "create_event") {
    const createTx = await createContractExecutionTransaction(config, {
      walletId: args.walletId,
      blockchain,
      contractAddress,
      abiFunctionSignature: "createEvent(string,uint256,uint256)",
      abiParameters: [
        args.eventName ?? `Telegram Event ${Date.now()}`,
        Math.floor(args.priceUsdc * 1_000_000),
        args.maxTickets ?? 100,
      ],
      idempotencyKey: args.idempotencyKey,
    });
    return {
      txHash: (createTx.txHash ??
        createTx.transactionHash ??
        createTx.transactionId ??
        createTx.id ??
        "") as string,
      transactionId: (createTx.transactionId ?? createTx.id ?? undefined) as
        | string
        | undefined,
      state: createTx.state,
      onChainEventId: undefined as number | undefined,
    };
  }

  const usdcUnits = Math.floor(args.priceUsdc * 1_000_000);
  if (usdcUnits > 0) {
    await createContractExecutionTransaction(config, {
      walletId: args.walletId,
      blockchain,
      contractAddress: usdcAddress,
      abiFunctionSignature: "approve(address,uint256)",
      abiParameters: [contractAddress, usdcUnits],
      idempotencyKey: args.idempotencyKey
        ? `${args.idempotencyKey}:approve`
        : undefined,
    });
  }

  const buyTx = await createContractExecutionTransaction(config, {
    walletId: args.walletId,
    blockchain,
    contractAddress,
    abiFunctionSignature: "buyTicket(uint256)",
    abiParameters: [args.onChainEventId],
    idempotencyKey: args.idempotencyKey,
  });

  return {
    txHash: (buyTx.txHash ??
      buyTx.transactionHash ??
      buyTx.transactionId ??
      buyTx.id ??
      "") as string,
    transactionId: (buyTx.transactionId ?? buyTx.id ?? undefined) as
      | string
      | undefined,
    state: buyTx.state,
  };
}

export function getCircleConfigForServer() {
  return getCircleConfigFromEnv();
}
