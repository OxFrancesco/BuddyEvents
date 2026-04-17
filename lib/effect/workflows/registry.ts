import { Effect } from "effect";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AppConfigTag } from "../config";
import { ConvexServiceTag } from "../services/convex";
import { CrossmintServiceTag } from "../services/crossmint";
import { EvmServiceTag } from "../services/evm";
import { OpenRouterServiceTag } from "../services/openrouter";
import { TelegramServiceTag } from "../services/telegram";
import { X402ServiceTag } from "../services/x402";
import {
  computeRetryDelayMs,
  normalizeWorkflowError,
  parseJson,
  serializeError,
  toJson,
  type WorkflowExecution,
  type WorkflowName,
  type WorkflowStep,
} from "./shared";
import { CreateEventWorkflow } from "./CreateEventWorkflow";
import { ProvisionCircleWalletWorkflow } from "./ProvisionCircleWalletWorkflow";
import { RefreshQrWorkflow } from "./RefreshQrWorkflow";
import { TelegramCommandWorkflow } from "./TelegramCommandWorkflow";
import { TicketPurchaseWorkflow } from "./TicketPurchaseWorkflow";

type WorkflowRuntimeServices =
  | AppConfigTag
  | ConvexServiceTag
  | CrossmintServiceTag
  | EvmServiceTag
  | OpenRouterServiceTag
  | TelegramServiceTag
  | X402ServiceTag;

export type WorkflowRunContext<P> = {
  execution: WorkflowExecution;
  payload: P;
  steps: WorkflowStep[];
  serviceToken: string;
  heartbeat: () => Effect.Effect<void, unknown>;
  getCompletedStep: <A>(stepName: string) => A | undefined;
  step: <A>(
    stepName: string,
    input: unknown,
    effect: Effect.Effect<A, unknown>,
    externalReference?: string,
  ) => Effect.Effect<A, unknown>;
};

export type WorkflowDefinition<P = unknown, R = unknown> = {
  name: WorkflowName;
  run: (
    context: WorkflowRunContext<P>,
  ) => Effect.Effect<R, unknown, WorkflowRuntimeServices>;
  onFailure?: (
    context: WorkflowRunContext<P>,
    error: unknown,
  ) => Effect.Effect<void, never, WorkflowRuntimeServices>;
};

const workflowRegistry = {
  ticket_purchase: TicketPurchaseWorkflow,
  create_event: CreateEventWorkflow,
  provision_wallet: ProvisionCircleWalletWorkflow,
  provision_circle_wallet: ProvisionCircleWalletWorkflow,
  refresh_qr: RefreshQrWorkflow,
  telegram_command: TelegramCommandWorkflow,
} as const;

export function getWorkflowDefinition(
  name: WorkflowName,
): WorkflowDefinition<unknown, unknown> {
  return workflowRegistry[name] as WorkflowDefinition<unknown, unknown>;
}

export const runWorkflowExecutionEffect = (
  executionId: Id<"workflowExecutions">,
  workerId?: string,
) =>
  Effect.gen(function* () {
    const convex = yield* ConvexServiceTag;
    const config = yield* AppConfigTag;

    const execution = yield* convex.query<WorkflowExecution | null>(
      api.workflows.get,
      {
        id: executionId,
        serviceToken: config.convexServiceToken,
      },
    );
    if (!execution) {
      throw new Error(`Workflow ${executionId} not found`);
    }

    if (execution.status === "completed" || execution.status === "failed") {
      return execution;
    }

    if (workerId) {
      yield* convex.mutation(api.workflows.heartbeat, {
        id: executionId,
        workerId,
        serviceToken: config.convexServiceToken,
      });
    }

    const steps = yield* convex.query<WorkflowStep[]>(api.workflows.listSteps, {
      executionId,
      serviceToken: config.convexServiceToken,
    });
    const definition = getWorkflowDefinition(execution.workflowName);
    const payload = parseJson<unknown>(execution.payloadJson);
    const serviceToken = config.convexServiceToken;

    const context: WorkflowRunContext<unknown> = {
      execution,
      payload,
      steps,
      serviceToken,
      heartbeat: () =>
        workerId
          ? convex.mutation(api.workflows.heartbeat, {
              id: executionId,
              workerId,
              serviceToken,
            })
          : Effect.succeed(undefined),
      getCompletedStep: <A>(stepName: string) => {
        const completed = [...steps]
          .reverse()
          .find(
            (step) => step.stepName === stepName && step.status === "completed",
          );
        return parseJson<A>(completed?.outputJson);
      },
      step: <A>(
        stepName: string,
        input: unknown,
        effect: Effect.Effect<A, unknown>,
        externalReference?: string,
      ) =>
        Effect.gen(function* () {
          const attemptForStep =
            steps.filter((step) => step.stepName === stepName).length + 1;

          yield* context.heartbeat();
          yield* convex.mutation(api.workflows.appendStep, {
            executionId,
            stepName,
            status: "started",
            attempt: attemptForStep,
            inputJson: toJson(input),
            externalReference,
            serviceToken,
          });

          try {
            const output = yield* effect;
            yield* convex.mutation(api.workflows.appendStep, {
              executionId,
              stepName,
              status: "completed",
              attempt: attemptForStep,
              inputJson: toJson(input),
              outputJson: toJson(output),
              externalReference,
              serviceToken,
            });
            return output;
          } catch (error) {
            yield* convex.mutation(api.workflows.appendStep, {
              executionId,
              stepName,
              status: "failed",
              attempt: attemptForStep,
              inputJson: toJson(input),
              errorJson: toJson(serializeError(error)),
              externalReference,
              serviceToken,
            });
            return yield* Effect.fail(error);
          }
        }),
    };

    try {
      const result = yield* definition.run(context);
      return yield* convex.mutation<WorkflowExecution | null>(
        api.workflows.complete,
        {
          id: executionId,
          resultJson: toJson(result),
          serviceToken,
        },
      );
    } catch (error) {
      const normalized = normalizeWorkflowError(error);
      if (definition.onFailure) {
        yield* definition.onFailure(context, normalized);
      }
      return yield* convex.mutation<WorkflowExecution | null>(
        api.workflows.fail,
        {
          id: executionId,
          errorJson: toJson(serializeError(normalized)),
          retryAt:
            normalized._tag === "WorkflowTransientError" ||
            normalized._tag === "WorkflowAmbiguousError"
              ? Date.now() + computeRetryDelayMs(execution.attempt + 1)
              : undefined,
          serviceToken,
        },
      );
    }
  });
