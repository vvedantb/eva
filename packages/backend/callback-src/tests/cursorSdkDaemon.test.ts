import { describe, expect, test } from "vitest";
import { readClaimedTurn } from "../providers/claimedTurnLifecycle.js";
import {
  buildCursorTurnWorkerEnv,
  buildTurnCompletion,
  cursorTurnWorkerFailureMessage,
} from "../providers/cursorSdkDaemon.js";
import type { ProviderAttemptResult } from "../types.js";

const CLEAN_ATTEMPT: ProviderAttemptResult = {
  code: 0,
  terminatedBySignal: false,
  output: "",
  timedOutForNoOutput: false,
  timedOutForMaxRuntime: false,
  timedOutForFirstEvent: false,
  timedOutForFirstAssistant: false,
  timedOutAfterFirstText: false,
  timedOutForZombie: false,
  toolStallErrorMessage: "",
};

/** The synthetic result line `runCursorSdkAttempt` emits at the end of a turn. */
function resultLine(result: string, isError = false): string {
  return JSON.stringify({ type: "result", is_error: isError, result }) + "\n";
}

/**
 * The daemon runs one claimed turn per loop and then has to decide, from the
 * attempt's outcome alone, what the chat message says. Getting this wrong is
 * invisible in the happy path and disastrous in the tail: a timed-out turn
 * reported as a success posts the agent's half-finished text as its final
 * answer, and a failed turn with no error resolves the workflow with nothing
 * to show. Same rules as the one-shot path in index.ts.
 */
describe("the daemon turn loop reports each turn's outcome", () => {
  test("a clean result is a successful turn with no error", () => {
    expect(
      buildTurnCompletion({
        ...CLEAN_ATTEMPT,
        output: resultLine("Renamed the button."),
      }),
    ).toEqual({ success: true, error: null });
  });

  test("an error result surfaces the agent's own message", () => {
    expect(
      buildTurnCompletion({
        ...CLEAN_ATTEMPT,
        code: 1,
        output: resultLine("rate limit or usage quota exhausted", true),
      }),
    ).toEqual({
      success: false,
      error: "rate limit or usage quota exhausted",
    });
  });

  /**
   * A timeout cancels the run, so `run.wait()` reports a non-finished status and
   * the synthetic result line carries `is_error` — that flag, not the timeout,
   * is what fails the turn. A *clean* result event alongside a timeout flag
   * still counts as a success, exactly as the one-shot path decides it
   * (index.ts: `attemptEndedDueToTimeout && !runSucceededWithResult`), so the
   * two paths cannot disagree about the same attempt.
   */
  test("an interrupted run fails on its result event, not its timeout flag", () => {
    expect(
      buildTurnCompletion({
        ...CLEAN_ATTEMPT,
        code: 1,
        timedOutForMaxRuntime: true,
        output: resultLine("I was still working on", true),
      }),
    ).toEqual({ success: false, error: "I was still working on" });

    expect(
      buildTurnCompletion({
        ...CLEAN_ATTEMPT,
        timedOutForMaxRuntime: true,
        output: resultLine("Renamed the button."),
      }).success,
    ).toBe(true);
  });

  test("a silent turn that never produced a result reports a diagnostic error", () => {
    const outcome = buildTurnCompletion({
      ...CLEAN_ATTEMPT,
      code: 1,
      timedOutForNoOutput: true,
    });
    expect(outcome.success).toBe(false);
    expect(outcome.error).toContain("no stdout");
  });

  test("a turn that dies without a result reports the runtime cap", () => {
    const outcome = buildTurnCompletion({
      ...CLEAN_ATTEMPT,
      code: 1,
      timedOutForMaxRuntime: true,
    });
    expect(outcome.success).toBe(false);
    expect(outcome.error).toContain("terminated after max runtime");
  });
});

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

  test("a prompt without a lease is no claim", () => {
    expect(readClaimedTurn({ prompt: "Turn without a lease" })).toBeNull();
  });
});

describe("the Cursor daemon isolates every turn in a disposable worker", () => {
  test("reports an OOM without taking down the warm supervisor", () => {
    expect(
      cursorTurnWorkerFailureMessage({
        status: "exited",
        code: 134,
        signal: null,
      }),
    ).toContain("ran out of memory");
    expect(
      cursorTurnWorkerFailureMessage({
        status: "exited",
        code: 134,
        signal: null,
      }),
    ).toContain("daemon remained healthy");
  });

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
