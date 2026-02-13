"use client";

import { Button } from "@/components/ui/button";

export function MonadFaucetButton() {
  return (
    <Button asChild variant="ghost" size="sm">
      <a href="https://faucet.monad.xyz" target="_blank" rel="noreferrer">
        Monad Faucet
      </a>
    </Button>
  );
}
