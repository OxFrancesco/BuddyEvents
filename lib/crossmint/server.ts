import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import { createPublicClient, formatUnits, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ConvexHttpClient } from "convex/browser";
import { WalletsApiClient, createCrossmint } from "@crossmint/wallets-sdk";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  DEFAULT_CHAIN_KEY,
  getChainConfig,
  getConfiguredBuddyEventsAddress,
  getPublicRpcUrl,
  getUsdcAddressForChain,
  type SupportedChainKey,
} from "@/lib/chains";
import { ERC20_ABI, BUDDY_EVENTS_ABI } from "@/lib/contracts";
import {
  getAutomationWalletAlias,
  getCrossmintAliasLocator,
  getCrossmintChainForAppChain,
  getCrossmintTransactionHash,
  getExternalWalletSignerLocator,
  getHumanWalletAlias,
  getServerSignerLocator,
  getSupportedChainKeyForCrossmintChain,
  type CrossmintWalletPurpose,
} from "@/lib/crossmint/shared";
import { sameAddress } from "@/lib/walletOwnership";

type CrossmintWalletRecord = Doc<"wallets">;

type CrossmintWalletResponse = {
  id?: string;
  address?: string;
  owner?: string;
  config?: {
    adminSigner?: unknown;
    delegatedSigners?: Array<unknown>;
  };
  error?: unknown;
};

type CrossmintTransactionResponse = {
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
  error?: unknown;
};

type CrossmintServerConfig = {
  clientApiKey?: string;
  serverApiKey: string;
  serverSignerSecret: string;
  canonicalChain: string;
  canonicalChainKey: SupportedChainKey;
  clerkJwtTemplate: string;
  enableHumanWallet: boolean;
  enableAutomation: boolean;
};

type ServerSignerDetails = {
  derivedKeyBytes: Uint8Array;
  derivedAddress: string;
};

const SERVER_SIGNER_SECRET_PREFIX = "xmsk1_";
const SERVER_SIGNER_INFO_SALT = "crossmint";

function getConvexServiceToken() {
  const token = process.env.CONVEX_SERVICE_TOKEN;
  if (!token) {
    throw new Error("CONVEX_SERVICE_TOKEN is not set");
  }
  return token;
}

export function getCrossmintServerConfig(): CrossmintServerConfig {
  const serverApiKey = process.env.CROSSMINT_SERVER_API_KEY?.trim();
  if (!serverApiKey) {
    throw new Error("CROSSMINT_SERVER_API_KEY is not set");
  }

  const serverSignerSecret = process.env.CROSSMINT_SERVER_SIGNER_SECRET?.trim();
  if (!serverSignerSecret) {
    throw new Error("CROSSMINT_SERVER_SIGNER_SECRET is not set");
  }

  const canonicalChain = process.env.CROSSMINT_CHAIN?.trim() || "monad-testnet";

  return {
    clientApiKey: process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY?.trim(),
    serverApiKey,
    serverSignerSecret,
    canonicalChain,
    canonicalChainKey: getSupportedChainKeyForCrossmintChain(canonicalChain),
    clerkJwtTemplate: process.env.CLERK_CROSSMINT_JWT_TEMPLATE?.trim() || "crossmint",
    enableHumanWallet:
      process.env.NEXT_PUBLIC_ENABLE_CROSSMINT_HUMAN_WALLET === "true",
    enableAutomation: process.env.ENABLE_CROSSMINT_AUTOMATION === "true",
  };
}

function getCrossmintApiClient() {
  const config = getCrossmintServerConfig();
  const crossmint = createCrossmint({ apiKey: config.serverApiKey });
  return new WalletsApiClient(crossmint);
}

