import { createClerkClient } from "@clerk/backend";
import { requireServerEnv, serverEnv } from "../env";

let clerkClientSingleton: ReturnType<typeof createClerkClient> | null = null;

export const getClerkClient = () => {
  if (clerkClientSingleton) {
    return clerkClientSingleton;
  }

  const secretKey = requireServerEnv(
    "CLERK_SECRET_KEY",
    serverEnv.clerkSecretKey,
  );
  const publishableKey = requireServerEnv(
    "PUBLIC_CLERK_PUBLISHABLE_KEY",
    serverEnv.clerkPublishableKey,
  );

  clerkClientSingleton = createClerkClient({
    secretKey,
    publishableKey,
  });

  return clerkClientSingleton;
};
