import { createCliRenderer, TextRenderable } from "@opentui/core";
import { Command, Options } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { ConvexHttpClient } from "convex/browser";
import { Array, Console, Effect, Option, pipe } from "effect";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  parseUnits,
} from "viem";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  getWorkflow,
  parseJson,
  runWorkflowById,
  startWorkflowAndRun,
} from "@/lib/effect/workflows";
import {
  getChainConfig,
  getChainLabel,
  normalizeSupportedChainKey,
  type SupportedChainKey,
} from "@/lib/chains";
import { buildDeterministicIdempotencyKey } from "@/lib/idempotency";
import { BUDDY_EVENTS_ABI, ERC20_ABI } from "@/lib/contracts";
import {
  defaultCliConfigPath,
  loadCliConfig,
  saveCliConfig,
  type StoredCliConfig,
} from "./config";

type RootCliContext = {
  configPath: string;
  json: boolean;
  config: StoredCliConfig;
  selectedChainKey: SupportedChainKey;
  serviceToken: string;
  convex: ConvexHttpClient;
};

type RootCommandArgs = {
  configPath: Option.Option<string>;
  apiUrl: Option.Option<string>;
  convexUrl: Option.Option<string>;
  chain: Option.Option<string>;
  json: boolean;
};

function requireServiceToken() {
  const token = process.env.CONVEX_SERVICE_TOKEN?.trim();
  if (!token) {
    throw new Error("CONVEX_SERVICE_TOKEN is required");
  }
  return token;
}

function cliError(error: unknown, fallbackMessage: string) {
  if (error instanceof Error) {
    return new Error(error.message);
  }
  return new Error(fallbackMessage);
}

async function buildRootCliContext(
  args: RootCommandArgs,
): Promise<RootCliContext> {
  const loaded = await loadCliConfig(
    Option.getOrUndefined(args.configPath) || defaultCliConfigPath(),
  );
  const config: StoredCliConfig = {
    ...loaded.config,
    apiUrl: Option.getOrUndefined(args.apiUrl) || loaded.config.apiUrl,
    convexUrl: Option.getOrUndefined(args.convexUrl) || loaded.config.convexUrl,
  };
  const context: RootCliContext = {
    configPath: loaded.path,
    json: args.json,
    config,
    selectedChainKey: normalizeSupportedChainKey(
      Option.getOrUndefined(args.chain) ?? config.defaultChainKey,
    ),
    serviceToken: requireServiceToken(),
    convex: new ConvexHttpClient(config.convexUrl),
  };
  hydrateEnv(context);
  return context;
}

function hydrateEnv(context: RootCliContext) {
  process.env.NEXT_PUBLIC_CONVEX_URL = context.config.convexUrl;
  process.env.CONVEX_SERVICE_TOKEN = context.serviceToken;
  process.env.MONAD_RPC_URL = context.config.chains.monadTestnet.rpcUrl;
  process.env.NEXT_PUBLIC_MONAD_RPC = context.config.chains.monadTestnet.rpcUrl;
  process.env.NEXT_PUBLIC_BASE_RPC = context.config.chains.baseMainnet.rpcUrl;
  process.env.MONAD_BUDDY_EVENTS_CONTRACT =
    context.config.chains.monadTestnet.contractAddress;
  process.env.NEXT_PUBLIC_BUDDY_EVENTS_CONTRACT =
    context.config.chains.monadTestnet.contractAddress;
  process.env.BASE_BUDDY_EVENTS_CONTRACT =
    context.config.chains.baseMainnet.contractAddress;
}

function output(context: RootCliContext, value: unknown) {
  return context.json
    ? Console.log(JSON.stringify(value, null, 2))
    : Console.log(
        typeof value === "string" ? value : JSON.stringify(value, null, 2),
      );
}

