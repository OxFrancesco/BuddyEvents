<script lang="ts">
  import { resolve } from "$app/paths";
  import { useQuery } from "convex-svelte";
  import type { PageProps } from "./$types";
  import { api } from "@/convex/_generated/api";
  import type { Id } from "@/convex/_generated/dataModel";
  import { getClerkWeb3WalletAddress } from "@/lib/clerkWeb3";
  import {
    approveHumanTransaction,
    createHumanApproveTransaction,
    createHumanBuyTicketTransaction,
    getHumanTransactionHash,
    waitForHumanTransaction,
  } from "@/lib/crossmint/client";
  import { getExternalWalletSignerLocator } from "@/lib/crossmint/shared";
  import { getChainLabel, getUsdcAddressForChain } from "@/lib/chains";
  import { sameAddress } from "@/lib/walletOwnership";
  import ConnectWallet from "$lib/components/ConnectWallet.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import CardContent from "$lib/components/ui/CardContent.svelte";
  import CardHeader from "$lib/components/ui/CardHeader.svelte";
  import CardTitle from "$lib/components/ui/CardTitle.svelte";
  import Separator from "$lib/components/ui/Separator.svelte";
  import { getClerkContext } from "$lib/stores/clerk.svelte";
  import { getWalletContext } from "$lib/stores/wallet.svelte";

  let { params }: PageProps = $props();

  const clerkContext = getClerkContext();
  const walletContext = getWalletContext();

  const eventId = $derived(params.id as Id<"events">);
  const eventQuery = useQuery(api.events.get, () => ({ id: eventId }));
  const teamQuery = useQuery(api.teams.get, () =>
    eventQuery.data?.teamId ? { id: eventQuery.data.teamId } : "skip",
  );
  const meQuery = useQuery(api.users.me, () =>
    clerkContext.currentSession ? {} : "skip",
  );
  const humanWalletQuery = useQuery(api.wallets.getByUserAndPurpose, () =>
    meQuery.data ? { userId: meQuery.data._id, purpose: "human_primary" as const } : "skip",
  );

  const event = $derived(eventQuery.data);
  const team = $derived(teamQuery.data);
  const humanWallet = $derived(humanWalletQuery.data);
  const isSignedIn = $derived(Boolean(clerkContext.currentSession && clerkContext.currentUser));
  const clerkWalletAddress = $derived(getClerkWeb3WalletAddress(clerkContext.currentUser));
  const hasWalletMismatch = $derived(
    Boolean(
      walletContext.address &&
        clerkWalletAddress &&
        !sameAddress(walletContext.address, clerkWalletAddress),
    ),
  );
  const hasSmartWalletSignerMismatch = $derived(
    Boolean(
      walletContext.address &&
        humanWallet?.linkedSignerAddress &&
        !sameAddress(walletContext.address, humanWallet.linkedSignerAddress),
    ),
  );

  let txNotice = $state<string | null>(null);
  let purchaseSyncState = $state<
    "idle" | "approving" | "buying" | "submitting" | "done" | "error"
  >("idle");
  let purchaseWorkflowId = $state<string | null>(null);
  let activeTransactionId = $state<string | null>(null);

  function isUserRejectedError(error: unknown) {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : "";
    const normalized = message.toLowerCase();
    return (
      normalized.includes("user rejected") ||
      normalized.includes("rejected the request") ||
      normalized.includes("4001")
    );
  }

  function toReadableError(error: unknown, fallback: string) {
    if (isUserRejectedError(error)) {
      return "Transaction canceled in wallet. Click Buy Ticket and approve to continue.";
    }
    return error instanceof Error ? error.message : fallback;
  }

  async function approveAndWaitForHumanTransaction(transaction: {
    id: string;
    status: "awaiting-approval" | "pending" | "failed" | "success";
    approvals?: {
      pending: Array<{
        signer: { locator: string };
        message: string;
      }>;
    };
  }) {
    if (!walletContext.address) {
      throw new Error("Connect your signer wallet first");
    }

    if (transaction.status === "awaiting-approval") {
      const pendingApproval =
        transaction.approvals?.pending.find(
          (approval) =>
            approval.signer.locator.toLowerCase() ===
            getExternalWalletSignerLocator(walletContext.address!).toLowerCase(),
        ) ?? transaction.approvals?.pending[0];

      if (!pendingApproval) {
        throw new Error(
          "Crossmint transaction is awaiting approval, but no signature request was returned.",
        );
      }

      const signature = await walletContext.signMessage(pendingApproval.message);

      await approveHumanTransaction({
        transactionId: transaction.id,
        signerAddress: walletContext.address,
        signature,
      });
    }

    return waitForHumanTransaction(transaction.id);
  }

  async function handleBuyWithCrossmint() {
    if (!walletContext.address || !walletContext.isConnected || !isSignedIn || !event?._id) {
      return;
    }
    if (!humanWallet) {
      txNotice = "Your Crossmint smart wallet is still provisioning.";
      return;
    }
    if (!clerkContext.currentUser?.primaryEmailAddress?.emailAddress) {
      txNotice = "Add a primary email in Clerk before buying with your smart wallet.";
      return;
    }
    if (hasWalletMismatch || hasSmartWalletSignerMismatch) {
      txNotice = "Connect the same signer wallet linked to Clerk and Crossmint before buying.";
      return;
    }
    if (event.onChainEventId === undefined) {
      txNotice = "This event is not linked to an on-chain event ID yet.";
      return;
    }

    txNotice = null;
    purchaseWorkflowId = null;

    try {
      if (event.price > 0) {
        purchaseSyncState = "approving";
        const approveResponse = await createHumanApproveTransaction({
          eventId: event._id,
          signerAddress: walletContext.address,
        });
        activeTransactionId = approveResponse.transaction.id;
        const approveCompleted = await approveAndWaitForHumanTransaction(
          approveResponse.transaction,
        );

        if (approveCompleted.transaction.status !== "success") {
          throw new Error("USDC approval did not complete successfully.");
        }
      }

      purchaseSyncState = "buying";
      const buyResponse = await createHumanBuyTicketTransaction({
        eventId: event._id,
        signerAddress: walletContext.address,
      });
      activeTransactionId = buyResponse.transaction.id;

      const buyCompleted = await approveAndWaitForHumanTransaction(buyResponse.transaction);
      if (buyCompleted.transaction.status !== "success") {
        throw new Error("Ticket purchase did not complete successfully.");
      }

      const txHash = getHumanTransactionHash(buyCompleted.transaction);
      if (!txHash) {
        throw new Error("Crossmint purchase completed without an on-chain transaction hash.");
      }

      purchaseSyncState = "submitting";
      const confirmResponse = await fetch("/api/purchases/confirm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `crossmint:${event._id}:${txHash}:${humanWallet.walletAddress}`,
        },
        body: JSON.stringify({
          eventId: event._id,
          buyerAddress: humanWallet.walletAddress,
          purchasePrice: event.price,
          txHash,
        }),
      });

      const confirmPayload = (await confirmResponse.json()) as {
        ok?: boolean;
        workflowId?: string;
        error?: string;
      };

      if (!confirmResponse.ok || confirmPayload.ok === false) {
        throw new Error(confirmPayload.error ?? "Failed to confirm purchase");
      }

      purchaseWorkflowId = confirmPayload.workflowId ?? null;
      purchaseSyncState = "done";
      activeTransactionId = null;
    } catch (error) {
      purchaseSyncState = "error";
      activeTransactionId = null;
      txNotice = toReadableError(
        error,
        "Crossmint purchase failed before the ticket could be recorded.",
      );
    }
  }
