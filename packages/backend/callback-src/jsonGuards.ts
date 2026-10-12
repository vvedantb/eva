import type { JsonObject, JsonValue } from "./types.js";

// Leaf module: `runtime/state.ts` needs these at load time, and importing them
// from `utils.ts` (which imports state) would make the two modules circular.

/** True for plain JSON objects (not null, not arrays). */
export function isJsonObject(
  value: JsonValue | undefined,
): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Coerces a JSON value to an object; non-objects become `{}`. */
export function asJsonObject(value: JsonValue | undefined): JsonObject {
  return isJsonObject(value) ? value : {};
}

/** Trimmed string value, or undefined when missing/blank. */
export function trimmedString(
  value: JsonValue | undefined,
): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}