function withCliContext<A>(
  fallbackMessage: string,
  handler: (context: RootCliContext) => Promise<A>,
) {
  return Effect.flatMap(rootCommand, (rootArgs) =>
    Effect.gen(function* () {
      const context = yield* Effect.tryPromise({
        try: () => buildRootCliContext(rootArgs),
        catch: (error) => cliError(error, fallbackMessage),
      });
      const result = yield* Effect.tryPromise({
        try: () => handler(context),
        catch: (error) => cliError(error, fallbackMessage),
      });
      yield* output(context, result);
    }),
  );
}

function withCliContextEffect(
  fallbackMessage: string,
  handler: (context: RootCliContext) => Promise<void>,
) {
  return Effect.flatMap(rootCommand, (rootArgs) =>
    Effect.gen(function* () {
      const context = yield* Effect.tryPromise({
        try: () => buildRootCliContext(rootArgs),
        catch: (error) => cliError(error, fallbackMessage),
      });
      yield* Effect.tryPromise({
        try: () => handler(context),
        catch: (error) => cliError(error, fallbackMessage),
      });
    }),
  );
}

function requireWalletAddress(
  context: RootCliContext,
  explicitWalletAddress?: string,
  message = "No wallet configured. Run `buddyevents wallet setup`.",
) {
  const walletAddress = explicitWalletAddress || context.config.walletAddress;
  if (!walletAddress) {
    throw new Error(message);
  }
  return walletAddress;
}

function requirePrivateKey(context: RootCliContext) {
  if (!context.config.privateKey) {
    throw new Error(
      "No private key configured. Run `buddyevents wallet setup`.",
    );
  }
  return context.config.privateKey as `0x${string}`;
}

function getSelectedChain(
  context: RootCliContext,
  chainKey = context.selectedChainKey,
) {
  return {
    chainKey,
    config: context.config.chains[chainKey],
    chain: getChainConfig(chainKey),
  };
}

function getAccount(context: RootCliContext) {
  return privateKeyToAccount(requirePrivateKey(context));
}

function getPublicClient(
  context: RootCliContext,
  chainKey: SupportedChainKey = context.selectedChainKey,
) {
  const selected = getSelectedChain(context, chainKey);
  return createPublicClient({
    chain: selected.chain.viemChain,
    transport: http(selected.config.rpcUrl),
  });
}

function getWalletClient(
  context: RootCliContext,
  chainKey: SupportedChainKey = context.selectedChainKey,
) {
  const account = getAccount(context);
  const selected = getSelectedChain(context, chainKey);
  const walletClient = createWalletClient({
    account,
    chain: selected.chain.viemChain,
    transport: http(selected.config.rpcUrl),
  });
  return { account, walletClient };
}

async function getEventOrThrow(context: RootCliContext, eventId: string) {
  const event = await context.convex.query(api.events.get, {
    id: eventId as Id<"events">,
  } as never);
  if (!event) {
    throw new Error(`Event ${eventId} not found`);
  }
  return event;
}

async function resolveCommandChainKey(
  context: RootCliContext,
  eventId?: string,
): Promise<SupportedChainKey> {
  if (!eventId) {
    return context.selectedChainKey;
  }

  const event = await getEventOrThrow(context, eventId);
  return event.chainKey;
}

async function requireUserIdByWallet(
  context: RootCliContext,
  walletAddress: string,
) {
  const user = await context.convex.query(api.users.getByWallet, {
    walletAddress,
    serviceToken: context.serviceToken,
  } as never);

  if (!user) {
    throw new Error(`No user found for wallet ${walletAddress}`);
  }

  return user._id;
}

function buildApiUrl(context: RootCliContext, pathname: string) {
  return `${context.config.apiUrl.replace(/\/$/, "")}${pathname}`;
}

function formatWorkflow(
  execution: {
    payloadJson: string;
    resultJson?: string;
    errorJson?: string;
  } & Record<string, unknown>,
) {
  return {
    ...execution,
    payload: parseJson(execution.payloadJson),
    result: parseJson(execution.resultJson),
    error: parseJson(execution.errorJson),
  };
}

