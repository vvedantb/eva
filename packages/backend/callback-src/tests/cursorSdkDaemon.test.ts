import { describe, expect, test } from "bun:test";
import { readClaimedTurn } from "../providers/claimedTurnLifecycle.js";
import {
  buildCursorTurnWorkerEnv,
  cursorTurnWorkerFailureMessage,
  type CursorTurnWorkerExit,
} from "../providers/cursorSdkDaemon.js";

describe("the daemon preserves durable ownership from the claim response", () => {
  test("reads an enveloped turn lease with the prompt and attachments", () => {
    expect(
      readClaimedTurn({
        status: "success",
        value: {
          prompt: "Fix the upload.",
          attachmentUrls: ["https://example.test/input.png", 42],
          turnLifecycle: "durable",
          turnId: "turn-47",
          leaseGeneration: 3,
        },
      }),
    ).toEqual({
      prompt: "Fix the upload.",
      attachmentUrls: ["https://example.test/input.png"],
      interactionMode: "default",
      turnLease: { turnId: "turn-47", leaseGeneration: 3 },
    });
  });
});

describe("the Cursor daemon isolates every turn in a disposable worker", () => {
  /** V8 aborts on heap exhaustion: exit code 134 or a direct SIGABRT. */
  test.each([
    [
      { status: "exited", code: 134, signal: null },
      "Cursor turn worker ran out of memory (exit code 134). The daemon remained healthy and is ready for the next message.",
    ],
    [
      { status: "exited", code: null, signal: "SIGABRT" },
      "Cursor turn worker ran out of memory (signal SIGABRT). The daemon remained healthy and is ready for the next message.",
    ],
    [
      { status: "exited", code: 1, signal: null },
      "Cursor turn worker stopped unexpectedly (exit code 1). The daemon remained healthy and is ready for the next message.",
    ],
  ] satisfies [CursorTurnWorkerExit, string][])(
    "names an OOM apart from other worker exits (%o)",
    (outcome, message) => {
      expect(cursorTurnWorkerFailureMessage(outcome)).toBe(message);
    },
  );

  test("reports spawn failures distinctly", () => {
    expect(
      cursorTurnWorkerFailureMessage({
        status: "spawn_error",
        message: "ENOENT",
      }),
    ).toBe("Cursor turn worker could not start: ENOENT");
  });

  /**
   * The daemon scrubbed EVA_MCP_AUTH/EVA_MCP_BASE_URL from its own env at
   * import, so a plain env inherit ships the worker without the eva MCP
   * server — every Cursor turn then silently loses all eva MCP tools.
   */
  test("hands the scrubbed eva MCP credentials back to the turn worker", () => {
    const env = buildCursorTurnWorkerEnv(
      { PATH: "/usr/bin" },
      {
        EVA_MCP_AUTH: "token-123",
        EVA_MCP_BASE_URL: "https://example.convex.site",
      },
      {
        prompt: "p",
        attachmentUrls: [],
        interactionMode: "default",
        turnLease: { turnId: "turn-1", leaseGeneration: 1 },
      },
      "/tmp/eva-cursor-turn-1.txt",
    );
    expect(env.EVA_MCP_AUTH).toBe("token-123");
    expect(env.EVA_MCP_BASE_URL).toBe("https://example.convex.site");
    expect(env.EVA_CURSOR_TURN_WORKER_PROMPT_FILE).toBe(
      "/tmp/eva-cursor-turn-1.txt",
    );
    expect(env.EVA_CURSOR_TURN_WORKER_TURN_ID).toBe("turn-1");
  });

  test("a durable lease rides the worker env alongside the MCP handoff", () => {
    const env = buildCursorTurnWorkerEnv(
      {},
      {},
      {
        prompt: "p",
        attachmentUrls: [],
        interactionMode: "default",
        turnLease: { turnId: "turn-1", leaseGeneration: 3 },
      },
      "/tmp/eva-cursor-turn-2.txt",
    );
    expect(env.EVA_CURSOR_TURN_WORKER_TURN_ID).toBe("turn-1");
    expect(env.EVA_CURSOR_TURN_WORKER_LEASE_GENERATION).toBe("3");
    expect(env.EVA_MCP_AUTH).toBeUndefined();
  });
});
