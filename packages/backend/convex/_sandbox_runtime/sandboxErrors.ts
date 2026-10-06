/**
 * Typed sandbox errors and the one classifier the resume/reuse paths use to
 * decide "is this sandbox gone?".
 *
 * WHY THIS EXISTS
 * The decision used to be a substring match over an error *message*
 * ("not found" / "does not exist" / "404"). A Postgres error raised by a
 * command running INSIDE a healthy VM (`relation "X" does not exist`) matched,
 * so eva minted a replacement sandbox while the original was still running and
 * billed two VMs against one session. Narrowing the regexes bought time; it did
 * not fix the shape of the bug, because any novel provider or in-VM message is
 * one string away from the next double-VM incident.
 *
 * THE INVARIANT
 * Only two things can ever classify as `sandbox-gone`:
 *   1. a {@link SandboxProviderError} carrying a structured signal from the
 *      provider client (HTTP status, provider error code), or
 *   2. a {@link SandboxGoneError} — a verdict eva itself already reached.
 * Everything else is `unknown`. In particular a {@link SandboxCommandFailedError}
 * (non-zero exit of a command run inside a live sandbox) returns early before
 * any message is inspected, and a plain `Error` carrying stdout/stderr can
 * never reach the message fallback at all — the fallback only runs over a
 * provider error's API-response detail, never over command output.
 *
 * So: in-VM output is *structurally* unable to condemn a live sandbox, rather
 * than merely being excluded by a regex someone has to remember to maintain.
 */

import { Data } from "effect";
import { z } from "zod";
import { SandboxProviderError } from "../_sandbox/provider";

/**
 * Coarse class of a sandbox failure.
 *
 * - `sandbox-gone` — the sandbox/snapshot record no longer exists; it is safe
 *   to fall through to creating a replacement.
 * - `auth` — credentials rejected. The sandbox may be perfectly alive; never
 *   replace it.
 * - `transient` — rate limit, timeout, or provider 5xx. Retry.
 * - `unknown` — anything eva cannot prove. Callers must NOT treat this as gone.
 */
export type SandboxErrorKind =
  | "sandbox-gone"
  | "auth"
  | "transient"
  | "unknown";

export type SandboxErrorClassification = {
  kind: SandboxErrorKind;
  /** Which signal produced {@link kind}, for logs. */
  signal:
    | "in-vm-command"
    | "http-status"
    | "provider-code"
    | "eva-verdict"
    | "provider-message"
    | "unclassified";
  /** Provider HTTP status when one was available. */
  httpStatus?: number;
};

/**
 * A command run INSIDE a sandbox exited non-zero.
 *
 * The sandbox answered, so by construction it is alive. Never evidence that it
 * is gone — {@link classifySandboxError} short-circuits on this type before it
 * looks at any text, which is what keeps `relation "X" does not exist` from
 * condemning a running VM.
 */
export class SandboxCommandFailedError extends Data.TaggedError(
  "SandboxCommandFailedError",
)<{
  message: string;
  exitCode: number;
  /** Combined stdout/stderr, trimmed. Empty when the provider discarded it. */
  output: string;
}> {}

/**
 * eva has already concluded the sandbox is gone (a 404 on refresh, a `gone`
 * lifecycle state). Thrown so the verdict survives being re-thrown through a
 * layer instead of being re-derived from the rethrown message.
 */
export class SandboxGoneError extends Data.TaggedError("SandboxGoneError")<{
  message: string;
}> {}

/**
 * The client-side ceiling on a sandbox exec elapsed (`withTimeout` in
 * helpers.ts): the exec never answered at all. Typed so "the VM stopped
 * responding" can be told apart from a command that ran and failed — the
 * message keeps the exact `Sandbox exec (Ns) timed out after Nms` wording the
 * setup-retry matchers already key on.
 */
export class SandboxExecTimeoutError extends Data.TaggedError(
  "SandboxExecTimeoutError",
)<{
  message: string;
}> {}

/**
 * True when a failure from a CHEAP eva-issued command (liveness probe, pid
 * check, daemon fork) says the VM itself can no longer run commands:
 *
 * - exit 137 — the shell was SIGKILLed. A trivial `echo 1` cannot earn a
 *   SIGKILL of its own, so this is the kernel OOM killer in meltdown or the
 *   VM dying under the exec (prod 2026-09-01, silver-strategic-buzzard).
 * - a client-side exec timeout ({@link SandboxExecTimeoutError}) — the exec
 *   never answered at all.
 *
 * Deliberately NOT `sandbox-gone`: the record still exists and must never be
 * abandoned for a replacement VM. The right reaction is a stop+resume
 * (`restartUnresponsiveSandbox` in helpers.ts) or reporting unhealthy.
 * Callers must only apply this to commands too cheap to be OOM-killed for
 * their own memory use — a 137 from a heavy build means the command, not the
 * VM.
 */
export function isSandboxUnresponsiveError(error: unknown): boolean {
  if (error instanceof SandboxCommandFailedError) {
    return error.exitCode === 137;
  }
  return error instanceof SandboxExecTimeoutError;
}

