import { Context, Effect, Layer } from "effect";
import { sendTelegramMessage } from "@/lib/telegram";
import { ExternalServiceError } from "../errors";

export type TelegramService = {
  readonly sendMessage: (args: {
    chat_id: number;
    text: string;
    parse_mode?: "Markdown" | "HTML";
    reply_markup?: {
      inline_keyboard: Array<Array<{ text: string; url?: string; web_app?: { url: string } }>>;
    };
  }) => Effect.Effect<void, ExternalServiceError>;
};

export class TelegramServiceTag extends Context.Tag("@buddyevents/TelegramService")<
  TelegramServiceTag,
  TelegramService
>() {}

export const TelegramServiceLayer = Layer.succeed(TelegramServiceTag, {
  sendMessage: (args) =>
    Effect.tryPromise({
      try: () => sendTelegramMessage(args),
      catch: (error) =>
        new ExternalServiceError({
          message: "Telegram send failed",
          cause: error,
          details: args,
        }),
    }),
});
