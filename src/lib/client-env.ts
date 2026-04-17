import { env } from "$env/dynamic/public";

export const CLERK_PUBLISHABLE_KEY = env.PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
export const CROSSMINT_CLIENT_API_KEY =
  env.PUBLIC_CROSSMINT_CLIENT_API_KEY ?? "";
export const ENABLE_CROSSMINT_HUMAN_WALLET =
  env.PUBLIC_ENABLE_CROSSMINT_HUMAN_WALLET === "true";
export const TELEGRAM_MINIAPP_URL = env.PUBLIC_TELEGRAM_MINIAPP_URL ?? "";
export const APP_URL = env.PUBLIC_APP_URL ?? "";
export const WC_PROJECT_ID = env.PUBLIC_WC_PROJECT_ID || "demo";
