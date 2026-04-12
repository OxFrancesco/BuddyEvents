import { Duration, Effect, Layer, Schedule } from "effect";
import { ExternalServiceError } from "./errors";

export const workerHeartbeatInterval = Duration.seconds(15);
export const workflowLeaseDurationMs = 60_000;

export const standardRetrySchedule = Schedule.intersect(
  Schedule.recurs(4),
  Schedule.exponential(Duration.millis(250)),
);

export function withStandardEffectPolicy<A, E, R>(
  label: string,
  effect: Effect.Effect<A, E, R>,
  timeoutMs: number = 15_000,
) {
  return effect.pipe(
    Effect.withLogSpan(label),
    Effect.timeoutFail({
      duration: Duration.millis(timeoutMs),
      onTimeout: () =>
        new ExternalServiceError({
          message: `${label} timed out`,
          details: { timeoutMs },
        }),
    }),
    Effect.retry(standardRetrySchedule),
  );
}

export const prettyLoggerLayer = Layer.empty;

export const consoleLayer = Layer.empty;