/** APIError from `@vercel/sandbox`: `.response` is a fetch `Response`. */
const apiErrorShape = z.object({
  response: z.object({ status: z.number().int() }),
});

/** `NotOk` from the SDK's auth client: `.response.statusCode`. */
const authNotOkShape = z.object({
  name: z.literal("NotOk"),
  response: z.object({ statusCode: z.number().int() }),
});

/** `StreamError` from the SDK: a command stream died, code says why. */
const streamErrorShape = z.object({
  name: z.literal("StreamError"),
  code: z.string(),
});

/**
 * Pulls an HTTP status out of a provider-client error.
 *
 * Handles the three shapes `@vercel/sandbox@3` actually throws (verified
 * against the SDK's `api-client/api-error.ts` and `auth/error.ts`) plus eva's
 * own {@link SandboxProviderError}, which carries the status the provider
 * adapter extracted before it wrapped the SDK error.
 */
function extractSandboxHttpStatus(error: unknown): number | undefined {
  if (error instanceof SandboxProviderError) return error.httpStatus;
  const notOk = authNotOkShape.safeParse(error);
  if (notOk.success) return notOk.data.response.statusCode;
  const api = apiErrorShape.safeParse(error);
  if (api.success) return api.data.response.status;
  return undefined;
}

/** Provider error codes that mean the stream died, not that the VM vanished. */
const LIVE_STREAM_ERROR_CODES = new Set([
  "stream_ended_early",
  "stream_closed",
]);

function kindFromHttpStatus(status: number): SandboxErrorKind {
  if (status === 404 || status === 410) return "sandbox-gone";
  if (status === 401 || status === 403) return "auth";
  if (status === 408 || status === 429 || status >= 500) return "transient";
  return "unknown";
}

/**
 * LAST RESORT. Only ever applied to a provider error's own detail (the API
 * response body / the SDK's message), never to command output or to a message
 * eva assembled around in-VM text.
 *
 * Kept because the provider reports a missing *snapshot* only in the response
 * body, with no distinct HTTP status: a resume against an evicted snapshot
 * comes back 400 with `snapshot_not_found` in the JSON.
 */
export function classifyProviderDetail(detail: string): SandboxErrorKind {
  const msg = detail.toLowerCase();

  if (
    msg.includes("snapshot_not_found") ||
    msg.includes("invalid_snapshot") ||
    msg.includes("snapshot not found") ||
    (msg.includes("snapshot") &&
      (msg.includes("does not exist") || msg.includes("expired")))
  ) {
    return "sandbox-gone";
  }

  if (
    /\bsandbox\b.{0,80}\b(not found|does not exist|deleted|destroyed|archived|gone)\b/.test(
      msg,
    ) ||
    /\b(not found|does not exist|deleted|destroyed|archived|gone)\b.{0,80}\bsandbox\b/.test(
      msg,
    )
  ) {
    return "sandbox-gone";
  }

  return "unknown";
}

/**
 * The single entry point for "what kind of sandbox failure is this?".
 *
 * Order matters: the in-VM short-circuit runs first, then structured provider
 * signals, then eva's own verdict, and only then the message fallback — which
 * is unreachable unless the error is a tagged {@link SandboxProviderError}.
 */
export function classifySandboxError(
  error: unknown,
): SandboxErrorClassification {
  // A command that ran inside the sandbox answered us. Whatever it printed,
  // the VM is alive. Return before anything can read its text.
  if (error instanceof SandboxCommandFailedError) {
    return { kind: "unknown", signal: "in-vm-command" };
  }

  const httpStatus = extractSandboxHttpStatus(error);
  if (httpStatus !== undefined) {
    const kind = kindFromHttpStatus(httpStatus);
    if (kind !== "unknown") return { kind, signal: "http-status", httpStatus };
  }

  const stream = streamErrorShape.safeParse(error);
  if (stream.success && LIVE_STREAM_ERROR_CODES.has(stream.data.code)) {
    // The NDJSON command stream dropped. The SDK raises this when a sandbox is
    // stopped mid-command — and just as often when it is simply busy.
    return { kind: "transient", signal: "provider-code", httpStatus };
  }

  if (error instanceof SandboxGoneError) {
    return { kind: "sandbox-gone", signal: "eva-verdict", httpStatus };
  }

  if (error instanceof SandboxProviderError) {
    const kind = classifyProviderDetail(error.detail);
    if (kind !== "unknown") {
      return { kind, signal: "provider-message", httpStatus };
    }
  }

  return { kind: "unknown", signal: "unclassified", httpStatus };
}

/**
 * True only when the sandbox record is provably gone — i.e. safe to abandon the
 * id and create a replacement. Everything ambiguous answers false, so the
 * caller keeps (and surfaces failures against) the sandbox it already has.
 */
export function isSandboxGoneError(error: unknown): boolean {
  return classifySandboxError(error).kind === "sandbox-gone";
}
