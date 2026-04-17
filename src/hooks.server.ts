import type { Handle } from "@sveltejs/kit";
import { getClerkClient } from "$lib/server/services/clerk";

export const handle: Handle = async ({ event, resolve }) => {
  const clerkClient = getClerkClient();
  const state = await clerkClient.authenticateRequest(event.request);
  const auth = state.status === "handshake" ? null : state.toAuth();

  event.locals.clerk = {
    auth,
    client: clerkClient,
    headers: state.headers,
    isAuthenticated: Boolean(auth?.isAuthenticated),
    sessionId: auth?.sessionId ?? null,
    userId: auth?.userId ?? null,
  };

  const response = await resolve(event);

  for (const [key, value] of state.headers.entries()) {
    response.headers.set(key, value);
  }

  return response;
};
