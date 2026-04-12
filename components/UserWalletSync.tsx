"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { useAccount } from "wagmi";
import { api } from "@/convex/_generated/api";
import { getClerkWeb3WalletAddress } from "@/lib/clerkWeb3";
import { provisionHumanWallet } from "@/lib/crossmint/client";
import { sameAddress } from "@/lib/walletOwnership";

export function UserWalletSync() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { address, isConnected } = useAccount();
  const me = useQuery(api.users.me, {});
  const humanWallet = useQuery(
    api.wallets.getByUserAndPurpose,
    me ? { userId: me._id, purpose: "human_primary" } : "skip",
  );
  const upsertMe = useMutation(api.users.upsertMe);
  const setExternalWalletAddress = useMutation(api.users.setExternalWalletAddress);

  const lastProfileSyncRef = useRef<string | null>(null);
  const lastWalletSyncRef = useRef<string | null>(null);
  const lastProvisionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      lastProfileSyncRef.current = null;
      lastWalletSyncRef.current = null;
      lastProvisionRef.current = null;
      return;
    }

    const profileKey = user?.id ?? "signed-in";
    if (lastProfileSyncRef.current === profileKey) {
      return;
    }

    lastProfileSyncRef.current = profileKey;
    void upsertMe({});
  }, [isLoaded, isSignedIn, upsertMe, user?.id]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !me) {
      return;
    }

    const externalWalletKey = address?.toLowerCase() ?? "none";
    if (lastWalletSyncRef.current === externalWalletKey) {
      return;
    }

    lastWalletSyncRef.current = externalWalletKey;
    void setExternalWalletAddress({ walletAddress: address ?? undefined });
  }, [address, isLoaded, isSignedIn, me, setExternalWalletAddress]);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ENABLE_CROSSMINT_HUMAN_WALLET !== "true") {
      return;
    }
    if (!isLoaded || !isSignedIn || !me || !isConnected || !address) {
      return;
    }
    if (humanWallet) {
      return;
    }

    const primaryEmail = user?.primaryEmailAddress?.emailAddress;
    if (!primaryEmail) {
      return;
    }

    const clerkWalletAddress = getClerkWeb3WalletAddress(user);
    if (clerkWalletAddress && !sameAddress(clerkWalletAddress, address)) {
      return;
    }

    const provisionKey = `${me._id}:${address.toLowerCase()}`;
    if (lastProvisionRef.current === provisionKey) {
      return;
    }

    lastProvisionRef.current = provisionKey;
    void provisionHumanWallet({ signerAddress: address }).catch(() => {
      lastProvisionRef.current = null;
    });
  }, [address, humanWallet, isConnected, isLoaded, isSignedIn, me, user]);

  return null;
}
