import type { JsonObject, JsonValue } from "./types.js";

/** True for plain JSON objects (not null, not arrays). */
export function isJsonObject(
  value: JsonValue | undefined,
): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Trimmed string value, or undefined when missing/blank. */
export function trimmedString(
  value: JsonValue | undefined,
): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}