async function fetchJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = (await response.json()) as T & {
    error?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(
      body.error ?? body.message ?? `Request failed (${response.status})`,
    );
  }
  return body;
}

const configPathOption = Options.text("config").pipe(Options.optional);
const apiUrlOption = Options.text("api-url").pipe(Options.optional);
const convexUrlOption = Options.text("convex-url").pipe(Options.optional);
const chainOption = Options.text("chain").pipe(Options.optional);
const jsonOption = Options.boolean("json");

const rootCommand = Command.make(
  "buddyevents",
  {
    configPath: configPathOption,
    apiUrl: apiUrlOption,
    convexUrl: convexUrlOption,
    chain: chainOption,
    json: jsonOption,
  },
  () => Effect.succeed(undefined),
);

const walletSetup = Command.make("setup", {}, () =>
  withCliContext("Wallet setup failed", async (context) => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const nextConfig: StoredCliConfig = {
      ...context.config,
      privateKey,
      walletAddress: account.address,
    };
    const savedPath = await saveCliConfig(nextConfig, context.configPath);
    return {
      walletAddress: account.address,
      privateKey,
      savedPath,
    };
  }),
);

const walletBalance = Command.make("balance", {}, () =>
  withCliContext("Balance check failed", async (context) => {
    const walletAddress = requireWalletAddress(context);
    const selected = getSelectedChain(context);
    const client = getPublicClient(context, selected.chainKey);
    const [nativeBalance, usdc] = await Promise.all([
      client.getBalance({ address: walletAddress as `0x${string}` }),
      client.readContract({
        address: selected.config.usdcAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [walletAddress as `0x${string}`],
      }),
    ]);

    return {
      chainKey: selected.chainKey,
      chain: getChainLabel(selected.chainKey),
      walletAddress,
      nativeSymbol: selected.chain.nativeSymbol,
      native: formatUnits(nativeBalance, 18),
      usdc: formatUnits(usdc, 6),
    };
  }),
);

const walletFund = Command.make("fund", {}, () =>
  withCliContext("Faucet request failed", async (context) => {
    if (context.selectedChainKey !== "monadTestnet") {
      throw new Error("Faucet funding is only available on Monad Testnet.");
    }
    const walletAddress = requireWalletAddress(context);
    const result = await fetchJson<{ txHash?: string }>(
      "https://agents.devnads.com/v1/faucet",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chainId: 10143,
          address: walletAddress,
        }),
      },
    );

    return {
      chainKey: context.selectedChainKey,
      walletAddress,
      txHash: result.txHash ?? null,
    };
  }),
);

const sendTo = Options.text("to");
const sendAmount = Options.text("amount");
const sendToken = Options.text("token").pipe(Options.withDefault("mon"));

const walletSend = Command.make(
  "send",
  {
    to: sendTo,
    amount: sendAmount,
    token: sendToken,
  },
  ({ to, amount, token }) =>
    withCliContext("Send failed", async (context) => {
      const selected = getSelectedChain(context);
      const { walletClient } = getWalletClient(context, selected.chainKey);
      const normalizedToken = token.toLowerCase();

      let hash: `0x${string}`;
      if (normalizedToken === "usdc") {
        hash = await walletClient.writeContract({
          address: selected.config.usdcAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [to as `0x${string}`, parseUnits(amount, 6)],
        });
      } else {
        hash = await walletClient.sendTransaction({
          to: to as `0x${string}`,
          value: parseUnits(amount, 18),
        });
      }

      return {
        chainKey: selected.chainKey,
        to,
        amount,
        token:
          normalizedToken === "usdc" ? "usdc" : selected.chain.nativeSymbol,
        txHash: hash,
      };
    }),
);

