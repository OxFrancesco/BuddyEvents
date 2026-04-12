import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type AnyCtx = MutationCtx | QueryCtx;

export function normalizeAddress(address: string | null | undefined) {
  return address?.trim().toLowerCase();
}

export function isSameAddress(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const normalizedA = normalizeAddress(a);
  const normalizedB = normalizeAddress(b);
  return !!normalizedA && normalizedA === normalizedB;
}

export async function listUserWallets(ctx: AnyCtx, userId: Doc<"users">["_id"]) {
  return await ctx.db
    .query("wallets")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
}

export async function listOwnedWalletAddresses(
  ctx: AnyCtx,
  user: Doc<"users">,
): Promise<string[]> {
  const wallets = await listUserWallets(ctx, user._id);
  const addresses = new Map<string, string>();

  if (user.walletAddress) {
    addresses.set(normalizeAddress(user.walletAddress)!, user.walletAddress);
  }

  for (const wallet of wallets) {
    const normalized = normalizeAddress(wallet.walletAddress);
    if (normalized) {
      addresses.set(normalized, wallet.walletAddress);
    }
  }

  return Array.from(addresses.values());
}

export async function userOwnsAddress(
  ctx: AnyCtx,
  user: Doc<"users">,
  address: string,
): Promise<boolean> {
  const target = normalizeAddress(address);
  if (!target) return false;

  const ownedAddresses = await listOwnedWalletAddresses(ctx, user);
  return ownedAddresses.some((candidate) => normalizeAddress(candidate) === target);
}

export async function resolveUserByAnyWalletAddress(
  ctx: AnyCtx,
  walletAddress: string,
): Promise<Doc<"users"> | null> {
  const normalizedTarget = normalizeAddress(walletAddress);
  if (!normalizedTarget) return null;

  const exactUser = await ctx.db
    .query("users")
    .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
    .unique();
  if (exactUser) return exactUser;

  const exactWallet = await ctx.db
    .query("wallets")
    .withIndex("by_wallet_address", (q) => q.eq("walletAddress", walletAddress))
    .unique();
  if (exactWallet?.userId) {
    return await ctx.db.get(exactWallet.userId);
  }

  const users = await ctx.db.query("users").collect();
  const matchedUser = users.find((user) =>
    isSameAddress(user.walletAddress, normalizedTarget),
  );
  if (matchedUser) return matchedUser;

  const wallets = await ctx.db.query("wallets").collect();
  const matchedWallet = wallets.find((wallet) =>
    isSameAddress(wallet.walletAddress, normalizedTarget),
  );
  if (!matchedWallet?.userId) return null;

  return await ctx.db.get(matchedWallet.userId);
}