function ensureHexSecret(secret: string) {
  const raw = secret.startsWith(SERVER_SIGNER_SECRET_PREFIX)
    ? secret.slice(SERVER_SIGNER_SECRET_PREFIX.length)
    : secret;

  if (raw.length !== 64 || !/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error("Invalid CROSSMINT_SERVER_SIGNER_SECRET");
  }

  const bytes = new Uint8Array(raw.length / 2);
  for (let index = 0; index < raw.length; index += 2) {
    bytes[index / 2] = Number.parseInt(raw.slice(index, index + 2), 16);
  }
  return bytes;
}

function getCurveForChain(chain: string) {
  return chain === "solana" || chain === "stellar" ? "ed25519" : "secp256k1";
}

function deriveServerSigner(config: CrossmintServerConfig): ServerSignerDetails {
  const apiClient = getCrossmintApiClient();
  const secretBytes = ensureHexSecret(config.serverSignerSecret);
  const curve = getCurveForChain(config.canonicalChain);
  const info = `${apiClient.projectId}:${apiClient.environment}:${config.canonicalChain}-${curve}`;
  const derivedKeyBytes = hkdf(
    sha256,
    secretBytes,
    SERVER_SIGNER_INFO_SALT,
    info,
    32,
  );
  const derivedAddress = privateKeyToAccount(
    `0x${bytesToHex(derivedKeyBytes)}`,
  ).address;

  return { derivedKeyBytes, derivedAddress };
}

function asCrossmintWalletResponse(value: unknown): CrossmintWalletResponse {
  if (!value || typeof value !== "object") {
    throw new Error("Crossmint wallet response was empty");
  }
  if ("error" in value) {
    throw new Error(JSON.stringify((value as { error: unknown }).error));
  }
  return value as CrossmintWalletResponse;
}

function asCrossmintTransactionResponse(value: unknown): CrossmintTransactionResponse {
  if (!value || typeof value !== "object") {
    throw new Error("Crossmint transaction response was empty");
  }
  if ("error" in value) {
    throw new Error(JSON.stringify((value as { error: unknown }).error));
  }
  return value as CrossmintTransactionResponse;
}

async function getWalletByAlias(alias: string) {
  const apiClient = getCrossmintApiClient();
  const wallet = await apiClient.getWallet(
    getCrossmintAliasLocator(alias) as never,
  );
  if (wallet && typeof wallet === "object" && "error" in wallet) {
    return null;
  }
  return asCrossmintWalletResponse(wallet);
}

async function syncWalletRecord(args: {
  convex: ConvexHttpClient;
  userId: Id<"users">;
  wallet: CrossmintWalletResponse;
  purpose: CrossmintWalletPurpose;
  controlMode: "external_wallet" | "server";
  recoveryMode?: "email" | "server";
  linkedSignerAddress?: string;
  linkedEmail?: string;
}) {
  if (!args.wallet.id || !args.wallet.address) {
    throw new Error("Crossmint wallet response missing id or address");
  }

  const serviceToken = getConvexServiceToken();
  const config = getCrossmintServerConfig();
  await args.convex.mutation(api.wallets.upsertCrossmintWallet, {
    userId: args.userId,
    walletId: args.wallet.id,
    walletAddress: args.wallet.address,
    chainKey: config.canonicalChainKey,
    blockchain: config.canonicalChain,
    purpose: args.purpose,
    controlMode: args.controlMode,
    recoveryMode: args.recoveryMode,
    linkedSignerAddress: args.linkedSignerAddress,
    linkedEmail: args.linkedEmail,
    serviceToken,
  });

  const wallet = await args.convex.query(api.wallets.getByUserAndPurpose, {
    userId: args.userId,
    purpose: args.purpose,
    serviceToken,
  });
  if (!wallet) {
    throw new Error("Failed to sync Crossmint wallet");
  }
  return wallet;
}

async function getWalletByPurpose(
  convex: ConvexHttpClient,
  userId: Id<"users">,
  purpose: CrossmintWalletPurpose,
) {
  return await convex.query(api.wallets.getByUserAndPurpose, {
    userId,
    purpose,
    serviceToken: getConvexServiceToken(),
  });
}