const walletCommand = Command.make("wallet", {}, () =>
  Effect.succeed(undefined),
).pipe(
  Command.withSubcommands([walletSetup, walletBalance, walletFund, walletSend]),
);

const statusOption = Options.text("status").pipe(Options.optional);
const listLimitOption = Options.integer("limit").pipe(Options.withDefault(20));

const eventsList = Command.make(
  "list",
  { status: statusOption },
  ({ status }) =>
    withCliContext("Event listing failed", async (context) => {
      return await context.convex.query(api.events.list, {
        status: Option.getOrUndefined(status),
      } as never);
    }),
);

const eventName = Options.text("name");
const eventDescription = Options.text("description").pipe(
  Options.withDefault(""),
);
const eventStart = Options.text("start");
const eventEnd = Options.text("end");
const eventPrice = Options.text("price").pipe(Options.withDefault("0"));
const eventMaxTickets = Options.integer("max-tickets").pipe(
  Options.withDefault(100),
);
const eventTeamId = Options.text("team-id");
const eventLocation = Options.text("location").pipe(Options.withDefault(""));
const eventCreator = Options.text("creator").pipe(Options.optional);

const eventsCreate = Command.make(
  "create",
  {
    name: eventName,
    description: eventDescription,
    start: eventStart,
    end: eventEnd,
    price: eventPrice,
    maxTickets: eventMaxTickets,
    teamId: eventTeamId,
    location: eventLocation,
    creator: eventCreator,
  },
  (config) =>
    withCliContext("Event creation failed", async (context) => {
      const chainKey = context.selectedChainKey;
      const creatorAddress = requireWalletAddress(
        context,
        Option.getOrUndefined(config.creator),
        "Provide --creator or configure a wallet first.",
      );
      const creatorUserId = await requireUserIdByWallet(
        context,
        creatorAddress,
      );
      const idempotencyKey = buildDeterministicIdempotencyKey(
        "cli-create-event",
        [
          config.name,
          config.start,
          config.end,
          config.teamId,
          creatorAddress,
          chainKey,
        ],
      );

      const workflow = await startWorkflowAndRun({
        workflowName: "create_event",
        idempotencyKey,
        source: "cli",
        actorUserId: creatorUserId,
        payload: {
          name: config.name,
          description: config.description,
          startTime: Number(config.start),
          endTime: Number(config.end),
          price: Number(config.price),
          maxTickets: config.maxTickets,
          chainKey,
          teamId: config.teamId as Id<"teams">,
          sponsors: [],
          location: config.location,
          creatorAddress,
          creatorUserId,
          chainReference: idempotencyKey,
        },
      });

      return {
        chainKey,
        chain: getChainLabel(chainKey),
        workflowId: workflow.execution._id,
        status: workflow.completed?.status ?? workflow.execution.status,
        result: parseJson(workflow.completed?.resultJson) ?? null,
      };
    }),
);

const cancelEventId = Options.text("id");

const eventsCancel = Command.make("cancel", { id: cancelEventId }, ({ id }) =>
  withCliContext("Event cancel failed", async (context) => {
    await context.convex.mutation(api.events.cancel, {
      id: id as Id<"events">,
      serviceToken: context.serviceToken,
    } as never);

    return { ok: true, eventId: id };
  }),
);

const eventsCommand = Command.make("events", {}, () =>
  Effect.succeed(undefined),
).pipe(Command.withSubcommands([eventsList, eventsCreate, eventsCancel]));

const buyerOption = Options.text("buyer").pipe(Options.optional);
const ticketEventId = Options.text("event-id").pipe(Options.optional);

const ticketsList = Command.make(
  "list",
  { buyer: buyerOption, eventId: ticketEventId },
  ({ buyer, eventId }) =>
    withCliContext("Ticket listing failed", async (context) => {
      if (Option.isSome(eventId)) {
        return await context.convex.query(api.tickets.listByEvent, {
          eventId: eventId.value as Id<"events">,
          serviceToken: context.serviceToken,
        } as never);
      }

      const buyerAddress = requireWalletAddress(
        context,
        Option.getOrUndefined(buyer),
        "Provide --buyer or configure a wallet first.",
      );
      return await context.convex.query(api.tickets.listByBuyer, {
        buyerAddress,
        serviceToken: context.serviceToken,
      } as never);
    }),
);

