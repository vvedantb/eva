import { z } from "zod";

const looseRecord = z.record(z.string(), z.unknown());

/**
 * Boundary parser for untyped postMessage payloads: a plain object becomes a
 * string-keyed record, anything else (null, arrays, primitives) is null.
 */
export function asRecord(value: unknown): Record<string, unknown> | null {
  const parsed = looseRecord.safeParse(value);
  return parsed.success ? parsed.data : null;
}