async function registerExternalWalletSigner(walletAddress: string, signerAddress: string) {
  const apiClient = getCrossmintApiClient();
  const response = await apiClient.registerSigner(walletAddress as never, {
    chain: getCrossmintServerConfig().canonicalChain as never,
    signer: {
      type: "external-wallet",
      address: signerAddress,
    } as unknown as Parameters<typeof apiClient.registerSigner>[1]["signer"],
  });

  if (response && typeof response === "object" && "error" in response) {
    const message = JSON.stringify((response as { error: unknown }).error);
    if (
      message.toLowerCase().includes("already") ||
      message.toLowerCase().includes("exists")
    ) {
      return;
    }
    throw new Error(message);
  }
}

export async function ensureHumanCrossmintWalletForUser(args: {
  convex: ConvexHttpClient;
  user: Doc<"users">;
  email: string;
  signerAddress: string;
  forceRelink?: boolean;
}) {
  const config = getCrossmintServerConfig();
  if (!config.enableHumanWallet) {
    throw new Error("Crossmint human wallet provisioning is disabled");
  }

  const existing = await getWalletByPurpose(args.convex, args.user._id, "human_primary");
  if (existing) {
    if (
      existing.linkedSignerAddress &&
      !sameAddress(existing.linkedSignerAddress, args.signerAddress)
    ) {
      if (!args.forceRelink) {
        throw new Error("Smart wallet signer mismatch. Confirmation required to relink.");
      }
      await registerExternalWalletSigner(existing.walletAddress, args.signerAddress);
    }

    return await syncWalletRecord({
      convex: args.convex,
      userId: args.user._id,
      wallet: {
        id: existing.walletId,
        address: existing.walletAddress,
      },
      purpose: "human_primary",
      controlMode: "external_wallet",
      recoveryMode: "email",
      linkedSignerAddress: args.signerAddress,
      linkedEmail: args.email,
    });
  }

  const alias = getHumanWalletAlias(args.user.clerkId, config.canonicalChain);
  const existingByAlias = await getWalletByAlias(alias);
  if (existingByAlias?.id && existingByAlias.address) {
    return await syncWalletRecord({
      convex: args.convex,
      userId: args.user._id,
      wallet: existingByAlias,
      purpose: "human_primary",
      controlMode: "external_wallet",
      recoveryMode: "email",
      linkedSignerAddress: args.signerAddress,
      linkedEmail: args.email,
    });
  }

  const apiClient = getCrossmintApiClient();
  const created = await apiClient.createWallet({
    chainType: "evm",
    type: "smart",
    alias,
    owner: `userId:${args.user.clerkId}`,
    config: {
      adminSigner: {
        type: "email",
        email: args.email,
      },
      delegatedSigners: [
        {
          signer: {
            type: "external-wallet",
            address: args.signerAddress,
          },
        },
      ],
    },
  });

  return await syncWalletRecord({
    convex: args.convex,
    userId: args.user._id,
    wallet: asCrossmintWalletResponse(created),
    purpose: "human_primary",
    controlMode: "external_wallet",
    recoveryMode: "email",
    linkedSignerAddress: args.signerAddress,
    linkedEmail: args.email,
  });
}

export async function ensureAutomationCrossmintWalletForUser(args: {
  convex: ConvexHttpClient;
  user: Doc<"users">;
}) {
  const config = getCrossmintServerConfig();
  if (!config.enableAutomation) {
    throw new Error("Crossmint automation wallet provisioning is disabled");
  }

  const existing = await getWalletByPurpose(args.convex, args.user._id, "automation");
  if (existing) {
    return existing;
  }

  const alias = getAutomationWalletAlias(args.user.clerkId, config.canonicalChain);
  const existingByAlias = await getWalletByAlias(alias);
  if (existingByAlias?.id && existingByAlias.address) {
    return await syncWalletRecord({
      convex: args.convex,
      userId: args.user._id,
      wallet: existingByAlias,
      purpose: "automation",
      controlMode: "server",
      recoveryMode: "server",
      linkedSignerAddress: undefined,
      linkedEmail: args.user.email,
    });
  }

  const { derivedAddress } = deriveServerSigner(config);
  const apiClient = getCrossmintApiClient();
  const created = await apiClient.createWallet({
    chainType: "evm",
    type: "smart",
    alias,
    owner: `userId:${args.user.clerkId}`,
    config: {
      adminSigner: {
        type: "server",
        address: derivedAddress,
      },
    },
  });

  return await syncWalletRecord({
    convex: args.convex,
    userId: args.user._id,
    wallet: asCrossmintWalletResponse(created),
    purpose: "automation",
    controlMode: "server",
    recoveryMode: "server",
    linkedSignerAddress: undefined,
    linkedEmail: args.user.email,
  });
}

