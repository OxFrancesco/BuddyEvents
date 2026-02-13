/// components/ConnectWallet.tsx — Wallet connect button for Monad
"use client";

import { useSyncExternalStore } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export function ConnectWallet() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  // Keep SSR and initial client render identical to avoid hydration mismatch.
  if (!mounted) {
    return (
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled>
          Connect Wallet
        </Button>
      </div>
    );
  }

  if (isConnected && address) {
    return (
      <SignedIn>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
          <Button variant="outline" size="sm" onClick={() => disconnect()}>
            Disconnect
          </Button>
        </div>
      </SignedIn>
    );
  }

  return (
    <>
      <SignedOut>
        <SignInButton mode="modal">
          <Button variant="outline" size="sm">
            Sign In
          </Button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <div className="flex gap-2">
          {connectors.map((connector) => (
            <Button
              key={connector.uid}
              variant="outline"
              size="sm"
              onClick={() => connect({ connector })}
            >
              {connector.name === "Injected" ? "Connect Wallet" : connector.name}
            </Button>
          ))}
        </div>
      </SignedIn>
    </>
  );
}
