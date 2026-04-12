import type { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type MinimalUser = {
  _id: Id<"users">;
  walletAddress?: string | null;
};

export function sameAddress(a?: string | null, b?: string | null) {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export async function listOwnedAddressesForUser(args: {
  convex: ConvexHttpClient;
  user: MinimalUser;
  serviceToken: string;
}) {
  const wallets = await args.convex.query(api.wallets.listByUser, {
    userId: args.user._id,
    serviceToken: args.serviceToken,
  });

  const addresses = new Map<string, string>();
  if (args.user.walletAddress) {
    addresses.set(args.user.walletAddress.toLowerCase(), args.user.walletAddress);
  }
  for (const wallet of wallets) {
    addresses.set(wallet.walletAddress.toLowerCase(), wallet.walletAddress);
  }
  return Array.from(addresses.values());
}

export async function userOwnsAddress(args: {
  convex: ConvexHttpClient;
  user: MinimalUser;
  address: string;
  serviceToken: string;
}) {
  const addresses = await listOwnedAddressesForUser(args);
  return addresses.some((candidate) => sameAddress(candidate, args.address));
}
