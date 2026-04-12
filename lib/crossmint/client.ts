"use client";

import { getCrossmintTransactionHash } from "@/lib/crossmint/shared";

export type CrossmintAppWallet = {
  walletId: string;
  walletAddress: string;
  linkedSignerAddress?: string;
  linkedEmail?: string;
  purpose?: "human_primary" | "automation";
};

export type CrossmintAppTransaction = {
  id: string;
  status: "awaiting-approval" | "pending" | "failed" | "success";
  onChain?: {
    txId?: string;
    proxiedTxId?: string;
    userOperationHash?: string;
    explorerLink?: string;
  };
  approvals?: {
    pending: Array<{
      signer: {
        locator: string;
        address?: string;
      };
      message: string;
    }>;
  };
};

type JsonOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};

async function requestJson<T>(input: string, init?: JsonOptions): Promise<T> {
  const response = await fetch(input, {
    method: init?.method ?? "GET",
    headers:
      init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Crossmint request failed");
  }

  return payload;
}

export async function provisionHumanWallet(args: {
  signerAddress: string;
  forceRelink?: boolean;
}) {
  return await requestJson<{
    ok: true;
    wallet: CrossmintAppWallet;
    relinked?: boolean;
  }>("/api/crossmint/wallets/human", {
    method: "POST",
    body: args,
  });
}

export async function createHumanApproveTransaction(args: {
  eventId: string;
  signerAddress: string;
}) {
  return await requestJson<{
    ok: true;
    wallet: CrossmintAppWallet;
    transaction: CrossmintAppTransaction;
  }>("/api/crossmint/transactions", {
    method: "POST",
    body: {
      kind: "approve_ticket_purchase",
      eventId: args.eventId,
      signerAddress: args.signerAddress,
    },
  });
}

export async function createHumanBuyTicketTransaction(args: {
  eventId: string;
  signerAddress: string;
}) {
  return await requestJson<{
    ok: true;
    wallet: CrossmintAppWallet;
    transaction: CrossmintAppTransaction;
  }>("/api/crossmint/transactions", {
    method: "POST",
    body: {
      kind: "buy_ticket",
      eventId: args.eventId,
      signerAddress: args.signerAddress,
    },
  });
}

export async function approveHumanTransaction(args: {
  transactionId: string;
  signerAddress: string;
  signature: string;
}) {
  return await requestJson<{
    ok: true;
    wallet: CrossmintAppWallet;
    transaction: CrossmintAppTransaction;
  }>(`/api/crossmint/transactions/${args.transactionId}/approve`, {
    method: "POST",
    body: {
      signerAddress: args.signerAddress,
      signature: args.signature,
    },
  });
}

export async function getHumanTransaction(transactionId: string) {
  return await requestJson<{
    ok: true;
    wallet: CrossmintAppWallet;
    transaction: CrossmintAppTransaction;
  }>(`/api/crossmint/transactions/${transactionId}`);
}

export async function waitForHumanTransaction(
  transactionId: string,
  options?: {
    timeoutMs?: number;
    intervalMs?: number;
  },
) {
  const deadline = Date.now() + (options?.timeoutMs ?? 90_000);
  const intervalMs = options?.intervalMs ?? 1_500;

  while (Date.now() < deadline) {
    const response = await getHumanTransaction(transactionId);
    if (
      response.transaction.status === "success" ||
      response.transaction.status === "failed"
    ) {
      return response;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Crossmint transaction timed out");
}

export function getHumanTransactionHash(transaction: CrossmintAppTransaction) {
  return getCrossmintTransactionHash(transaction);
}
