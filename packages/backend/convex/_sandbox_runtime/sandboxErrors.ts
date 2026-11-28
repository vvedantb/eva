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
  signal:
    | "in-vm-command"
    | "http-status"
    | "provider-code"
    | "eva-verdict"
    | "provider-message"
    | "unclassified";
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
export class SandboxCommandFailedError extends Error {
  readonly exitCode: number;
  readonly output: string;

  constructor(
    message: string,
    details: { exitCode: number; output: string },
  ) {
    super(message);
    this.name = "SandboxCommandFailedError";
    this.exitCode = details.exitCode;
    this.output = details.output;
  }
}

/**
 * eva has already concluded the sandbox is gone (a 404 on refresh, a `gone`
 * lifecycle state). Thrown so the verdict survives being re-thrown through a
 * layer instead of being re-derived from the rethrown message.
 */
export class SandboxGoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxGoneError";
  }
}

/**
 * The client-side ceiling on a sandbox exec elapsed (`withTimeout` in
 * helpers.ts): the exec never answered at all. Typed so "the VM stopped
 * responding" can be told apart from a command that ran and failed — the
 * message keeps the exact `Sandbox exec (Ns) timed out after Nms` wording the
 * setup-retry matchers already key on.
 */
export class SandboxExecTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxExecTimeoutError";
  }
}

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

const apiErrorShape = z.object({
  response: z.object({ status: z.number().int() }),
});

const authNotOkShape = z.object({
  name: z.literal("NotOk"),
  response: z.object({ statusCode: z.number().int() }),
});

const streamErrorShape = z.object({
  name: z.literal("StreamError"),
  code: z.string(),
});

function extractSandboxHttpStatus(error: unknown): number | undefined {
  if (error instanceof SandboxProviderError) return error.httpStatus;
  const notOk = authNotOkShape.safeParse(error);
  if (notOk.success) return notOk.data.response.statusCode;
  const api = apiErrorShape.safeParse(error);
  if (api.success) return api.data.response.status;
  return undefined;
}

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
