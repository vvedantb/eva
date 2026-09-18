import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { describe, expect, test } from "vitest";
import {
  retryAfterDelays,
  runPromiseRethrowing,
} from "../convex/_effect/retry";
import { classifyGitFailure } from "../convex/_git/gitErrors";
import {
  SandboxCommandFailedError,
  SandboxExecTimeoutError,
} from "../convex/_sandbox_runtime/sandboxErrors";

/**
 * git failures used to be re-derived from message text at every call site.
 * They are classified once now, so these tests pin two things: the tag each
 * message earns, and that the tags still answer exactly what the old
 * per-site predicates answered.
 */

/** The predicates git.ts carried before classifyGitFailure existed. */
function oldIsSandboxExecTimeout(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    (lower.includes("sandbox exec") && lower.includes("timed out")) ||
    lower.includes("command execution timeout")
  );
}

function oldIsRetryableGitNetworkError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    oldIsSandboxExecTimeout(message) ||
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

function oldIsNonFastForwardPushError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("non-fast-forward") ||
    // The `--force-with-lease` variant: the leased sha is no longer the tip.
    lower.includes("stale info") ||
    lower.includes("fetch first") ||
    (lower.includes("[rejected]") && lower.includes("failed to push"))
  );
}

function oldIsMissingRemoteRefError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("couldn't find remote ref") ||
    lower.includes("could not find remote ref")
  );
}

const NETWORK_MESSAGES = [
  "Sandbox exec (60s) timed out after 60000ms",
  "command execution timeout",
  "fatal: unable to access 'https://github.com/e/e.git/': The requested URL returned error: status code 502",
  "unexpected status code 503 from origin",
  "status code 504 while fetching",
  "status code 401 from github",
  "remote: Invalid username or password (HTTP 401)",
  "fatal: Authentication failed for 'https://github.com/e/e.git/'",
  "fatal: could not read Username for 'https://github.com': No such device or address",
  "TypeError: fetch failed",
  "read ECONNRESET",
  "connect ECONNREFUSED 140.82.121.4:443",
  "connect ETIMEDOUT 140.82.121.4:443",
  "socket hang up",
  "fatal: unable to access: gnutls recv error (-110): The TLS connection was non-properly terminated.",
  "fatal: The TLS connection was non-properly terminated",
  "fatal: the remote end hung up unexpectedly",
  "fatal: Connection reset by peer",
  "error: RPC failed; curl 56 Recv failure",
  "fatal: early EOF",
  "fatal: HTTP/2 stream 5 was not closed cleanly before end of the underlying stream",
];

const NON_FAST_FORWARD_MESSAGES = [
  "! [rejected] main -> main (non-fast-forward)",
  "hint: Updates were rejected because the remote contains work that you do not have locally. Integrate the remote changes before pushing again (fetch first).",
  "! [rejected]        eva/x -> eva/x\nerror: failed to push some refs to 'https://github.com/e/e.git'",
  // A --force-with-lease rejection: only the "stale info" rule catches this
  // one, because git names neither "non-fast-forward" nor "failed to push".
  "! [rejected]        refs/heads/eva/x -> refs/heads/eva/x (stale info)",
];

const MISSING_REMOTE_REF_MESSAGES = [
  "Uncaught SandboxCommandFailedError: Sandbox command failed (exit 128): fatal: couldn't find remote ref eva/automation-dead",
  "fatal: could not find remote ref main",
];

const UNCLASSIFIED_MESSAGES = [
  "Sandbox command failed (exit 1): boom",
  // The exec-timeout rule is scoped to `Sandbox exec (...)`: an SDK-call
  // timeout was never retried as a network blip.
  "Sandbox sdk clone eva/eva (300s) timed out after 315000ms",
  "CONFLICT (content): Merge conflict in packages/backend/convex/schema.ts",
  "error: pathspec 'eva/x' did not match any file(s) known to git",
];

/** A message that hits two old predicates at once — precedence decides. */
const MISSING_REF_AND_NETWORK =
  "fatal: couldn't find remote ref eva/x\nerror: RPC failed; curl 56";

const CORPUS = [
  ...NETWORK_MESSAGES,
  ...NON_FAST_FORWARD_MESSAGES,
  ...MISSING_REMOTE_REF_MESSAGES,
  ...UNCLASSIFIED_MESSAGES,
  MISSING_REF_AND_NETWORK,
];

