import { afterEach, describe, expect, test, vi } from "vitest";
import type {
  SandboxExecResult,
  SandboxHandle,
  SandboxState,
} from "../convex/_sandbox/provider";
import {
  execHandle,
  restartUnresponsiveSandbox,
} from "../convex/_sandbox_runtime/helpers";
import {
  SandboxCommandFailedError,
  SandboxExecTimeoutError,
  isSandboxUnresponsiveError,
} from "../convex/_sandbox_runtime/sandboxErrors";

/**
 * Prod (2026-09-01, silver-strategic-buzzard): an OOM-wedged VM the provider
 * still reported `running` answered `echo 1` with exit 137, then stopped
 * answering execs at all. Both had to become "restart this VM" rather than
 * "the sandbox is gone" (fix 53b05d04a).
 *
 * sandboxErrorClassification.test.ts checks the classifier against
 * hand-built errors. This checks the half that test cannot: that `execHandle`
 * really produces those two error shapes, and that the stop+resume recovery
 * refuses a VM that is not running.
 */

/** `execHandle` waits the server timeout plus a 15s client buffer. */
const CLIENT_TIMEOUT_BUFFER_MS = 15_000;

afterEach(() => {
  vi.useRealTimers();
});

function fakeHandle(options: {
  state?: SandboxState;
  exec?: () => Promise<SandboxExecResult>;
}): { handle: SandboxHandle; calls: string[] } {
  const calls: string[] = [];
  const state = options.state ?? "running";
  // Anything this test does not deliberately allow is a fault, not a default:
  // a recovery path that reached for it would be doing something unvouched.
  const outOfScope = (member: string): never => {
    throw new Error(`fake sandbox: ${member} is out of scope for this test`);
  };
  const handle: SandboxHandle = {
    id: "sbx-unresponsive",
    get state() {
      return state;
    },
    errorReason: null,
    classifyForReconcile: () => Promise.resolve("alive"),
    exec: options.exec ?? (() => outOfScope("exec")),
    refresh: async () => {
      calls.push("refresh");
    },
    stop: async () => {
      calls.push("stop");
    },
    start: async () => {
      calls.push("start");
    },
    writeFile: () => outOfScope("writeFile"),
    execDetached: () => outOfScope("execDetached"),
    archive: () => outOfScope("archive"),
    extendTimeout: () => outOfScope("extendTimeout"),
    delete: () => outOfScope("delete"),
    previewUrl: () => outOfScope("previewUrl"),
    createSnapshot: () => outOfScope("createSnapshot"),
    git: {
      branches: () => outOfScope("git.branches"),
      clone: () => outOfScope("git.clone"),
      checkoutBranch: () => outOfScope("git.checkoutBranch"),
    },
  };
  return { handle, calls };
}

describe("execHandle marks a wedged VM as unresponsive", () => {
  test("an exec that never answers rejects with the typed timeout", async () => {
    vi.useFakeTimers();
    const { handle } = fakeHandle({
      // The prod shape: the VM accepts the exec and never replies.
      exec: () => new Promise<SandboxExecResult>(() => {}),
    });

    let caught: Error | undefined;
    const settled = execHandle(handle, "echo 1", 5).then(
      () => undefined,
      (error: Error) => {
        caught = error;
      },
    );
    await vi.advanceTimersByTimeAsync(5_000 + CLIENT_TIMEOUT_BUFFER_MS + 1);
    await settled;

    expect(caught).toBeInstanceOf(SandboxExecTimeoutError);
    // The setup-retry matchers key on this exact wording.
    expect(caught?.message).toContain("Sandbox exec (5s) timed out after");
    expect(isSandboxUnresponsiveError(caught)).toBe(true);
  });

  test("exit 137 on a trivial command carries its code to the classifier", async () => {
    const { handle } = fakeHandle({
      exec: () => Promise.resolve({ exitCode: 137, output: "" }),
    });

    let caught: Error | undefined;
    await execHandle(handle, "echo 1", 5).then(
      () => undefined,
      (error: Error) => {
        caught = error;
      },
    );

    expect(caught).toBeInstanceOf(SandboxCommandFailedError);
    // The classifier reads `.exitCode`; a message-only error would slip past it.
    expect(
      caught instanceof SandboxCommandFailedError ? caught.exitCode : undefined,
    ).toBe(137);
    expect(isSandboxUnresponsiveError(caught)).toBe(true);
  });

  test("an ordinary non-zero exit stays an ordinary failure", async () => {
    const { handle } = fakeHandle({
      exec: () => Promise.resolve({ exitCode: 1, output: "nope" }),
    });

    let caught: Error | undefined;
    await execHandle(handle, "git status", 5).then(
      () => undefined,
      (error: Error) => {
        caught = error;
      },
    );

    expect(caught).toBeInstanceOf(SandboxCommandFailedError);
    expect(isSandboxUnresponsiveError(caught)).toBe(false);
  });
});

describe("the stop+resume recovery refuses a sandbox it did not wedge", () => {
  // A stopped or mid-stop VM was stopped on purpose. Resuming it here would
  // resurrect a sandbox the user just stopped — and bill for it.
  const notRunning: SandboxState[] = [
    "stopped",
    "archived",
    "starting",
    "error",
    "gone",
  ];
  for (const state of notRunning) {
    test(`refuses a ${state} sandbox without stopping it`, async () => {
      const { handle, calls } = fakeHandle({ state });

      await expect(restartUnresponsiveSandbox(handle)).rejects.toThrow(
        /not running/,
      );
      // Recovery must read live state first and then stop, so a refusal has to
      // happen before any lifecycle call.
      expect(calls).toEqual(["refresh"]);
    });
  }
});
