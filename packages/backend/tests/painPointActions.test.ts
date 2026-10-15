import { ConvexError } from "convex/values";
import { Effect } from "effect";
import { describe, expect, test, vi } from "vitest";
import { convexErrorPayloadSchema } from "@eva/shared/convexErrorPayload";
import { runActionEffect } from "../convex/_effect/action";
import { githubRequest } from "../convex/_github/githubErrors";
import { classifyPrActionFailure } from "../convex/_github/prErrors";
import {
  SANDBOX_NOT_RUNNING_MESSAGE,
  requireRunningSandbox,
} from "../convex/_pty/ptyErrors";
import {
  PreviewProxyFailed,
  previewProxyFailed,
  visiblePreviewFailure,
} from "../convex/_sandbox_runtime/previewErrors";

/**
 * The three actions users actually hit in prod whose message never reached
 * them: production Convex redacts a thrown `Error` to "Server Error", so
 * "Sandbox is not running", the proxy port and reason, and GitHub's own review
 * rejection all arrived as a shrug. Each rule below pins the message text AND
 * the fact that it crosses as `ConvexError` data — the two halves of the fix.
 */

/** Silences the runner's log line. */
function captureErrorLog() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

/** What the browser can read off a failed action: the payload, or nothing. */
async function crossedPayload(
  effect: Effect.Effect<unknown, { _tag: string; message: string }>,
): Promise<unknown> {
  const log = captureErrorLog();
  try {
    const thrown = await runActionEffect(effect, "pain point").catch(
      (error: unknown) => error,
    );
    return convexErrorPayloadSchema.parse(
      thrown instanceof ConvexError ? thrown.data : undefined,
    );
  } finally {
    log.mockRestore();
  }
}

/** Octokit's `RequestError`: an `Error` with the status attached. */
class RequestErrorLike extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

describe("connectPty refuses a stopped sandbox visibly", () => {
  test("a stopping/closed owner fails with the terminal's own wording", async () => {
    await expect(
      crossedPayload(requireRunningSandbox({ isStoppingOrClosed: true })),
    ).resolves.toEqual({
      tag: "SandboxNotRunning",
      message: "Sandbox is not running. Start the sandbox first.",
    });
  });

  test("the message the user reads is the one the action has always thrown", () => {
    expect(SANDBOX_NOT_RUNNING_MESSAGE).toBe(
      "Sandbox is not running. Start the sandbox first.",
    );
  });

  test("a running owner passes straight through", async () => {
    const owner = { isStoppingOrClosed: false, sandboxId: "sbx_1" };
    await expect(
      runActionEffect(requireRunningSandbox(owner), "pain point"),
    ).resolves.toBe(owner);
  });
});

describe("getPreviewUrl reports a proxy that would not start", () => {
  test("the port and the reason survive the wire", async () => {
    await expect(
      crossedPayload(
        visiblePreviewFailure(() =>
          Promise.reject(
            previewProxyFailed(3000, "sandbox exec timed out", undefined),
          ),
        ),
      ),
    ).resolves.toEqual({
      tag: "PreviewProxyFailed",
      message:
        "Vercel preview proxy failed to start on port 3000: sandbox exec timed out",
    });
  });

  test("the failure keeps what it was classified from", () => {
    const cause = new Error("sandbox exec timed out");
    expect(previewProxyFailed(3000, cause.message, cause).cause).toBe(cause);
  });

  /**
   * Everything else `getPreviewUrl` does — auth, sandbox access, credentials,
   * the handle, signing — is an outage or a bug, so it must stay a defect and
   * stay redacted rather than telling the user about eva's internals.
   */
  test("any other failure stays a defect", async () => {
    const defect = new Error("Not authenticated");
    const thrown = await runActionEffect(
      visiblePreviewFailure(() => Promise.reject(defect)),
      "pain point",
    ).catch((error: unknown) => error);
    expect(thrown).toBe(defect);
    expect(thrown).not.toBeInstanceOf(ConvexError);
  });

  test("a success is handed back untouched", async () => {
    const value = { url: "https://sandbox.example/", port: 3000, ready: true };
    await expect(
      runActionEffect(
        visiblePreviewFailure(() => Promise.resolve(value)),
        "pain point",
      ),
    ).resolves.toBe(value);
  });

  test("only the proxy failure is visible, by tag", () => {
    expect(previewProxyFailed(8080, "boom", undefined)).toBeInstanceOf(
      PreviewProxyFailed,
    );
    expect(previewProxyFailed(8080, "boom", undefined)._tag).toBe(
      "PreviewProxyFailed",
    );
  });
});

describe("submitPrReview shows GitHub's own rejection", () => {
  /** The prod case: 3 users approved their own PR and saw "Server Error". */
  test("a 422 self-approval reaches the dialog with GitHub's wording", async () => {
    await expect(
      crossedPayload(
        githubRequest(() =>
          Promise.reject(
            new RequestErrorLike(
              "Review Can not approve your own pull request",
              422,
            ),
          ),
        ).pipe(Effect.mapError(classifyPrActionFailure)),
      ),
    ).resolves.toEqual({
      tag: "UnexpectedActionFailure",
      message: "Review Can not approve your own pull request",
    });
  });

  /**
   * A failure the classifier does have a tag for keeps it, so the web can
   * branch on the kind of failure instead of matching message text.
   */
  test("a classified GitHub failure keeps its own tag", async () => {
    await expect(
      crossedPayload(
        githubRequest(() =>
          Promise.reject(new RequestErrorLike("Bad credentials", 401)),
        ).pipe(Effect.mapError(classifyPrActionFailure)),
      ),
    ).resolves.toEqual({
      tag: "GitHubUnauthorized",
      message: "Bad credentials",
    });
  });

  test("the review payload is returned untouched on success", async () => {
    const review = {
      data: { id: 7, html_url: "https://x/1", state: "APPROVED" },
    };
    await expect(
      runActionEffect(
        githubRequest(() => Promise.resolve(review)).pipe(
          Effect.mapError(classifyPrActionFailure),
        ),
        "pain point",
      ),
    ).resolves.toBe(review);
  });
});