async function getHumanWalletRecordOrThrow(args: {
  convex: ConvexHttpClient;
  userId: Id<"users">;
}) {
  const wallet = await getWalletByPurpose(args.convex, args.userId, "human_primary");
  if (!wallet) {
    throw new Error("Crossmint smart wallet not provisioned yet");
  }
  return wallet;
}

async function createWalletTransaction(args: {
  walletAddress: string;
  chainKey: SupportedChainKey;
  signerLocator: string;
  calls: Array<{
    address: string;
    functionName: string;
    abi: Array<unknown>;
    args: Array<unknown>;
  }>;
}) {
  const apiClient = getCrossmintApiClient();
  const response = await apiClient.createTransaction(args.walletAddress as never, {
    params: {
      chain: getCrossmintChainForAppChain(args.chainKey) as never,
      signer: args.signerLocator,
      calls: args.calls,
    },
  });
  return asCrossmintTransactionResponse(response);
}

export async function createHumanApproveTransaction(args: {
  convex: ConvexHttpClient;
  userId: Id<"users">;
  signerAddress: string;
  eventId: Id<"events">;
}) {
  const wallet = await getHumanWalletRecordOrThrow({
    convex: args.convex,
    userId: args.userId,
  });

  if (
    wallet.linkedSignerAddress &&
    !sameAddress(wallet.linkedSignerAddress, args.signerAddress)
  ) {
    throw new Error("Connected wallet does not match linked Crossmint signer");
  }

  const event = await args.convex.query(api.events.get, { id: args.eventId });
  if (!event) {
    throw new Error("Event not found");
  }
  if (event.price <= 0) {
    throw new Error("Approval is not required for free tickets");
  }

  const usdcUnits = BigInt(Math.floor(event.price * 1_000_000));
  return {
    wallet,
    transaction: await createWalletTransaction({
      walletAddress: wallet.walletAddress,
      chainKey: event.chainKey,
      signerLocator: getExternalWalletSignerLocator(args.signerAddress),
      calls: [
        {
          address: getUsdcAddressForChain(event.chainKey),
          functionName: "approve",
          abi: [...ERC20_ABI],
          args: [
            event.contractAddress ?? getConfiguredBuddyEventsAddress(event.chainKey),
            usdcUnits,
          ],
        },
      ],
    }),
  };
}

export async function createHumanBuyTicketTransaction(args: {
  convex: ConvexHttpClient;
  userId: Id<"users">;
  signerAddress: string;
  eventId: Id<"events">;
}) {
  const wallet = await getHumanWalletRecordOrThrow({
    convex: args.convex,
    userId: args.userId,
  });

  if (
    wallet.linkedSignerAddress &&
    !sameAddress(wallet.linkedSignerAddress, args.signerAddress)
  ) {
    throw new Error("Connected wallet does not match linked Crossmint signer");
  }

  const event = await args.convex.query(api.events.get, { id: args.eventId });
  if (!event) {
    throw new Error("Event not found");
  }
  if (event.onChainEventId === undefined) {
    throw new Error("Event is not deployed on-chain yet");
  }

  return {
    wallet,
    transaction: await createWalletTransaction({
      walletAddress: wallet.walletAddress,
      chainKey: event.chainKey,
      signerLocator: getExternalWalletSignerLocator(args.signerAddress),
      calls: [
        {
          address:
            event.contractAddress ??
            getConfiguredBuddyEventsAddress(event.chainKey),
          functionName: "buyTicket",
          abi: [...BUDDY_EVENTS_ABI],
          args: [BigInt(event.onChainEventId)],
        },
      ],
    }),
  };
}

