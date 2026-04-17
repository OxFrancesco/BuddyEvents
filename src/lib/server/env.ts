const readEnv = (...keys: Array<string | undefined>) => {
  for (const key of keys) {
    if (!key) continue;
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
};

export const serverEnv = {
  appUrl:
    readEnv("PUBLIC_APP_URL", "NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000",
  clerkPublishableKey: readEnv(
    "PUBLIC_CLERK_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  ),
  clerkSecretKey: readEnv("CLERK_SECRET_KEY"),
  convexServiceToken: readEnv("CONVEX_SERVICE_TOKEN"),
  convexUrl: readEnv("PUBLIC_CONVEX_URL", "NEXT_PUBLIC_CONVEX_URL"),
  telegramMiniAppUrl: readEnv(
    "PUBLIC_TELEGRAM_MINIAPP_URL",
    "NEXT_PUBLIC_TELEGRAM_MINIAPP_URL",
  ),
} as const;

export const requireServerEnv = (label: string, value: string | undefined) => {
  if (!value) {
    throw new Error(`${label} is not set`);
  }
  return value;
};
