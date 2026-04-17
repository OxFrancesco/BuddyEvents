import type { RequestEvent } from "@sveltejs/kit";
import { getClerkClient } from "./services/clerk";

export const getRequestAuth = (event: RequestEvent) => event.locals.clerk;

export const requireRequestUserId = (event: RequestEvent) => {
  const userId = event.locals.clerk.userId;
  if (!userId) {
    throw new Error("Unauthorized");
  }
  return userId;
};

export { getClerkClient };
