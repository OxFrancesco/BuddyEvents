import { Context, Effect, Layer, Schema } from "effect";
import { AppConfigError } from "./errors";

export const AppConfigSchema = Schema.Struct({
  convexUrl: Schema.String,
  convexServiceToken: Schema.String,
  appUrl: Schema.String,
  telegramBotToken: Schema.optional(Schema.String),
  telegramWebhookSecret: Schema.optional(Schema.String),
  openRouterApiKey: Schema.optional(Schema.String),
  openRouterModel: Schema.optional(Schema.String),
  crossmintClientApiKey: Schema.optional(Schema.String),
  crossmintServerApiKey: Schema.optional(Schema.String),
  crossmintChain: Schema.optional(Schema.String),
  crossmintServerSignerSecret: Schema.optional(Schema.String),
  clerkCrossmintJwtTemplate: Schema.optional(Schema.String),
  enableCrossmintHumanWallet: Schema.optional(Schema.BooleanFromString),
  enableCrossmintAutomation: Schema.optional(Schema.BooleanFromString),
  circleApiKey: Schema.optional(Schema.String),
  circleEntitySecretCiphertext: Schema.optional(Schema.String),
  circleWalletSetId: Schema.optional(Schema.String),
});

export type AppConfig = Schema.Schema.Type<typeof AppConfigSchema>;

export class AppConfigTag extends Context.Tag("@buddyevents/AppConfig")<
  AppConfigTag,
  AppConfig
>() {}

const decodeConfig = Schema.decodeUnknownSync(AppConfigSchema);

function loadConfig(): AppConfig {
  try {
    return decodeConfig({
      convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL,
      convexServiceToken: process.env.CONVEX_SERVICE_TOKEN,
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
      telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
      openRouterApiKey: process.env.OPENROUTER_API_KEY,
      openRouterModel: process.env.OPENROUTER_MODEL,
      crossmintClientApiKey: process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY,
      crossmintServerApiKey: process.env.CROSSMINT_SERVER_API_KEY,
      crossmintChain: process.env.CROSSMINT_CHAIN,
      crossmintServerSignerSecret: process.env.CROSSMINT_SERVER_SIGNER_SECRET,
      clerkCrossmintJwtTemplate: process.env.CLERK_CROSSMINT_JWT_TEMPLATE,
      enableCrossmintHumanWallet:
        process.env.NEXT_PUBLIC_ENABLE_CROSSMINT_HUMAN_WALLET,
      enableCrossmintAutomation: process.env.ENABLE_CROSSMINT_AUTOMATION,
      circleApiKey: process.env.CIRCLE_API_KEY,
      circleEntitySecretCiphertext: process.env.CIRCLE_ENTITY_SECRET_CIPHERTEXT,
      circleWalletSetId: process.env.CIRCLE_WALLET_SET_ID,
    });
  } catch (error) {
    throw new AppConfigError({
      message: "Invalid BuddyEvents environment configuration",
      cause: error,
    });
  }
}

export const AppConfigLayer = Layer.effect(
  AppConfigTag,
  Effect.try({
    try: loadConfig,
    catch: (error) =>
      error instanceof AppConfigError
        ? error
        : new AppConfigError({
            message: "Unable to load BuddyEvents configuration",
            cause: error,
          }),
  }),
);
