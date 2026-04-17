import type { SupportedChainKey } from "@/lib/chains";

export type CrossmintWalletPurpose = "human_primary" | "automation";

export function getCrossmintChainForAppChain(chainKey: SupportedChainKey) {
  switch (chainKey) {
    case "baseMainnet":
      return "base";
    case "monadTestnet":
    default:
      return "monad-testnet";
  }
}

export function getSupportedChainKeyForCrossmintChain(
  chain: string,
): SupportedChainKey {
  return chain === "base" ? "baseMainnet" : "monadTestnet";
}

export function getHumanWalletAlias(clerkUserId: string, chain: string) {
  return `human:${clerkUserId}:${chain}`;
}

export function getAutomationWalletAlias(clerkUserId: string, chain: string) {
  return `automation:${clerkUserId}:${chain}`;
}

export function getCrossmintAliasLocator(alias: string) {
  return `evm:smart:alias:${alias}`;
}

export function getExternalWalletSignerLocator(address: string) {
  return `external-wallet:${address.toLowerCase()}`;
}

export function getServerSignerLocator(address: string) {
  return `server:${address.toLowerCase()}`;
}

export function getCrossmintTransactionHash(transaction: {
  onChain?: {
    txId?: string;
    proxiedTxId?: string;
    userOperationHash?: string;
  };
}) {
  return (
    transaction.onChain?.txId ??
    transaction.onChain?.proxiedTxId ??
    transaction.onChain?.userOperationHash ??
    undefined
  );
}
