/// components/ConnectWallet.tsx — Wallet connect button for Monad
"use client";

import { useState, useSyncExternalStore } from "react";
import { useAccount, useConnect } from "wagmi";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

function WalletBadge({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group flex items-center gap-2 border-2 border-foreground bg-muted px-2 py-1 text-xs font-mono font-bold shadow-[2px_2px_0px_var(--foreground)] transition-all hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]">
      <UserButton />
      <button onClick={handleCopy} className="flex items-center gap-2">
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
  const { isLoaded, isSignedIn } = useUser();
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const walletConnectors = connectors.filter((connector) => connector.type === "walletConnect");

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

  if (isConnected && address) {
    return <WalletBadge address={address} />;
  }

  return (
    <div className="flex gap-2">
      {walletConnectors.length === 0 ? (
        <Button variant="outline" size="sm" disabled>
          Wallet connector unavailable
        </Button>
      ) : (
        walletConnectors.map((connector) => (
          <Button
            key={connector.uid}
            variant="outline"
            size="sm"
            onClick={() => connect({ connector })}
          >
            Connect Wallet
          </Button>
        ))
      )}
    </div>
  );
}
