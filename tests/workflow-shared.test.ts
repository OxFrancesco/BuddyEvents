import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ExternalServiceError,
  WorkflowAmbiguousError,
  WorkflowPermanentError,
  WorkflowTransientError,
} from "@/lib/effect/errors";
import {
  computeRetryDelayMs,
  normalizeWorkflowError,
  serializeError,
} from "@/lib/effect/workflows/shared";

describe("workflow shared helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses exponential backoff with bounded jitter", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    expect(computeRetryDelayMs(1)).toBe(1_000);
    expect(computeRetryDelayMs(2)).toBe(2_000);
    expect(computeRetryDelayMs(3)).toBe(4_000);
    expect(computeRetryDelayMs(9)).toBe(60_000);
  });

  it("maps external service failures to ambiguous workflow errors", () => {
    const normalized = normalizeWorkflowError(
      new ExternalServiceError({
        message: "Circle transaction lookup failed",
        details: { transactionId: "txn_123" },
      }),
    );

    expect(normalized).toBeInstanceOf(WorkflowAmbiguousError);
    expect(normalized.message).toBe("Circle transaction lookup failed");
    expect(normalized.details).toEqual({ transactionId: "txn_123" });
  });

  it("classifies authorization and validation failures as permanent", () => {
    const forbidden = normalizeWorkflowError(new Error("Forbidden"));
    const missing = normalizeWorkflowError(new Error("Event not found"));

    expect(forbidden).toBeInstanceOf(WorkflowPermanentError);
    expect(missing).toBeInstanceOf(WorkflowPermanentError);
  });

  it("keeps unexpected failures ambiguous", () => {
    const normalized = normalizeWorkflowError(new Error("socket hang up"));

    expect(normalized).toBeInstanceOf(WorkflowAmbiguousError);
  });

  it("serializes tagged workflow errors with metadata", () => {
    const serialized = serializeError(
      new WorkflowTransientError({
        message: "Retry me",
        details: { attempt: 2 },
        cause: new Error("boom"),
      }),
    );

    expect(serialized).toMatchObject({
      tag: "WorkflowTransientError",
      message: "Retry me",
      details: { attempt: 2 },
      cause: { name: "Error", message: "boom" },
    });
  });
});
