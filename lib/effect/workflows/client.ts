import { Effect } from "effect";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AppRuntime } from "../runtime";
import type { WorkflowExecution, WorkflowName } from "./shared";
import { toJson } from "./shared";

type StartWorkflowInput = {
  workflowName: WorkflowName;
  idempotencyKey: string;
  source: string;
  actorUserId?: Id<"users">;
  payload: unknown;
};

async function loadRegistryModule() {
  return await import("./registry");
}

export async function startWorkflow(input: StartWorkflowInput) {
  return await AppRuntime.runPromise(
    Effect.gen(function* () {
      const { AppConfigTag } = yield* Effect.promise(() => import("../config"));
      const { ConvexServiceTag } = yield* Effect.promise(
        () => import("../services/convex"),
      );
      const config = yield* AppConfigTag;
      const convex = yield* ConvexServiceTag;
      return yield* convex.mutation<WorkflowExecution>(
        api.workflows.startOrGet,
        {
          workflowName: input.workflowName,
          idempotencyKey: input.idempotencyKey,
          source: input.source,
          actorUserId: input.actorUserId,
          payloadJson: toJson(input.payload),
          serviceToken: config.convexServiceToken,
        },
      );
    }),
  );
}

export async function getWorkflow(id: Id<"workflowExecutions">) {
  return await AppRuntime.runPromise(
    Effect.gen(function* () {
      const { AppConfigTag } = yield* Effect.promise(() => import("../config"));
      const { ConvexServiceTag } = yield* Effect.promise(
        () => import("../services/convex"),
      );
      const config = yield* AppConfigTag;
      const convex = yield* ConvexServiceTag;
      return yield* convex.query<WorkflowExecution | null>(api.workflows.get, {
        id,
        serviceToken: config.convexServiceToken,
      });
    }),
  );
}

export async function runWorkflowById(
  id: Id<"workflowExecutions">,
  workerId?: string,
) {
  const registry = await loadRegistryModule();
  return await AppRuntime.runPromise(
    registry.runWorkflowExecutionEffect(id, workerId),
  );
}

export async function startWorkflowAndRun(input: StartWorkflowInput) {
  const execution = await startWorkflow(input);
  const completed = await runWorkflowById(execution._id);
  return {
    execution,
    completed,
  };
}
