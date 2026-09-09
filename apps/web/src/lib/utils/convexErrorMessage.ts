import {
  type ConvexErrorPayload,
  convexErrorPayloadSchema,
} from "@eva/shared/convexErrorPayload";
import { ConvexError } from "convex/values";

/**
 * The structured payload on a `ConvexError`, when it carries one.
 *
 * The zod parse is the boundary: anything that does not match the contract —
 * legacy string data, a half-built object, a number — is simply not a payload.
 */
function convexErrorPayload(error: unknown): ConvexErrorPayload | undefined {
  if (!(error instanceof ConvexError)) return undefined;
  const parsed = convexErrorPayloadSchema.safeParse(error.data);
  return parsed.success ? parsed.data : undefined;
}

/**
 * The message to show the user for a failed Convex call.
 *
 * Production Convex redacts plain `Error` messages to "Server Error", so
 * `error.message` alone leaves the user with a request id and no reason. Only
 * `ConvexError` data crosses the wire intact — read that first. Data is either
 * a structured `{ tag, message }` payload from a tagged backend error or, for
 * now, a plain string.
 */
export function convexErrorMessage(error: unknown, fallback: string): string {
  const payload = convexErrorPayload(error);
  if (payload) return payload.message;
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return error instanceof Error ? error.message : fallback;
}

/**
 * The `_tag` of the backend error behind a failed Convex call, when it sent a
 * structured payload, so callers can branch on the kind of failure instead of
 * matching message text. `undefined` for anything else.
 */
export function convexErrorTag(error: unknown): string | undefined {
  return convexErrorPayload(error)?.tag;
}

/** How a failed call should read: an ordinary outcome, or something broken. */
export type ErrorTone = "info" | "error";

export type ConvexErrorPresentation = {
  message: string;
  tone: ErrorTone;
};

/**
 * The tags whose "failure" is an outcome rather than a fault.
 *
 * Some calls fail because there was nothing to do — the branch carries no
 * commits to open a PR from (the ordinary end of a plan-only turn), the PR is
 * already open, the author was never recapped — or because the user typed a
 * URL that is not a pull request. Painting those destructive red tells the user
 * Eva broke when it did not. Everything else, including tags added later, is a
 * real failure until it is listed here.
 */
const TONE_BY_TAG: Readonly<Record<string, ErrorTone | undefined>> = {
  GitHubBranchNotAhead: "info",
  GitHubPullRequestAlreadyExists: "info",
  RecapAuthorNotRecapped: "info",
  RecapPrUrlInvalid: "info",
};

/**
 * The message to show for a failed Convex call, plus the tone to show it in.
 * The one place that decides which backend errors are outcomes rather than
 * failures, so the surfaces that render them cannot disagree.
 */
export function convexErrorPresentation(
  error: unknown,
  fallback: string,
): ConvexErrorPresentation {
  const tag = convexErrorTag(error);
  const tone = tag === undefined ? "error" : (TONE_BY_TAG[tag] ?? "error");
  return { message: convexErrorMessage(error, fallback), tone };
}

/**
 * The text colour for a tone. Hierarchy by tone only — no border or icon, per
 * `docs/eva-ui.md`.
 */
export function errorToneClassName(tone: ErrorTone): string {
  return tone === "info" ? "text-muted-foreground" : "text-destructive";
}