export async function getHumanTransaction(args: {
  convex: ConvexHttpClient;
  userId: Id<"users">;
  transactionId: string;
}) {
  const wallet = await getHumanWalletRecordOrThrow({
    convex: args.convex,
    userId: args.userId,
  });
  const apiClient = getCrossmintApiClient();
  const response = await apiClient.getTransaction(
    wallet.walletAddress as never,
    args.transactionId,
  );
  return {
    wallet,
    transaction: asCrossmintTransactionResponse(response),
  };
}

export async function approveHumanTransaction(args: {
  convex: ConvexHttpClient;
  userId: Id<"users">;
  transactionId: string;
  signerAddress: string;
  signature: string;
}) {
  const wallet = await getHumanWalletRecordOrThrow({
    convex: args.convex,
    userId: args.userId,
  });

  const apiClient = getCrossmintApiClient();
  const response = await apiClient.approveTransaction(
    wallet.walletAddress as never,
    args.transactionId,
    {
      approvals: [
        {
          signer: getExternalWalletSignerLocator(args.signerAddress),
          signature: args.signature,
        },
      ],
    },
  );

  return {
    wallet,
    transaction: asCrossmintTransactionResponse(response),
  };
}

function getContractAddressForEvent(event: Doc<"events">) {
  const chainKey = event.chainKey ?? DEFAULT_CHAIN_KEY;
  return event.contractAddress ?? getConfiguredBuddyEventsAddress(chainKey);
}

async function approveAutomationTransactionIfNeeded(args: {
  walletAddress: string;
  transaction: CrossmintTransactionResponse;
}) {
  if (args.transaction.status !== "awaiting-approval") {
    return args.transaction;
  }

  const config = getCrossmintServerConfig();
  const apiClient = getCrossmintApiClient();
  const { derivedKeyBytes, derivedAddress } = deriveServerSigner(config);
  const signer = privateKeyToAccount(`0x${bytesToHex(derivedKeyBytes)}`);
  const signerLocator = getServerSignerLocator(derivedAddress);
  const pendingApprovals =
    args.transaction.approvals?.pending.filter(
      (approval) => approval.signer.locator === signerLocator,
    ) ?? [];

  if (pendingApprovals.length === 0) {
    return args.transaction;
  }

  const approvals = await Promise.all(
    pendingApprovals.map(async (approval) => ({
      signer: signerLocator,
      signature: await signer.signMessage({ message: approval.message }),
    })),
  );

  const response = await apiClient.approveTransaction(
    args.walletAddress as never,
    args.transaction.id,
    { approvals },
  );
  return asCrossmintTransactionResponse(response);
}

