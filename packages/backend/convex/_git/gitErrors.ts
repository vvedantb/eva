/**
 * One place that decides what a failed git command actually was.
 *
 * The call sites used to each re-derive that from the message text — a push
 * asked "network or non-fast-forward?", a fetch asked "missing ref?", a clone
 * asked "network?" — so every new git failure mode had to be taught to several
 * matchers at once. Classification now happens once, at the boundary where the
 * command failed, and the retry pipelines match on `_tag`.
 *
 * The original error is kept as `cause` so the edge can rethrow the exact
 * object callers still test with `instanceof SandboxCommandFailedError`.
 *
 * PRECEDENCE (first match wins)
 * 1. missing remote ref — the remote gave a definitive answer, so it is a
 *    handled outcome rather than something to retry. fetchBranchRefs already
 *    asked this question before any retry logic saw the error.
 * 2. transient network/auth/timeout — retryable everywhere it is asked about,
 *    so an error that also looks like (3) still earns its retries.
 * 3. non-fast-forward push — only ever asked together with (2), so ordering
 *    between them cannot change any call site's answer.
 * 4. everything else.
 */

import { Data } from "effect";
import {
  SandboxCommandFailedError,
  SandboxExecTimeoutError,
} from "../_sandbox_runtime/sandboxErrors";

type GitFailureProps = {
  message: string;
  /** The error the git command actually threw, for rethrow at the edge. */
  cause: unknown;
  /** Present when the failure was a {@link SandboxCommandFailedError}. */
  exitCode?: number;
  /** Combined stdout/stderr, when the sandbox reported it. */
  output?: string;
};

/** Transient: a retry against the same remote can still succeed. */
export class GitNetworkError extends Data.TaggedError(
  "GitNetworkError",
)<GitFailureProps> {}

/** A concurrent writer moved the same branch after our last fetch. */
export class GitNonFastForwardError extends Data.TaggedError(
  "GitNonFastForwardError",
)<GitFailureProps> {}

/**
 * Git exit 128 "couldn't find remote ref" is expected when the requested
 * branch was deleted (e.g. a finished `eva/automation-*` run) or never pushed.
 * Callers must treat this as a handled outcome, not an uncaught command failure.
 */
export class GitMissingRemoteRefError extends Data.TaggedError(
  "GitMissingRemoteRefError",
)<GitFailureProps> {}

/** A git failure with no known handling — surface it. */
export class GitCommandError extends Data.TaggedError(
  "GitCommandError",
)<GitFailureProps> {}

export type GitFailure =
  | GitNetworkError
  | GitNonFastForwardError
  | GitMissingRemoteRefError
  | GitCommandError;

/** Checks if an error message indicates a sandbox execution timeout. */
export function isSandboxExecTimeout(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    (lower.includes("sandbox exec") && lower.includes("timed out")) ||
    lower.includes("command execution timeout")
  );
}

function isMissingRemoteRefMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("couldn't find remote ref") ||
    lower.includes("could not find remote ref")
  );
}

function isRetryableGitNetworkMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    isSandboxExecTimeout(message) ||
    lower.includes("status code 502") ||
    lower.includes("status code 503") ||
    lower.includes("status code 504") ||
    lower.includes("status code 401") ||
    lower.includes("http 401") ||
    lower.includes("authentication failed") ||
    lower.includes("could not read username") ||
    lower.includes("fetch failed") ||
    lower.includes("econnreset") ||
    lower.includes("econnrefused") ||
    lower.includes("etimedout") ||
    lower.includes("socket hang up") ||
    lower.includes("gnutls recv error") ||
    lower.includes("tls connection was non-properly terminated") ||
    lower.includes("remote end hung up unexpectedly") ||
    lower.includes("connection reset by peer") ||
    lower.includes("rpc failed") ||
    lower.includes("early eof") ||
    lower.includes("http/2 stream")
  );
}

/**
 * "stale info" is the `--force-with-lease` variant: the leased sha is no
 * longer the tip.
 */
function isNonFastForwardPushMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("non-fast-forward") ||
    lower.includes("stale info") ||
    lower.includes("fetch first") ||
    (lower.includes("[rejected]") && lower.includes("failed to push"))
  );
}

/** Everything the sandbox told us about the command, when it told us anything. */
function commandDetails(error: unknown): {
  exitCode?: number;
  output?: string;
} {
  if (error instanceof SandboxCommandFailedError) {
    return { exitCode: error.exitCode, output: error.output };
  }
  return {};
}

/** The single entry point for "what kind of git failure is this?". */
export function classifyGitFailure(error: unknown): GitFailure {
  const message = error instanceof Error ? error.message : String(error);
  const props: GitFailureProps = {
    message,
    cause: error,
    ...commandDetails(error),
  };

  if (isMissingRemoteRefMessage(message)) {
    return new GitMissingRemoteRefError(props);
  }
  if (
    error instanceof SandboxExecTimeoutError ||
    isRetryableGitNetworkMessage(message)
  ) {
    return new GitNetworkError(props);
  }
  if (isNonFastForwardPushMessage(message)) {
    return new GitNonFastForwardError(props);
  }
  return new GitCommandError(props);
}
