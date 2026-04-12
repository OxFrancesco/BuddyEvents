import { createHash } from "node:crypto";

function normalizePart(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function buildDeterministicIdempotencyKey(
  namespace: string,
  parts: ReadonlyArray<string | number | boolean | null | undefined>,
) {
  const normalized = [namespace, ...parts.map(normalizePart)].join(":");
  const digest = createHash("sha256").update(normalized).digest("hex");
  return `${namespace}_${digest}`;
}

export function resolveIdempotencyKey(args: {
  explicitKey?: string | null;
  fallbackNamespace: string;
  fallbackParts: ReadonlyArray<string | number | boolean | null | undefined>;
}) {
  const explicit = args.explicitKey?.trim();
  if (explicit) return explicit;
  return buildDeterministicIdempotencyKey(
    args.fallbackNamespace,
    args.fallbackParts,
  );
}

