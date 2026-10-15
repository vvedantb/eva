import type { JsonObject } from "../types.js";

/**
 * Claude can emit a zero-work result when a background task notification wins
 * a race with a user prompt on the same warm query. It is a stream boundary,
 * not an answer to the active turn, so finalizing it would discard the prompt.
 */
export function isZeroWorkTaskNotificationResult(message: JsonObject): boolean {
  const origin = message.origin;
  return (
    message.type === "result" &&
    message.subtype === "success" &&
    message.is_error !== true &&
    message.num_turns === 0 &&
    typeof message.result === "string" &&
    message.result.trim() === "" &&
    typeof origin === "object" &&
    origin !== null &&
    !Array.isArray(origin) &&
    origin.kind === "task-notification"
  );
}
