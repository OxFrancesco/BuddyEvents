import { Effect } from "effect";
import { sendTelegramMessage } from "@/lib/telegram";
import {
  executePiAction,
  type PiExecutionResult,
  type PiIntent,
} from "@/lib/piAgent";
import { WorkflowPermanentError } from "../errors";
import type { TelegramCommandWorkflowPayload } from "./shared";
import type { WorkflowDefinition, WorkflowRunContext } from "./registry";

function formatTelegramResult(result: PiExecutionResult) {
  if (!result.ok) {
    return `❌ ${result.message}`;
  }

  if (result.intent === "connect_wallet") {
    const data = result.data as { walletAddress?: string } | undefined;
    return data?.walletAddress
      ? `✅ Wallet connected: \`${data.walletAddress}\``
      : "✅ Wallet connected.";
  }

  if (result.intent === "buy_ticket") {
    const data = result.data as
      | { ticketId?: string; qrToken?: string; qrTokenExpiresAt?: number }
      | undefined;
    return [
      "✅ Ticket purchase complete.",
      data?.ticketId ? `Ticket ID: \`${data.ticketId}\`` : null,
      result.txHash ? `Tx: \`${result.txHash}\`` : null,
      data?.qrToken ? `QR token: \`${data.qrToken}\`` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (result.intent === "get_event_qr") {
    const data = result.data as { token?: string } | undefined;
    return data?.token
      ? `✅ Fresh QR token: \`${data.token}\``
      : "✅ Fresh QR token generated.";
  }

  if (result.intent === "create_event") {
    const data = result.data as
      | { eventId?: string; workflowId?: string; onChainEventId?: number }
      | undefined;
    return [
      "✅ Event workflow accepted.",
      data?.eventId ? `Event ID: \`${data.eventId}\`` : null,
      data?.workflowId ? `Workflow ID: \`${data.workflowId}\`` : null,
      result.txHash ? `Tx: \`${result.txHash}\`` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return result.message;
}

export const TelegramCommandWorkflow: WorkflowDefinition<
  TelegramCommandWorkflowPayload,
  PiExecutionResult
> = {
  name: "telegram_command",
  run: (context: WorkflowRunContext<TelegramCommandWorkflowPayload>) =>
    Effect.gen(function* () {
      const result = yield* context.step(
        "executePiAction",
        context.payload,
        Effect.tryPromise({
          try: () =>
            executePiAction({
              source: "telegram_bot",
              rawInput: context.payload.rawInput,
              userId: context.payload.userId,
              intent: context.payload.intent as PiIntent | undefined,
              args: context.payload.args,
            }),
          catch: (error) =>
            new WorkflowPermanentError({
              message:
                error instanceof Error
                  ? error.message
                  : "Telegram command execution failed",
              cause: error,
            }),
        }),
        context.execution.idempotencyKey,
      );

      yield* context.step(
        "sendTelegramReply",
        { chatId: context.payload.chatId },
        Effect.tryPromise({
          try: () =>
            sendTelegramMessage({
              chat_id: context.payload.chatId,
              text: formatTelegramResult(result),
              parse_mode: "Markdown",
            }),
          catch: (error) =>
            new WorkflowPermanentError({
              message:
                error instanceof Error
                  ? error.message
                  : "Telegram reply failed",
              cause: error,
            }),
        }),
        String(context.payload.chatId),
      );

      if (!result.ok) {
        return yield* Effect.fail(
          new WorkflowPermanentError({
            message: result.message,
          }),
        );
      }

      return result;
    }),
  onFailure: (context, error) =>
    Effect.ignore(
      Effect.tryPromise({
        try: () =>
          sendTelegramMessage({
            chat_id: context.payload.chatId,
            text: `⚠️ ${error instanceof Error ? error.message : "Telegram workflow failed"}`,
          }),
        catch: () => undefined,
      }),
    ),
};
