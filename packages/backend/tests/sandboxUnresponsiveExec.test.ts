import { afterEach, describe, expect, test, vi } from "bun:test";
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
      exec: () => new Promise<SandboxExecResult>(() => {}),
    });

    let caught: Error | undefined;
    const settled = execHandle(handle, "echo 1", 5).then(
      () => undefined,
      (error: Error) => {
        caught = error;
      },
    );
    vi.advanceTimersByTime(5_000 + CLIENT_TIMEOUT_BUFFER_MS + 1);
    await settled;

    expect(caught).toBeInstanceOf(SandboxExecTimeoutError);
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
      expect(calls).toEqual(["refresh"]);
    });
  }
});
