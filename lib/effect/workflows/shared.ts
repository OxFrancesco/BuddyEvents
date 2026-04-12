import type { Id } from "@/convex/_generated/dataModel";
import type { SupportedChainKey } from "@/lib/chains";
import {
  ExternalServiceError,
  WorkflowAmbiguousError,
  WorkflowPermanentError,
  WorkflowTransientError,
} from "../errors";

export const workflowNames = [
  "ticket_purchase",
  "create_event",
  "provision_wallet",
  "provision_circle_wallet",
  "refresh_qr",
  "telegram_command",
] as const;

export type WorkflowName = (typeof workflowNames)[number];

export type WorkflowExecution = {
  _id: Id<"workflowExecutions">;
  _creationTime: number;
  workflowName: WorkflowName;
  idempotencyKey: string;
  source: string;
  actorUserId?: Id<"users">;
  status: "pending" | "in_progress" | "waiting_retry" | "completed" | "failed";
  payloadJson: string;
  resultJson?: string;
  errorJson?: string;
  leaseOwner?: string;
  leaseExpiresAt?: number;
  nextRunAt: number;
  attempt: number;
  startedAt?: number;
  updatedAt: number;
  finishedAt?: number;
};

export type WorkflowStep = {
  _id: Id<"workflowSteps">;
  _creationTime: number;
  executionId: Id<"workflowExecutions">;
  stepName: string;
  status: "started" | "completed" | "failed";
  attempt: number;
  inputJson?: string;
  outputJson?: string;
  errorJson?: string;
  externalReference?: string;
  createdAt: number;
  updatedAt: number;
};

export type TicketPurchaseWorkflowPayload = {
  eventId: Id<"events">;
  buyerAddress: string;
  buyerAgentId?: string;
  purchasePrice: number;
  purchaseSource: "wallet" | "x402" | "telegram" | "pi" | "free" | "reconcile";
  purchaseReference: string;
  txHash: string;
};

export type CreateEventWorkflowPayload = {
  name: string;
  description: string;
  startTime: number;
  endTime: number;
  price: number;
  maxTickets: number;
  chainKey: SupportedChainKey;
  teamId: Id<"teams">;
  sponsors?: Array<Id<"sponsors">>;
  location: string;
  creatorAddress: string;
  creatorUserId: Id<"users">;
  chainReference: string;
};

export type ProvisionWalletWorkflowPayload = {
  userId: Id<"users">;
  purpose?: "human_primary" | "automation";
  chainKey?: SupportedChainKey;
};

export type ProvisionCircleWalletWorkflowPayload = ProvisionWalletWorkflowPayload;

export type RefreshQrWorkflowPayload = {
  ticketId: Id<"tickets">;
  eventId: Id<"events">;
  userId?: Id<"users">;
};

export type TelegramCommandWorkflowPayload = {
  chatId: number | string;
  rawInput: string;
  userId?: Id<"users">;
  intent?: string;
  args?: Record<string, unknown>;
};

export function parseJson<T>(value?: string): T | undefined {
  if (!value) return undefined;
  return JSON.parse(value) as T;
}

export function toJson(value: unknown): string {
  return JSON.stringify(value);
}

export function computeRetryDelayMs(attempt: number) {
  const cappedExponent = Math.min(Math.max(attempt, 1), 8);
  const base = 1_000 * 2 ** (cappedExponent - 1);
  const jitter = Math.floor(Math.random() * 500);
  return Math.min(base + jitter, 60_000);
}

export function normalizeWorkflowError(error: unknown) {
  if (
    error instanceof WorkflowTransientError ||
    error instanceof WorkflowPermanentError ||
    error instanceof WorkflowAmbiguousError
  ) {
    return error;
  }

  if (error instanceof ExternalServiceError) {
    return new WorkflowAmbiguousError({
      message: error.message,
      cause: error,
      details: error.details,
    });
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes("forbidden") ||
      message.includes("required") ||
      message.includes("not found") ||
      message.includes("sold out") ||
      message.includes("not active")
    ) {
      return new WorkflowPermanentError({
        message: error.message,
        cause: error,
      });
    }

    return new WorkflowAmbiguousError({
      message: error.message,
      cause: error,
    });
  }

  return new WorkflowAmbiguousError({
    message: "Unknown workflow failure",
    details: { error: String(error) },
  });
}

export function serializeError(error: unknown) {
  if (
    error instanceof WorkflowTransientError ||
    error instanceof WorkflowPermanentError ||
    error instanceof WorkflowAmbiguousError ||
    error instanceof ExternalServiceError
  ) {
    return {
      tag: error._tag,
      message: error.message,
      details: error.details,
      cause:
        error.cause instanceof Error
          ? { name: error.cause.name, message: error.cause.message }
          : error.cause,
    };
  }

  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }

  return { message: String(error) };
}