const onChainEventIdOption = Options.text("on-chain-id").pipe(Options.optional);

const ticketsBuy = Command.make(
  "buy",
  { eventId: ticketEventId, onChainId: onChainEventIdOption },
  ({ eventId, onChainId }) =>
    withCliContext("Ticket purchase failed", async (context) => {
      const resolvedEventId = Option.getOrUndefined(eventId);
      const event = resolvedEventId
        ? await getEventOrThrow(context, resolvedEventId)
        : null;
      const chainKey = await resolveCommandChainKey(context, resolvedEventId);
      const selected = getSelectedChain(context, chainKey);
      const { account, walletClient } = getWalletClient(context, chainKey);

      if (Option.isSome(onChainId)) {
        const contractAddress = (event?.contractAddress ??
          selected.config.contractAddress) as `0x${string}`;
        const hash = await walletClient.writeContract({
          address: contractAddress,
          abi: BUDDY_EVENTS_ABI,
          functionName: "buyTicket",
          args: [BigInt(onChainId.value)],
        });

        if (!Option.isSome(eventId)) {
          return {
            chainKey,
            chain: getChainLabel(chainKey),
            txHash: hash,
            onChainEventId: onChainId.value,
            workflowId: null,
            status: "submitted",
          };
        }

        const confirmationKey = buildDeterministicIdempotencyKey(
          "cli-wallet-purchase-confirm",
          [eventId.value, account.address, hash, chainKey],
        );
        const confirmation = await fetchJson<{
          ok: boolean;
          workflowId: string;
          status: string;
          ticketId?: string;
          qrToken?: string;
          qrTokenExpiresAt?: number;
          txHash?: string;
        }>(buildApiUrl(context, "/api/purchases/confirm"), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": confirmationKey,
          },
          body: JSON.stringify({
            eventId: eventId.value,
            buyerAddress: account.address,
            txHash: hash,
            purchasePrice: event!.price,
          }),
        });

        return {
          chainKey,
          chain: getChainLabel(chainKey),
          txHash: hash,
          onChainEventId: onChainId.value,
          workflowId: confirmation.workflowId,
          status: confirmation.status,
          ticketId: confirmation.ticketId ?? null,
          qrToken: confirmation.qrToken ?? null,
          qrTokenExpiresAt: confirmation.qrTokenExpiresAt ?? null,
        };
      }

      if (!Option.isSome(eventId)) {
        throw new Error("Provide --event-id or --on-chain-id.");
      }

      const buyerAddress = requireWalletAddress(context);
      const idempotencyKey = buildDeterministicIdempotencyKey(
        "cli-x402-ticket-buy",
        [eventId.value, buyerAddress, chainKey],
      );
      const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
        schemes: [
          {
            network: "eip155:*",
            client: new ExactEvmScheme(account),
          },
        ],
      });
      const response = await fetchWithPayment(
        buildApiUrl(
          context,
          `/api/events/${eventId.value}/buy?buyer=${buyerAddress}`,
        ),
        {
          method: "GET",
          headers: {
            "x-buyer-address": buyerAddress,
            "Idempotency-Key": idempotencyKey,
          },
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          (payload as { error?: string; message?: string }).error ??
            (payload as { error?: string; message?: string }).message ??
            "Ticket buy failed",
        );
      }

      return {
        chainKey,
        chain: getChainLabel(chainKey),
        ...(payload as Record<string, unknown>),
      };
    }),
);

const ticketTokenId = Options.text("token-id");
const resalePrice = Options.text("price");

