import type { UserResource } from "@clerk/types";

export function getClerkWeb3WalletAddress(
  user: Pick<UserResource, "primaryWeb3Wallet" | "verifiedWeb3Wallets"> | null | undefined,
) {
  return (
    user?.primaryWeb3Wallet?.web3Wallet ??
    user?.verifiedWeb3Wallets?.[0]?.web3Wallet ??
    undefined
  );
}