describe("classifyGitFailure tags each git failure once", () => {
  test.each(NETWORK_MESSAGES)("transient network: %s", (message) => {
    expect(classifyGitFailure(new Error(message))._tag).toBe("GitNetworkError");
  });

  test.each(NON_FAST_FORWARD_MESSAGES)("non-fast-forward: %s", (message) => {
    expect(classifyGitFailure(new Error(message))._tag).toBe(
      "GitNonFastForwardError",
    );
  });

  test.each(MISSING_REMOTE_REF_MESSAGES)(
    "missing remote ref: %s",
    (message) => {
      expect(classifyGitFailure(new Error(message))._tag).toBe(
        "GitMissingRemoteRefError",
      );
    },
  );

  test.each(UNCLASSIFIED_MESSAGES)("plain command failure: %s", (message) => {
    expect(classifyGitFailure(new Error(message))._tag).toBe("GitCommandError");
  });

  test("a missing ref wins over a network signal in the same output", () => {
    // fetchBranchRefs asked the missing-ref question before any retry logic
    // saw the error, so the handled outcome keeps winning.
    expect(classifyGitFailure(new Error(MISSING_REF_AND_NETWORK))._tag).toBe(
      "GitMissingRemoteRefError",
    );
  });

  test("keeps the sandbox command detail for logs", () => {
    const failure = classifyGitFailure(
      new SandboxCommandFailedError({
        message:
          "Sandbox command failed (exit 128): fatal: Authentication failed",
        exitCode: 128,
        output: "fatal: Authentication failed",
      }),
    );
    expect(failure._tag).toBe("GitNetworkError");
    expect(failure.exitCode).toBe(128);
    expect(failure.output).toBe("fatal: Authentication failed");
  });

  test("a typed exec timeout is transient", () => {
    const failure = classifyGitFailure(
      new SandboxExecTimeoutError({
        message: "Sandbox exec (60s) timed out after 60000ms",
      }),
    );
    expect(failure._tag).toBe("GitNetworkError");
  });

  test("a stale lease is retried by the push pipeline's predicate", () => {
    // pushBranchToOrigin leases the push on the remote tip the sync observed,
    // so a commit that lands in between is rejected with "stale info". That
    // must earn another attempt: the retry re-syncs against the new tip.
    const failure = classifyGitFailure(
      new SandboxCommandFailedError({
        message:
          "Sandbox command failed (exit 1): ! [rejected] refs/heads/eva/x -> refs/heads/eva/x (stale info)",
        exitCode: 1,
        output:
          "! [rejected] refs/heads/eva/x -> refs/heads/eva/x (stale info)",
      }),
    );
    expect(failure._tag).toBe("GitNonFastForwardError");
    // Mirrors `isRetryablePushFailure` in git.ts.
    expect(
      failure._tag === "GitNetworkError" ||
        failure._tag === "GitNonFastForwardError",
    ).toBe(true);
  });

  test("a thrown non-Error still classifies", () => {
    const failure = classifyGitFailure("boom");
    expect(failure._tag).toBe("GitCommandError");
    expect(failure.message).toBe("boom");
    expect(failure.exitCode).toBeUndefined();
  });
});

describe("the tags answer what the old per-site predicates answered", () => {
  test.each(CORPUS)("%s", (message) => {
    const tag = classifyGitFailure(new Error(message))._tag;
    const missing = oldIsMissingRemoteRefError(message);
    const network = oldIsRetryableGitNetworkError(message);
    const nonFastForward = oldIsNonFastForwardPushError(message);

    // Precedence: missing ref, then network, then non-fast-forward.
    expect(tag === "GitMissingRemoteRefError").toBe(missing);
    expect(tag === "GitNetworkError").toBe(!missing && network);
    expect(tag === "GitNonFastForwardError").toBe(
      !missing && !network && nonFastForward,
    );
    expect(tag === "GitCommandError").toBe(
      !missing && !network && !nonFastForward,
    );

    // The push site asked "network OR non-fast-forward" as one question.
    expect(tag === "GitNetworkError" || tag === "GitNonFastForwardError").toBe(
      !missing && (network || nonFastForward),
    );
  });
});

describe("the retry edge rethrows the error git actually threw", () => {
  test("runPromiseRethrowing hands back the original object", async () => {
    const original = new SandboxCommandFailedError({
      message:
        "Sandbox command failed (exit 128): fatal: Authentication failed",
      exitCode: 128,
      output: "fatal: Authentication failed",
    });
    const pipeline = Effect.tryPromise({
      try: () => Promise.reject(original),
      catch: classifyGitFailure,
    }).pipe(
      Effect.retry({
        schedule: retryAfterDelays([0]),
        while: (failure) => failure._tag === "GitNetworkError",
      }),
      Effect.mapError((failure) => failure.cause),
    );

    await expect(runPromiseRethrowing(pipeline)).rejects.toBe(original);
    await expect(runPromiseRethrowing(pipeline)).rejects.toBeInstanceOf(
      SandboxCommandFailedError,
    );
  });

  test("both git.ts retry pipelines unwrap before the runner", () => {
    const git = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../convex/_sandbox_runtime/git.ts",
      ),
      "utf8",
    );
    const unwraps = git.match(
      /Effect\.mapError\(\(failure\) => failure\.cause\)/g,
    );
    expect(unwraps).toHaveLength(2);
    expect(git).toContain("catch: classifyGitFailure");
  });
});
