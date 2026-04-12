import { setTimeout as sleep } from "node:timers/promises";
import { Effect, Console } from "effect";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AppRuntime } from "@/lib/effect/runtime";
import { AppConfigTag } from "@/lib/effect/config";
import { ConvexServiceTag } from "@/lib/effect/services/convex";
import { runWorkflowById } from "@/lib/effect/workflows";

const workerId = `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

const drainDueExecutions = Effect.gen(function* () {
  const config = yield* AppConfigTag;
  const convex = yield* ConvexServiceTag;

  const swept = yield* convex.mutation<number>(api.workflows.sweepStale, {
    serviceToken: config.convexServiceToken,
  });
  if (swept > 0) {
    yield* Console.log(`requeued ${swept} stale workflow lease(s)`);
  }

  const claimed = yield* convex.mutation<
    Array<{ _id: Id<"workflowExecutions">; workflowName: string; status: string }>
  >(api.workflows.claimDue, {
    workerId,
    limit: 5,
    serviceToken: config.convexServiceToken,
  });

  for (const execution of claimed) {
    yield* Console.log(
      `running workflow ${execution._id} (${execution.workflowName}) as ${workerId}`,
    );
    yield* Effect.tryPromise({
      try: () => runWorkflowById(execution._id, workerId),
      catch: (error) =>
        new Error(
          error instanceof Error ? error.message : "workflow execution failed",
        ),
    });
  }

  return claimed.length;
});

async function main() {
  process.env.CONVEX_TMPDIR = process.env.CONVEX_TMPDIR || process.cwd();

  while (true) {
    const claimed = await AppRuntime.runPromise(drainDueExecutions);
    await sleep(claimed > 0 ? 250 : 1_000);
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[worker] fatal: ${message}`);
  process.exitCode = 1;
});
