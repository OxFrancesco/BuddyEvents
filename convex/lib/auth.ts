import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

type AnyCtx = QueryCtx | MutationCtx;

export async function requireIdentity(ctx: AnyCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Authentication required");
  }
  return identity;
}

export async function requireSignedInUser(ctx: AnyCtx) {
  const identity = await requireIdentity(ctx);
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();

  if (!user) {
    throw new Error("User profile not found. Call users.upsertMe first.");
  }

  return user;
}

export async function requireAdmin(ctx: AnyCtx) {
  const user = await requireSignedInUser(ctx);
  if (user.role !== "admin") {
    throw new Error("Admin access required");
  }
  return user;
}

function hasValidServiceToken(serviceToken?: string): boolean {
  const expected = process.env.CONVEX_SERVICE_TOKEN;
  if (!expected || !serviceToken) return false;
  return serviceToken === expected;
}

function requireServiceToken(serviceToken?: string): void {
  const expected = process.env.CONVEX_SERVICE_TOKEN;
  if (!expected) {
    throw new Error("CONVEX_SERVICE_TOKEN is not configured");
  }
  if (serviceToken !== expected) {
    throw new Error("Unauthorized service access");
  }
}

export async function requireSignedInUserOrService(
  ctx: AnyCtx,
  serviceToken?: string,
): Promise<Doc<"users"> | null> {
  if (hasValidServiceToken(serviceToken)) return null;
  return await requireSignedInUser(ctx);
}

export async function requireAdminOrService(
  ctx: AnyCtx,
  serviceToken?: string,
): Promise<Doc<"users"> | null> {
  if (hasValidServiceToken(serviceToken)) return null;
  return await requireAdmin(ctx);
}

export function requireServiceAccess(serviceToken?: string): void {
  requireServiceToken(serviceToken);
}
