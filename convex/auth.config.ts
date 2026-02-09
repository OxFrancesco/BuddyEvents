import { AuthConfig } from "convex/server";

// convex/auth.config.ts — Convex JWT validation config for Clerk "convex" template
export default {
  providers: [
    {
      // Issuer URL from Clerk JWT template named exactly "convex"
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
