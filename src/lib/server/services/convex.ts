import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { requireServerEnv, serverEnv } from "../env";
import { getClerkClient } from "./clerk";

const getConvexUrl = () =>
  requireServerEnv("PUBLIC_CONVEX_URL", serverEnv.convexUrl);

const getRequiredConvexServiceToken = () =>
  requireServerEnv("CONVEX_SERVICE_TOKEN", serverEnv.convexServiceToken);

export const getConvexClient = () => new ConvexHttpClient(getConvexUrl());

export const getConvexServiceToken = () => getRequiredConvexServiceToken();

export async function getUserByClerkId(clerkUserId: string) {
  const convex = getConvexClient();
  const convexServiceToken = getRequiredConvexServiceToken();
  return convex.query(api.users.getByClerkId, {
    clerkId: clerkUserId,
    serviceToken: convexServiceToken,
  });
}

export async function ensureUserByClerkId(clerkUserId: string) {
  const convex = getConvexClient();
  const convexServiceToken = getRequiredConvexServiceToken();

  let user = await convex.query(api.users.getByClerkId, {
    clerkId: clerkUserId,
    serviceToken: convexServiceToken,
  });

  if (user) {
    return user;
  }

  const clerkUser = await getClerkClient().users.getUser(clerkUserId);
  const createdId = await convex.mutation(api.users.upsertByClerkId, {
    clerkId: clerkUserId,
    email: clerkUser.primaryEmailAddress?.emailAddress,
    serviceToken: convexServiceToken,
  });

  user = await convex.query(api.users.getById, {
    userId: createdId,
    serviceToken: convexServiceToken,
  });

  if (!user) {
    throw new Error("Failed to create user profile");
  }

  return user;
}
