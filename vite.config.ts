import devtoolsJson from "vite-plugin-devtools-json";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import path from "node:path";
import { convexLocal } from "convex-vite-plugin";
import { defineConfig, loadEnv, type PluginOption } from "vite";

const workspaceRoot = path.resolve(process.cwd());
const convexProjectDir = workspaceRoot;
const convexFunctionsDir = "convex";
const localConvexPort = 3210;
const localConvexSiteProxyPort = 3211;
const localConvexUrl = `http://localhost:${localConvexPort}`;
const localConvexSiteUrl = `http://localhost:${localConvexSiteProxyPort}`;

const CLIENT_ENV_ALIASES = {
  PUBLIC_APP_URL: "NEXT_PUBLIC_APP_URL",
  PUBLIC_BASE_RPC: "NEXT_PUBLIC_BASE_RPC",
  PUBLIC_CLERK_PUBLISHABLE_KEY: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  PUBLIC_CONVEX_URL: "NEXT_PUBLIC_CONVEX_URL",
  PUBLIC_CROSSMINT_CLIENT_API_KEY: "NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY",
  PUBLIC_ENABLE_CROSSMINT_HUMAN_WALLET:
    "NEXT_PUBLIC_ENABLE_CROSSMINT_HUMAN_WALLET",
  PUBLIC_MONAD_RPC: "NEXT_PUBLIC_MONAD_RPC",
  PUBLIC_TELEGRAM_MINIAPP_URL: "NEXT_PUBLIC_TELEGRAM_MINIAPP_URL",
  PUBLIC_WC_PROJECT_ID: "NEXT_PUBLIC_WC_PROJECT_ID",
} as const;

const LOCAL_CONVEX_ENV_KEYS = [
  "CLERK_SECRET_KEY",
  "CLERK_JWT_ISSUER_DOMAIN",
  "CONVEX_PRIVATE_BRIDGE_KEY",
] as const;

const getEnvValue = (loadedEnv: Record<string, string>, key: string) =>
  process.env[key] ?? loadedEnv[key];

const hydratePublicEnvAliases = (loadedEnv: Record<string, string>) => {
  for (const [publicKey, legacyKey] of Object.entries(CLIENT_ENV_ALIASES)) {
    const existingValue = getEnvValue(loadedEnv, publicKey);
    if (existingValue) {
      process.env[publicKey] = existingValue;
      continue;
    }
    const legacyValue = getEnvValue(loadedEnv, legacyKey);
    if (legacyValue) {
      process.env[publicKey] = legacyValue;
    }
  }
};

const getLocalConvexEnvVars = (loadedEnv: Record<string, string>) =>
  Object.fromEntries(
    LOCAL_CONVEX_ENV_KEYS.map((key) => [
      key,
      getEnvValue(loadedEnv, key),
    ]).filter(([, value]) => typeof value === "string" && value.length > 0),
  );

export default defineConfig(({ mode }) => {
  const loadedEnv = loadEnv(mode, workspaceRoot, "");
  const useLocalConvex = getEnvValue(loadedEnv, "USE_LOCAL_CONVEX") === "true";
  const resetLocalBackend =
    getEnvValue(loadedEnv, "RESET_LOCAL_BACKEND") === "true";

  hydratePublicEnvAliases(loadedEnv);

  if (useLocalConvex) {
    process.env.PUBLIC_CONVEX_URL = localConvexUrl;
    process.env.PUBLIC_CONVEX_SITE_URL = localConvexSiteUrl;
  }

  const plugins: PluginOption[] = [tailwindcss(), devtoolsJson(), sveltekit()];

  if (useLocalConvex) {
    plugins.push(
      convexLocal({
        port: localConvexPort,
        siteProxyPort: localConvexSiteProxyPort,
        projectDir: convexProjectDir,
        convexDir: convexFunctionsDir,
        reset: resetLocalBackend,
        envVars: getLocalConvexEnvVars(loadedEnv),
      }),
    );
  }

  return {
    envDir: workspaceRoot,
    plugins,
    resolve: {
      alias: {
        "@": workspaceRoot,
      },
    },
    server: {
      fs: {
        allow: [workspaceRoot],
      },
    },
  };
});
