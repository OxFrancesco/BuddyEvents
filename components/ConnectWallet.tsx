/// components/ConnectWallet.tsx — Wallet connect button for supported chains
"use client";

import { useState, useSyncExternalStore } from "react";
import { useQuery } from "convex/react";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { getClerkWeb3WalletAddress } from "@/lib/clerkWeb3";
import { provisionHumanWallet } from "@/lib/crossmint/client";
import { sameAddress } from "@/lib/walletOwnership";

function WalletBadge({
  address,
  label,
  showUserButton = false,
}: {
  address: string;
  label: string;
  showUserButton?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group flex items-center gap-2 border-2 border-foreground bg-muted px-2 py-1 text-xs font-mono font-bold shadow-[2px_2px_0px_var(--foreground)] transition-all hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]">
      {showUserButton ? <UserButton /> : null}
      <button onClick={handleCopy} className="flex items-center gap-2">
        <span className="uppercase text-[10px] tracking-wider text-muted-foreground">
          {label}
        </span>
        <span>{address.slice(0, 6)}...{address.slice(-4)}</span>
        {copied ? (
          <Check className="size-3 text-green-600" />
        ) : (
          <Copy className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </button>
    </div>
  );
}

export function ConnectWallet() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const { isLoaded, isSignedIn, user } = useUser();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const me = useQuery(api.users.me, {});
  const humanWallet = useQuery(
    api.wallets.getByUserAndPurpose,
    me ? { userId: me._id, purpose: "human_primary" } : "skip",
  );
  const [provisioning, setProvisioning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const clerkWalletAddress = getClerkWeb3WalletAddress(user);
  const hasWalletMismatch =
    !!address &&
    !!clerkWalletAddress &&
    !sameAddress(address, clerkWalletAddress);
  const hasEmail = !!user?.primaryEmailAddress?.emailAddress;

  const handleProvision = async (forceRelink = false) => {
    if (!address) {
      return;
    }

    setProvisioning(true);
    setMessage(null);
    try {
      await provisionHumanWallet({
        signerAddress: address,
        forceRelink,
      });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Smart wallet provisioning failed",
      );
    } finally {
      setProvisioning(false);
    }
  };

  if (!mounted || !isLoaded) {
    return (
      <Button variant="outline" size="sm" disabled>
        Loading...
      </Button>
    );
  }

  if (!isSignedIn) {
    return (
      <SignInButton mode="modal">
        <Button variant="outline" size="sm">
          Sign In
        </Button>
      </SignInButton>
    );
  }

  if (humanWallet) {
    const needsRelink =
      !!address &&
      !!humanWallet.linkedSignerAddress &&
      !sameAddress(address, humanWallet.linkedSignerAddress);

    return (
      <div className="flex items-center gap-2">
        <WalletBadge
          address={humanWallet.walletAddress}
          label="Smart"
          showUserButton
        />
        {(humanWallet.linkedSignerAddress ?? address) ? (
          <WalletBadge
            address={humanWallet.linkedSignerAddress ?? address!}
            label="Signer"
          />
        ) : null}
        {needsRelink ? (
          <Button
            variant="outline"
            size="sm"
            disabled={provisioning || !address}
            onClick={() => {
              if (
                !window.confirm(
                  "Relink this Crossmint wallet to the currently connected signer?",
                )
              ) {
                return;
              }
              void handleProvision(true);
            }}
          >
            {provisioning ? "Relinking..." : "Relink"}
          </Button>
        ) : null}
        {message ? (
          <span className="max-w-52 text-[10px] font-mono text-destructive">
            {message}
          </span>
        ) : null}
      </div>
    );
  }

  if (!isConnected || !address) {
    return (
      <div className="flex gap-2">
        {connectors.length === 0 ? (
          <Button
            variant="outline"
            size="sm"
            disabled
          >
            Wallet connector unavailable
          </Button>
        ) : (
          connectors.map((connector) => (
            <Button
              key={connector.uid}
              variant="outline"
              size="sm"
              onClick={() => connect({ connector })}
              disabled={isPending}
            >
              {isPending ? "Connecting..." : connector.name || "Connect Wallet"}
            </Button>
          ))
        )}
      </div>
    );
  }

  if (hasWalletMismatch) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => disconnect()}>
          Wallet Mismatch
        </Button>
        <span className="max-w-52 text-[10px] font-mono text-destructive">
          Connect the same wallet used in Clerk before provisioning Crossmint.
        </span>
      </div>
    );
  }

  if (!hasEmail) {
    return (
      <div className="flex items-center gap-2">
        <WalletBadge address={address} label="Signer" showUserButton />
        <span className="max-w-48 text-[10px] font-mono text-muted-foreground">
          Add a primary email in Clerk to finish smart-wallet setup.
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <WalletBadge address={address} label="Signer" showUserButton />
      <Button
        variant="outline"
        size="sm"
        disabled={provisioning}
        onClick={() => void handleProvision()}
      >
        {provisioning ? "Provisioning..." : "Create Smart Wallet"}
      </Button>
      {message ? (
        <span className="max-w-52 text-[10px] font-mono text-destructive">
          {message}
        </span>
      ) : null}
    </div>
  );
}