const ticketsSell = Command.make(
  "sell",
  { tokenId: ticketTokenId, price: resalePrice },
  ({ tokenId, price }) =>
    withCliContext("Ticket resale failed", async (context) => {
      const selected = getSelectedChain(context);
      const { walletClient } = getWalletClient(context, selected.chainKey);
      const hash = await walletClient.writeContract({
        address: selected.config.contractAddress as `0x${string}`,
        abi: BUDDY_EVENTS_ABI,
        functionName: "listTicket",
        args: [BigInt(tokenId), parseUnits(price, 6)],
      });

      return {
        chainKey: selected.chainKey,
        chain: getChainLabel(selected.chainKey),
        tokenId,
        price,
        txHash: hash,
      };
    }),
);

const ticketsCommand = Command.make("tickets", {}, () =>
  Effect.succeed(undefined),
).pipe(Command.withSubcommands([ticketsList, ticketsBuy, ticketsSell]));

const agentName = Options.text("name");
const agentWallet = Options.text("wallet").pipe(Options.optional);
const agentOwner = Options.text("owner").pipe(Options.optional);

const agentRegister = Command.make(
  "register",
  { name: agentName, wallet: agentWallet, owner: agentOwner },
  ({ name, wallet, owner }) =>
    withCliContext("Agent registration failed", async (context) => {
      const walletAddress = requireWalletAddress(
        context,
        Option.getOrUndefined(wallet),
        "Provide --wallet or configure a wallet first.",
      );
      const ownerAddress = requireWalletAddress(
        context,
        Option.getOrUndefined(owner),
        "Provide --owner or configure a wallet first.",
      );
      const agentId = await context.convex.mutation(api.agents.register, {
        name,
        walletAddress,
        ownerAddress,
        serviceToken: context.serviceToken,
      } as never);

      return { agentId, name, walletAddress, ownerAddress };
    }),
);

const agentInfo = Command.make("info", { wallet: agentWallet }, ({ wallet }) =>
  withCliContext("Agent lookup failed", async (context) => {
    const walletAddress = requireWalletAddress(
      context,
      Option.getOrUndefined(wallet),
      "Provide --wallet or configure a wallet first.",
    );
    return await context.convex.query(api.agents.getByWallet, {
      walletAddress,
    } as never);
  }),
);

const agentCommand = Command.make("agent", {}, () =>
  Effect.succeed(undefined),
).pipe(Command.withSubcommands([agentRegister, agentInfo]));

const workflowStatus = Options.text("status").pipe(Options.optional);
const workflowId = Options.text("id");

const workflowsList = Command.make(
  "list",
  { status: workflowStatus, limit: listLimitOption },
  ({ status, limit }) =>
    withCliContext("Workflow listing failed", async (context) => {
      return await context.convex.query(api.workflows.list, {
        status: Option.getOrUndefined(status),
        limit,
        serviceToken: context.serviceToken,
      } as never);
    }),
);

const workflowsGet = Command.make("get", { id: workflowId }, ({ id }) =>
  withCliContext("Workflow lookup failed", async () => {
    const workflow = await getWorkflow(id as Id<"workflowExecutions">);
    return workflow ? formatWorkflow(workflow) : null;
  }),
);

const workflowsRetry = Command.make("retry", { id: workflowId }, ({ id }) =>
  withCliContext("Workflow retry failed", async (context) => {
    await context.convex.mutation(api.workflows.retry, {
      id: id as Id<"workflowExecutions">,
      serviceToken: context.serviceToken,
    } as never);

    const rerun = await runWorkflowById(
      id as Id<"workflowExecutions">,
      `cli-${process.pid}`,
    );

    return rerun ? formatWorkflow(rerun) : null;
  }),
);

const workflowsSweep = Command.make("sweep", {}, () =>
  withCliContext("Workflow sweep failed", async (context) => {
    const swept = await context.convex.mutation(api.workflows.sweepStale, {
      serviceToken: context.serviceToken,
    } as never);
    return { swept };
  }),
);

