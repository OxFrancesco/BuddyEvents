/// app/events/[id]/page.tsx — Event detail + buy ticket page
"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { useAccount, useSignMessage } from "wagmi";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ConnectWallet } from "@/components/ConnectWallet";
import { Header } from "@/components/Header";
import { getClerkWeb3WalletAddress } from "@/lib/clerkWeb3";
import {
  approveHumanTransaction,
  createHumanApproveTransaction,
  createHumanBuyTicketTransaction,
  getHumanTransactionHash,
  waitForHumanTransaction,
} from "@/lib/crossmint/client";
import {
  getChainLabel,
  getUsdcAddressForChain,
} from "@/lib/chains";
import { getExternalWalletSignerLocator } from "@/lib/crossmint/shared";
import { sameAddress } from "@/lib/walletOwnership";

function isUserRejectedError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const normalized = message.toLowerCase();
  return (
    normalized.includes("user rejected") ||
    normalized.includes("rejected the request") ||
    normalized.includes("4001")
  );
}

function toReadableError(error: unknown, fallback: string): string {
  if (isUserRejectedError(error)) {
    return "Transaction canceled in wallet. Click Buy Ticket and approve to continue.";
  }
  return error instanceof Error ? error.message : fallback;
}

export default function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const event = useQuery(api.events.get, { id: id as Id<"events"> });
  const team = useQuery(
    api.teams.get,
    event && event.teamId ? { id: event.teamId } : "skip",
  );
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { isSignedIn, user } = useUser();
  const me = useQuery(api.users.me, {});
  const humanWallet = useQuery(
    api.wallets.getByUserAndPurpose,
    me ? { userId: me._id, purpose: "human_primary" } : "skip",
  );
  const [txNotice, setTxNotice] = useState<string | null>(null);
  const [purchaseSyncState, setPurchaseSyncState] = useState<
    "idle" | "approving" | "buying" | "submitting" | "done" | "error"
  >("idle");
  const [purchaseWorkflowId, setPurchaseWorkflowId] = useState<string | null>(null);
  const [activeTransactionId, setActiveTransactionId] = useState<string | null>(null);
  const resolvedEventId = event?._id;
  const resolvedEventPrice = event?.price ?? 0;

  if (event === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground font-mono">Loading event...</p>
      </div>
    );
  }
  if (event === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="font-bold uppercase">Event not found</p>
      </div>
    );
  }

  const startDate = new Date(event.startTime);
  const endDate = new Date(event.endTime);
  const spotsLeft = event.maxTickets - event.ticketsSold;
  const chainLabel = getChainLabel(event.chainKey);
  const usdcAddress = getUsdcAddressForChain(event.chainKey);
  const clerkWalletAddress = getClerkWeb3WalletAddress(user);
  const hasWalletMismatch =
    !!address &&
    !!clerkWalletAddress &&
    !sameAddress(address, clerkWalletAddress);
  const hasSmartWalletSignerMismatch =
    !!address &&
    !!humanWallet?.linkedSignerAddress &&
    !sameAddress(address, humanWallet.linkedSignerAddress);

  async function approveAndWaitForHumanTransaction(transaction: {
    id: string;
    status: "awaiting-approval" | "pending" | "failed" | "success";
    approvals?: {
      pending: Array<{
        signer: {
          locator: string;
        };
        message: string;
      }>;
    };
  }) {
    if (!address) {
      throw new Error("Connect your signer wallet first");
    }

    if (transaction.status === "awaiting-approval") {
      const pendingApproval =
        transaction.approvals?.pending.find(
          (approval) =>
            approval.signer.locator.toLowerCase() ===
            getExternalWalletSignerLocator(address).toLowerCase(),
        ) ?? transaction.approvals?.pending[0];

      if (!pendingApproval) {
        throw new Error("Crossmint transaction is awaiting approval, but no signature request was returned.");
      }

      const signature = await signMessageAsync({
        message: pendingApproval.message,
      });

      await approveHumanTransaction({
        transactionId: transaction.id,
        signerAddress: address,
        signature,
      });
    }

    return await waitForHumanTransaction(transaction.id);
  }

  const handleBuyWithCrossmint = async () => {
    if (!address || !isConnected || !isSignedIn || !resolvedEventId) {
      return;
    }
    if (!humanWallet) {
      setTxNotice("Your Crossmint smart wallet is still provisioning.");
      return;
    }
    if (!user?.primaryEmailAddress?.emailAddress) {
      setTxNotice("Add a primary email in Clerk before buying with your smart wallet.");
      return;
    }
    if (hasWalletMismatch || hasSmartWalletSignerMismatch) {
      setTxNotice("Connect the same signer wallet linked to Clerk and Crossmint before buying.");
      return;
    }
    if (event.onChainEventId === undefined) {
      setTxNotice("This event is not linked to an on-chain event ID yet.");
      return;
    }

    setTxNotice(null);
    setPurchaseWorkflowId(null);

    try {
      if (event.price > 0) {
        setPurchaseSyncState("approving");
        const approveResponse = await createHumanApproveTransaction({
          eventId: resolvedEventId,
          signerAddress: address,
        });
        setActiveTransactionId(approveResponse.transaction.id);
        const approveCompleted = await approveAndWaitForHumanTransaction(
          approveResponse.transaction,
        );
        if (approveCompleted.transaction.status !== "success") {
          throw new Error("USDC approval did not complete successfully.");
        }
      }

      setPurchaseSyncState("buying");
      const buyResponse = await createHumanBuyTicketTransaction({
        eventId: resolvedEventId,
        signerAddress: address,
      });
      setActiveTransactionId(buyResponse.transaction.id);
      const buyCompleted = await approveAndWaitForHumanTransaction(
        buyResponse.transaction,
      );

      if (buyCompleted.transaction.status !== "success") {
        throw new Error("Ticket purchase did not complete successfully.");
      }

      const txHash = getHumanTransactionHash(buyCompleted.transaction);
      if (!txHash) {
        throw new Error("Crossmint purchase completed without an on-chain transaction hash.");
      }

      setPurchaseSyncState("submitting");
      const confirmResponse = await fetch("/api/purchases/confirm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `crossmint:${resolvedEventId}:${txHash}:${humanWallet.walletAddress}`,
        },
        body: JSON.stringify({
          eventId: resolvedEventId,
          buyerAddress: humanWallet.walletAddress,
          purchasePrice: resolvedEventPrice,
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

      setPurchaseWorkflowId(confirmPayload.workflowId ?? null);
      setPurchaseSyncState("done");
      setActiveTransactionId(null);
    } catch (error) {
      setPurchaseSyncState("error");
      setActiveTransactionId(null);
      setTxNotice(
        toReadableError(
          error,
          "Crossmint purchase failed before the ticket could be recorded.",
        ),
      );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Link href="/events" className="text-sm text-muted-foreground hover:text-primary font-mono uppercase tracking-wider mb-4 block">
          &larr; Back to events
        </Link>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Badge variant={event.status === "active" ? "default" : "secondary"}>
                  {event.status}
                </Badge>
                <Badge variant="outline">{chainLabel}</Badge>
                {spotsLeft <= 10 && spotsLeft > 0 && (
                  <Badge variant="destructive">{spotsLeft} spots left!</Badge>
                )}
              </div>
              <h1 className="text-3xl font-black uppercase tracking-wide">{event.name}</h1>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex gap-8">
                <div>
                  <p className="text-muted-foreground uppercase text-xs tracking-wider">Start</p>
                  <p className="font-mono font-bold">{startDate.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground uppercase text-xs tracking-wider">End</p>
                  <p className="font-mono font-bold">{endDate.toLocaleString()}</p>
                </div>
              </div>
              {event.location && (
                <div>
                  <p className="text-muted-foreground uppercase text-xs tracking-wider">Location</p>
                  <p className="font-bold">{event.location}</p>
                </div>
              )}
            </div>

            <Separator />

            <div>
              <h2 className="text-lg font-bold uppercase tracking-wider mb-2">About</h2>
              <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {event.description || "No description provided."}
              </p>
            </div>

            {team && (
              <>
                <Separator />
                <div>
                  <h2 className="text-lg font-bold uppercase tracking-wider mb-2">Organized by</h2>
                  <p className="font-bold">{team.name}</p>
                  <p className="text-sm text-muted-foreground">{team.description}</p>
                </div>
              </>
            )}
          </div>

          <div>
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle>Get Tickets</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground uppercase text-xs tracking-wider">Price</span>
                  <span className="font-mono font-black text-lg">
                    {event.price === 0 ? "Free" : `$${event.price} USDC`}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground uppercase text-xs tracking-wider">Available</span>
                  <span className="font-mono font-bold">{spotsLeft} / {event.maxTickets}</span>
                </div>
                <div className="flex justify-between gap-4 text-sm">
                  <span className="text-muted-foreground uppercase text-xs tracking-wider">Chain</span>
                  <span className="font-mono text-right">{chainLabel}</span>
                </div>
                <div className="flex justify-between gap-4 text-sm">
                  <span className="text-muted-foreground uppercase text-xs tracking-wider">USDC</span>
                  <span className="font-mono text-right">
                    {usdcAddress.slice(0, 6)}...{usdcAddress.slice(-4)}
                  </span>
                </div>

                <Separator />

                {!isSignedIn ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Sign in and connect your wallet to buy tickets
                    </p>
                    <ConnectWallet />
                  </div>
                ) : !isConnected ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Connect your signer wallet to {humanWallet ? "approve smart-wallet transactions." : "provision your Crossmint smart wallet."}
                    </p>
                    <ConnectWallet />
                  </div>
                ) : !humanWallet && !user?.primaryEmailAddress?.emailAddress ? (
                  <div className="space-y-2">
                    <Button disabled className="w-full">Primary email required</Button>
                    <p className="text-xs text-muted-foreground text-center font-mono">
                      Add a primary email in Clerk before provisioning your smart wallet.
                    </p>
                  </div>
                ) : hasWalletMismatch || hasSmartWalletSignerMismatch ? (
                  <div className="space-y-2">
                    <Button disabled className="w-full">Signer mismatch</Button>
                    <p className="text-xs text-muted-foreground text-center font-mono">
                      Connect the same EOA you used for Clerk and your Crossmint wallet.
                    </p>
                  </div>
                ) : !humanWallet ? (
                  <div className="space-y-2">
                    <Button disabled className="w-full">Provisioning Smart Wallet...</Button>
                    <p className="text-xs text-muted-foreground text-center font-mono">
                      Waiting for Crossmint wallet setup to finish.
                    </p>
                  </div>
                ) : spotsLeft === 0 ? (
                  <Button disabled className="w-full">Sold Out</Button>
                ) : event.status !== "active" ? (
                  <Button disabled className="w-full">Event Not Active</Button>
                ) : event.onChainEventId === undefined ? (
                  <Button disabled className="w-full">Not Deployed On-chain</Button>
                ) : purchaseSyncState === "approving" ? (
                  <Button disabled className="w-full">Approving USDC...</Button>
                ) : purchaseSyncState === "buying" ? (
                  <Button disabled className="w-full">Buying Ticket...</Button>
                ) : purchaseSyncState === "submitting" ? (
                  <Button disabled className="w-full">Finalizing Ticket...</Button>
                ) : purchaseSyncState === "done" ? (
                  <div className="space-y-2">
                    <Button disabled variant="secondary" className="w-full">
                      Ticket Synced
                    </Button>
                    <p className="text-xs text-center text-primary font-bold">
                      Ticket purchased on-chain and recorded.
                    </p>
                    {purchaseWorkflowId ? (
                      <p className="text-[10px] text-center text-muted-foreground font-mono">
                        Workflow: {purchaseWorkflowId}
                      </p>
                    ) : null}
                  </div>
                ) : purchaseSyncState === "error" ? (
                  <Button onClick={handleBuyWithCrossmint} className="w-full">
                    Retry Buy Ticket
                  </Button>
                ) : (
                  <Button onClick={handleBuyWithCrossmint} className="w-full">
                    {event.price > 0 ? "Buy Ticket" : "Claim Ticket"}
                  </Button>
                )}

                <p className="text-xs text-muted-foreground text-center font-mono uppercase tracking-wider">
                  NFT ticket on {chainLabel} via Crossmint smart wallet
                </p>
                {humanWallet?.walletAddress ? (
                  <p className="text-[10px] text-center text-muted-foreground font-mono">
                    Smart wallet: {humanWallet.walletAddress.slice(0, 6)}...
                    {humanWallet.walletAddress.slice(-4)}
                  </p>
                ) : null}
                {activeTransactionId ? (
                  <p className="text-[10px] text-center text-muted-foreground font-mono">
                    Crossmint tx: {activeTransactionId}
                  </p>
                ) : null}
                {txNotice && (
                  <p
                    className={`text-xs text-center font-mono ${
                      txNotice.startsWith("Transaction canceled")
                        ? "text-accent"
                        : "text-destructive"
                    }`}
                  >
                    {txNotice}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