</script>

{#if event === undefined}
  <div class="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-background">
    <p class="font-mono text-muted-foreground">Loading event...</p>
  </div>
{:else if event === null}
  <div class="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-background">
    <p class="font-bold uppercase">Event not found</p>
  </div>
{:else}
  {@const startDate = new Date(event.startTime)}
  {@const endDate = new Date(event.endTime)}
  {@const spotsLeft = event.maxTickets - event.ticketsSold}
  {@const chainLabel = getChainLabel(event.chainKey)}
  {@const usdcAddress = getUsdcAddressForChain(event.chainKey)}

  <main class="container mx-auto max-w-4xl px-4 py-8">
    <a
      class="mb-4 block font-mono text-sm uppercase tracking-wider text-muted-foreground hover:text-primary"
      href={resolve("/events")}
    >
      &larr; Back to events
    </a>

    <div class="grid gap-8 md:grid-cols-3">
      <div class="space-y-6 md:col-span-2">
        <div>
          <div class="mb-2 flex items-center gap-3">
            <Badge variant={event.status === "active" ? "default" : "secondary"}>{event.status}</Badge>
            <Badge variant="outline">{chainLabel}</Badge>
            {#if spotsLeft <= 10 && spotsLeft > 0}
              <Badge variant="destructive">{spotsLeft} spots left!</Badge>
            {/if}
          </div>
          <h1 class="text-3xl font-black uppercase tracking-wide">{event.name}</h1>
        </div>

        <div class="space-y-3 text-sm">
          <div class="flex gap-8">
            <div>
              <p class="text-xs uppercase tracking-wider text-muted-foreground">Start</p>
              <p class="font-mono font-bold">{startDate.toLocaleString()}</p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-wider text-muted-foreground">End</p>
              <p class="font-mono font-bold">{endDate.toLocaleString()}</p>
            </div>
          </div>
          {#if event.location}
            <div>
              <p class="text-xs uppercase tracking-wider text-muted-foreground">Location</p>
              <p class="font-bold">{event.location}</p>
            </div>
          {/if}
        </div>

        <Separator />

        <div>
          <h2 class="mb-2 text-lg font-bold uppercase tracking-wider">About</h2>
          <p class="whitespace-pre-wrap leading-relaxed text-muted-foreground">
            {event.description || "No description provided."}
          </p>
        </div>

        {#if team}
          <Separator />
          <div>
            <h2 class="mb-2 text-lg font-bold uppercase tracking-wider">Organized by</h2>
            <p class="font-bold">{team.name}</p>
            <p class="text-sm text-muted-foreground">{team.description}</p>
          </div>
        {/if}
      </div>

      <div>
        <Card class="sticky top-24">
          <CardHeader>
            <CardTitle>Get Tickets</CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="flex justify-between text-sm">
              <span class="text-xs uppercase tracking-wider text-muted-foreground">Price</span>
              <span class="text-lg font-mono font-black">
                {event.price === 0 ? "Free" : `$${event.price} USDC`}
              </span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-xs uppercase tracking-wider text-muted-foreground">Available</span>
              <span class="font-mono font-bold">{spotsLeft} / {event.maxTickets}</span>
            </div>
            <div class="flex justify-between gap-4 text-sm">
              <span class="text-xs uppercase tracking-wider text-muted-foreground">Chain</span>
              <span class="text-right font-mono">{chainLabel}</span>
            </div>
            <div class="flex justify-between gap-4 text-sm">
              <span class="text-xs uppercase tracking-wider text-muted-foreground">USDC</span>
              <span class="text-right font-mono">
                {usdcAddress.slice(0, 6)}...{usdcAddress.slice(-4)}
              </span>
            </div>

            <Separator />

            {#if !isSignedIn}
              <div class="space-y-2">
                <p class="text-sm text-muted-foreground">
                  Sign in and connect your wallet to buy tickets
                </p>
                <ConnectWallet />
              </div>
            {:else if !walletContext.isConnected}
              <div class="space-y-2">
                <p class="text-sm text-muted-foreground">
                  Connect your signer wallet to {humanWallet
                    ? "approve smart-wallet transactions."
                    : "provision your Crossmint smart wallet."}
                </p>
                <ConnectWallet />
              </div>
            {:else if !humanWallet && !clerkContext.currentUser?.primaryEmailAddress?.emailAddress}
              <div class="space-y-2">
                <Button class="w-full" disabled>Primary email required</Button>
                <p class="text-center font-mono text-xs text-muted-foreground">
                  Add a primary email in Clerk before provisioning your smart wallet.
                </p>
              </div>
            {:else if hasWalletMismatch || hasSmartWalletSignerMismatch}
              <div class="space-y-2">
                <Button class="w-full" disabled>Signer mismatch</Button>
                <p class="text-center font-mono text-xs text-muted-foreground">
                  Connect the same EOA you used for Clerk and your Crossmint wallet.
                </p>
              </div>
            {:else if !humanWallet}
              <div class="space-y-2">
                <Button class="w-full" disabled>Provisioning Smart Wallet...</Button>
                <p class="text-center font-mono text-xs text-muted-foreground">
                  Waiting for Crossmint wallet setup to finish.
                </p>
              </div>
            {:else if spotsLeft === 0}
              <Button class="w-full" disabled>Sold Out</Button>
            {:else if event.status !== "active"}
              <Button class="w-full" disabled>Event Not Active</Button>
            {:else if event.onChainEventId === undefined}
              <Button class="w-full" disabled>Not Deployed On-chain</Button>
            {:else if purchaseSyncState === "approving"}
              <Button class="w-full" disabled>Approving USDC...</Button>
            {:else if purchaseSyncState === "buying"}
              <Button class="w-full" disabled>Buying Ticket...</Button>
            {:else if purchaseSyncState === "submitting"}
              <Button class="w-full" disabled>Finalizing Ticket...</Button>
            {:else if purchaseSyncState === "done"}
              <div class="space-y-2">
                <Button class="w-full" disabled variant="secondary">Ticket Synced</Button>
                <p class="text-center text-xs font-bold text-primary">
                  Ticket purchased on-chain and recorded.
                </p>
                {#if purchaseWorkflowId}
                  <p class="text-center font-mono text-[10px] text-muted-foreground">
                    Workflow: {purchaseWorkflowId}
                  </p>
                {/if}
              </div>
            {:else if purchaseSyncState === "error"}
              <Button class="w-full" onclick={() => void handleBuyWithCrossmint()}>
                Retry Buy Ticket
              </Button>
            {:else}
              <Button class="w-full" onclick={() => void handleBuyWithCrossmint()}>
                {event.price > 0 ? "Buy Ticket" : "Claim Ticket"}
              </Button>
            {/if}

            <p class="text-center font-mono text-xs uppercase tracking-wider text-muted-foreground">
              NFT ticket on {chainLabel} via Crossmint smart wallet
            </p>
            {#if humanWallet?.walletAddress}
              <p class="text-center font-mono text-[10px] text-muted-foreground">
                Smart wallet: {humanWallet.walletAddress.slice(0, 6)}...
                {humanWallet.walletAddress.slice(-4)}
              </p>
            {/if}
            {#if activeTransactionId}
              <p class="text-center font-mono text-[10px] text-muted-foreground">
                Crossmint tx: {activeTransactionId}
              </p>
            {/if}
            {#if txNotice}
              <p
                class={`text-center font-mono text-xs ${
                  txNotice.startsWith("Transaction canceled") ? "text-accent" : "text-destructive"
                }`}
              >
                {txNotice}
              </p>
            {/if}
          </CardContent>
        </Card>
      </div>
    </div>
  </main>
{/if}