export async function waitForCrossmintTransaction(args: {
  walletAddress: string;
  transactionId: string;
  timeoutMs?: number;
  intervalMs?: number;
}) {
  const apiClient = getCrossmintApiClient();
  const timeoutMs = args.timeoutMs ?? 90_000;
  const intervalMs = args.intervalMs ?? 1_500;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await apiClient.getTransaction(
      args.walletAddress as never,
      args.transactionId,
    );
    const transaction = asCrossmintTransactionResponse(response);
    if (transaction.status === "success" || transaction.status === "failed") {
      return transaction;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Crossmint transaction timed out");
}

async function executeAutomationCalls(args: {
  wallet: CrossmintWalletRecord;
  chainKey: SupportedChainKey;
  calls: Array<{
    address: string;
    functionName: string;
    abi: Array<unknown>;
    args: Array<unknown>;
  }>;
}) {
  const config = getCrossmintServerConfig();
  const { derivedAddress } = deriveServerSigner(config);
  const transaction = await createWalletTransaction({
    walletAddress: args.wallet.walletAddress,
    chainKey: args.chainKey,
    signerLocator: getServerSignerLocator(derivedAddress),
    calls: args.calls,
  });
  const approved = await approveAutomationTransactionIfNeeded({
    walletAddress: args.wallet.walletAddress,
    transaction,
  });
  return await waitForCrossmintTransaction({
    walletAddress: args.wallet.walletAddress,
    transactionId: approved.id,
  });
}

export async function executeAutomationBuyTicket(args: {
  convex: ConvexHttpClient;
  user: Doc<"users">;
  event: Doc<"events">;
}) {
  const wallet = await ensureAutomationCrossmintWalletForUser({
    convex: args.convex,
    user: args.user,
  });

  if (args.event.onChainEventId === undefined) {
    throw new Error("Event missing on-chain event ID");
  }
  const chainKey = args.event.chainKey ?? DEFAULT_CHAIN_KEY;

  if (args.event.price > 0) {
    const usdcUnits = BigInt(Math.floor(args.event.price * 1_000_000));
    await executeAutomationCalls({
      wallet,
      chainKey,
      calls: [
        {
          address: getUsdcAddressForChain(chainKey),
          functionName: "approve",
          abi: [...ERC20_ABI],
          args: [getContractAddressForEvent(args.event), usdcUnits],
        },
      ],
    });
  }

  const buyTransaction = await executeAutomationCalls({
    wallet,
    chainKey,
    calls: [
      {
        address: getContractAddressForEvent(args.event),
        functionName: "buyTicket",
        abi: [...BUDDY_EVENTS_ABI],
        args: [BigInt(args.event.onChainEventId)],
      },
    ],
  });

  return {
    wallet,
    transactionId: buyTransaction.id,
    txHash: getCrossmintTransactionHash(buyTransaction) ?? buyTransaction.id,
    state: buyTransaction.status,
  };
}

export async function executeAutomationCreateEvent(args: {
  convex: ConvexHttpClient;
  user: Doc<"users">;
  chainKey: SupportedChainKey;
  priceUsdc: number;
  eventName: string;
  maxTickets: number;
}) {
  const wallet = await ensureAutomationCrossmintWalletForUser({
    convex: args.convex,
    user: args.user,
  });

  const transaction = await executeAutomationCalls({
    wallet,
    chainKey: args.chainKey,
    calls: [
      {
        address: getConfiguredBuddyEventsAddress(args.chainKey),
        functionName: "createEvent",
        abi: [...BUDDY_EVENTS_ABI],
        args: [
          args.eventName,
          BigInt(Math.floor(args.priceUsdc * 1_000_000)),
          BigInt(args.maxTickets),
        ],
      },
    ],
  });

  return {
    wallet,
    transactionId: transaction.id,
    txHash: getCrossmintTransactionHash(transaction) ?? transaction.id,
    state: transaction.status,
  };
}

export async function getCrossmintWalletBalances(args: {
  walletAddress: string;
  chainKey: SupportedChainKey;
}) {
  const chain = getChainConfig(args.chainKey);
  const publicClient = createPublicClient({
    chain: chain.viemChain,
    transport: http(getPublicRpcUrl(args.chainKey)),
  });

  const [nativeBalance, usdcBalance] = await Promise.all([
    publicClient.getBalance({ address: args.walletAddress as `0x${string}` }),
    publicClient.readContract({
      address: getUsdcAddressForChain(args.chainKey),
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [args.walletAddress as `0x${string}`],
    }),
  ]);

  return {
    chainKey: args.chainKey,
    native: {
      symbol: chain.nativeSymbol,
      raw: nativeBalance.toString(),
      formatted: formatUnits(nativeBalance, 18),
    },
    usdc: {
      symbol: "USDC",
      raw: (usdcBalance as bigint).toString(),
      formatted: formatUnits(usdcBalance as bigint, 6),
    },
  };
}
