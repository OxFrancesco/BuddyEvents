import { describe, expect, it } from "vitest";
import {
  buildDeterministicIdempotencyKey,
  resolveIdempotencyKey,
} from "@/lib/idempotency";

describe("idempotency helpers", () => {
  it("builds a stable deterministic key for the same normalized inputs", () => {
    const first = buildDeterministicIdempotencyKey("ticket", [
      " event-1 ",
      "buyer-1",
      null,
    ]);
    const second = buildDeterministicIdempotencyKey("ticket", [
      "event-1",
      "buyer-1",
      undefined,
    ]);

    expect(first).toBe(second);
    expect(first.startsWith("ticket_")).toBe(true);
  });

  it("changes the key when the namespace or payload changes", () => {
    const base = buildDeterministicIdempotencyKey("ticket", [
      "event-1",
      "buyer-1",
    ]);
    const changedNamespace = buildDeterministicIdempotencyKey("event", [
      "event-1",
      "buyer-1",
    ]);
    const changedPayload = buildDeterministicIdempotencyKey("ticket", [
      "event-2",
      "buyer-1",
    ]);

    expect(base).not.toBe(changedNamespace);
    expect(base).not.toBe(changedPayload);
  });

  it("prefers an explicit idempotency key when one is provided", () => {
    expect(
      resolveIdempotencyKey({
        explicitKey: " explicit-key ",
        fallbackNamespace: "ticket",
        fallbackParts: ["event-1"],
      }),
    ).toBe("explicit-key");
  });

  it("derives a fallback key when the explicit key is empty", () => {
    const resolved = resolveIdempotencyKey({
      explicitKey: "   ",
      fallbackNamespace: "wallet-purchase",
      fallbackParts: ["event-1", "buyer-1", "0xabc"],
    });

    expect(resolved).toBe(
      buildDeterministicIdempotencyKey("wallet-purchase", [
        "event-1",
        "buyer-1",
        "0xabc",
      ]),
    );
  });
});
