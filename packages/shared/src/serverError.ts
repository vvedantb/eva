import { ConvexError } from "convex/values";

/**
 * A failed call's message, as the user should read it. A `ConvexError` with
 * string data is the backend's own words. Otherwise Convex wraps the error in
 * `[CONVEX …] [Request ID: …] Server Error` plus an `Uncaught Error:` line and
 * a stack, none of which means anything outside the dashboard; in production
 * a plain `Error` is redacted to that wrapper, so `fallback` shows instead.
 */
export function readableServerError(error: Error, fallback: string): string {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return readableErrorMessage(error.message, fallback);
}

/** `readableServerError` for a message string alone. */
export function readableErrorMessage(message: string, fallback: string): string {
  const cleaned = message
    .replace(/\s+/g, " ")
    .replace(/\[CONVEX[^\]]*\]/g, "")
    .replace(/\[Request ID:[^\]]*\]/g, "")
    .replace(/\bServer Error\b/g, "")
    .replace(/\bUncaught [A-Za-z]*Error:?/g, "")
    // Everything from the first stack frame on is for the logs, not the user.
    .split(" at ")[0];
  const trimmed = (cleaned ?? "").trim();
  return trimmed.length > 0 ? trimmed : fallback;
}
