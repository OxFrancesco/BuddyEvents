import { Context, Effect, Layer } from "effect";
import { AppConfigTag } from "../config";
import { ExternalServiceError } from "../errors";

export type OpenRouterService = {
  readonly completeJson: (args: {
    model?: string;
    messages: Array<{ role: string; content: string }>;
  }) => Effect.Effect<Record<string, unknown>, ExternalServiceError>;
};

export class OpenRouterServiceTag extends Context.Tag(
  "@buddyevents/OpenRouterService",
)<OpenRouterServiceTag, OpenRouterService>() {}

export const OpenRouterServiceLayer = Layer.effect(
  OpenRouterServiceTag,
  Effect.gen(function* () {
    const config = yield* AppConfigTag;
    return {
      completeJson: (args: {
        model?: string;
        messages: Array<{ role: string; content: string }>;
      }) =>
        Effect.tryPromise({
          try: async () => {
            if (!config.openRouterApiKey) {
              throw new Error("OPENROUTER_API_KEY is not configured");
            }

            const response = await fetch(
              "https://openrouter.ai/api/v1/chat/completions",
              {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  authorization: `Bearer ${config.openRouterApiKey}`,
                  "HTTP-Referer": config.appUrl,
                  "X-Title": "BuddyEvents",
                },
                body: JSON.stringify({
                  model: args.model ?? config.openRouterModel ?? "z-ai/glm-5",
                  temperature: 0,
                  response_format: { type: "json_object" },
                  messages: args.messages,
                }),
              },
            );

            if (!response.ok) {
              throw new Error(`OpenRouter error: ${response.status}`);
            }
            const json = (await response.json()) as {
              choices?: Array<{ message?: { content?: string | null } }>;
            };
            const content = json.choices?.[0]?.message?.content;
            if (!content) return {};
            return JSON.parse(content) as Record<string, unknown>;
          },
          catch: (error) =>
            new ExternalServiceError({
              message: "OpenRouter completion failed",
              cause: error,
              details: args,
            }),
        }),
    };
  }),
);
