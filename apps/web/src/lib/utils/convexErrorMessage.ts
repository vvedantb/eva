import { ConvexError } from "convex/values";

/**
 * The message to show the user for a failed Convex call.
 *
 * Production Convex redacts plain `Error` messages to "Server Error", so
 * `error.message` alone leaves the user with a request id and no reason. Only
 * `ConvexError` data crosses the wire intact — read that first.
 */
export function convexErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return error instanceof Error ? error.message : fallback;
}

const UNCAUGHT = "Uncaught Error:";
const PLAIN = "Error:";

/**
 * The same failure, stripped of everything the Convex client wraps around it.
 *
 * A client-side rejection reads
 * `[CONVEX M(teams:create)] [Request ID: abc] Server Error\nUncaught Error: Team
 * name is required\n    at handler (../convex/teams.ts:107:12)`. Shown verbatim
 * in a form's error slot that is a stack trace with the sentence buried in the
 * middle, so take the text the handler actually threw: after the last
 * `Uncaught Error:` / `Error:`, up to the newline or the stack frame.
 *
 * `error` is deliberately not `unknown` — callers catch `unknown` and narrow at
 * the boundary with `err instanceof Error ? err : null`.
 */
export function userFacingErrorMessage(
  error: Error | string | null | undefined,
  fallback: string,
): string {
  const raw = typeof error === "string" ? error : (error?.message ?? "");

  let start = 0;
  const uncaught = raw.lastIndexOf(UNCAUGHT);
  if (uncaught !== -1) {
    start = uncaught + UNCAUGHT.length;
  } else {
    const plain = raw.lastIndexOf(PLAIN);
    if (plain !== -1) start = plain + PLAIN.length;
  }

  let text = raw.slice(start);
  const newline = text.indexOf("\n");
  if (newline !== -1) text = text.slice(0, newline);
  const frame = text.indexOf(" at ");
  if (frame !== -1) text = text.slice(0, frame);
  text = text.trim();

  // Nothing survived the strip, or the whole thing was the client's envelope.
  if (text.length === 0 || text.startsWith("[CONVEX")) return fallback;
  return text;
}