const workflowsCommand = Command.make("workflow", {}, () =>
  Effect.succeed(undefined),
).pipe(
  Command.withSubcommands([
    workflowsList,
    workflowsGet,
    workflowsRetry,
    workflowsSweep,
  ]),
);

function makeReconcileSubcommand(
  name: "purchases" | "events" | "wallets",
  workflowName: "ticket_purchase" | "create_event" | "provision_circle_wallet",
) {
  return Command.make(name, {}, () =>
    withCliContext("Reconcile failed", async (context) => {
      const workflows = await context.convex.query(api.workflows.list, {
        limit: 100,
        serviceToken: context.serviceToken,
      } as never);

      const matching = (workflows as Array<Doc<"workflowExecutions">>).filter(
        (workflow) =>
          workflow.workflowName === workflowName &&
          workflow.status !== "completed",
      );

      const results = [];
      for (const workflow of matching) {
        results.push(await runWorkflowById(workflow._id, `cli-${process.pid}`));
      }

      return {
        reconciled: matching.length,
        results: results.map((result) =>
          result ? formatWorkflow(result) : null,
        ),
      };
    }),
  );
}

const reconcileCommand = Command.make("reconcile", {}, () =>
  Effect.succeed(undefined),
).pipe(
  Command.withSubcommands([
    makeReconcileSubcommand("purchases", "ticket_purchase"),
    makeReconcileSubcommand("events", "create_event"),
    makeReconcileSubcommand("wallets", "provision_circle_wallet"),
    Command.make("backfill", {}, () =>
      withCliContext("Chain metadata backfill failed", async (context) => {
        const [events, tickets, wallets] = await Promise.all([
          context.convex.mutation(api.events.backfillChainMetadataService, {
            serviceToken: context.serviceToken,
          } as never),
          context.convex.mutation(api.tickets.backfillChainMetadataService, {
            serviceToken: context.serviceToken,
          } as never),
          context.convex.mutation(api.wallets.backfillChainMetadataService, {
            serviceToken: context.serviceToken,
          } as never),
        ]);

        return { events, tickets, wallets };
      }),
    ),
  ]),
);

const tuiCommand = Command.make("tui", {}, () =>
  withCliContextEffect("TUI failed", async (context) => {
    const workflows = await context.convex.query(api.workflows.list, {
      limit: 100,
      serviceToken: context.serviceToken,
    } as never);
    const counts = Array.reduce(
      workflows as Array<{ status: string }>,
      {} as Record<string, number>,
      (acc, workflow) => ({
        ...acc,
        [workflow.status]: (acc[workflow.status] ?? 0) + 1,
      }),
    );

    const renderer = await createCliRenderer();
    const text = new TextRenderable(renderer, {
      content: [
        "BuddyEvents TUI",
        "",
        `Pending: ${counts.pending ?? 0}`,
        `Running: ${counts.in_progress ?? 0}`,
        `Retrying: ${counts.waiting_retry ?? 0}`,
        `Completed: ${counts.completed ?? 0}`,
        `Failed: ${counts.failed ?? 0}`,
        "",
        "Press Ctrl-C to exit.",
      ].join("\n"),
    });

    renderer.root.add(text);
    renderer.start();

    await new Promise<void>((resolve) => {
      const onSigint = () => {
        process.off("SIGINT", onSigint);
        renderer.destroy();
        resolve();
      };
      process.on("SIGINT", onSigint);
    });
  }),
);

const command = pipe(
  rootCommand,
  Command.withSubcommands([
    walletCommand,
    eventsCommand,
    ticketsCommand,
    agentCommand,
    workflowsCommand,
    reconcileCommand,
    tuiCommand,
  ]),
);

const cli = Command.run(command, {
  name: "BuddyEvents CLI",
  version: "v2.0.0",
});

cli(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain);
