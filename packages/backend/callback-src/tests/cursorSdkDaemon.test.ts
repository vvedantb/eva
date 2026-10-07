import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
          turnId: "turn-47",
          leaseGeneration: 3,
        },
      }),
    ).toEqual({
      lifecycle: "durable",
      prompt: "Fix the upload.",
      attachmentUrls: ["https://example.test/input.png"],
      interactionMode: "default",
      turnLease: { turnId: "turn-47", leaseGeneration: 3 },
    });
  });

  test("keeps legacy claims usable without inventing a lease", () => {
    expect(readClaimedTurn({ prompt: "Legacy turn" })).toEqual({
      lifecycle: "legacy",
      prompt: "Legacy turn",
      attachmentUrls: [],
      interactionMode: "default",
      turnLease: null,
    });
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
        lifecycle: "legacy",
        prompt: "p",
        attachmentUrls: [],
        interactionMode: "default",
        turnLease: null,
      },
      "/tmp/eva-cursor-turn-1.txt",
    );
    expect(env.EVA_MCP_AUTH).toBe("token-123");
    expect(env.EVA_MCP_BASE_URL).toBe("https://example.convex.site");
    expect(env.EVA_CURSOR_TURN_WORKER_PROMPT_FILE).toBe(
      "/tmp/eva-cursor-turn-1.txt",
    );
    expect(env.EVA_CURSOR_TURN_WORKER_LIFECYCLE).toBe("legacy");
    expect(env.EVA_CURSOR_TURN_WORKER_TURN_ID).toBeUndefined();
  });

  test("a durable lease rides the worker env alongside the MCP handoff", () => {
    const env = buildCursorTurnWorkerEnv(
      {},
      {},
      {
        lifecycle: "durable",
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

/**
 * Ordering invariants inside the turn loop. Each of these is a silent failure
 * mode rather than a crash, so they are asserted on the source directly (same
 * approach as daemonFlushCursor.test.ts).
 */
describe("the cursor daemon's per-turn ordering", () => {
  const daemon = readSource("providers/cursorSdkDaemon.ts");

  test("clearing the turn buffer also rewinds the flush cursor", () => {
    expect(daemon).toContain("resetDaemonTurnStreamingState()");
    const reset = functionBody(
      readSource("runtime/state.ts"),
      "export function resetDaemonTurnStreamingState(): void {",
    );
    expect(reset).toContain('callbackState.rawOutput = ""');
    expect(
      reset,
      "a cleared buffer with a live cursor kills flushing",
    ).toContain("callbackState.lastProcessed = 0");
  });

  /**
   * Session prep still runs every claimed turn. Reset per-turn buffers first
   * so leftover output from the previous turn cannot mix with this one.
   */
  test("the state reset runs before session prep, which runs every turn", () => {
    const runTurn = functionBody(
      daemon,
      "async function executeClaimedTurn(turn: ClaimedTurn): Promise<void> {",
    );
    const prepareAt = runTurn.indexOf("prepareCursorSessionState()");
    const attemptAt = runTurn.indexOf("runCursorSdkAttempt(");
    const worker = functionBody(
      daemon,
      "export async function runCursorTurnWorker(): Promise<void> {",
    );
    const resetAt = worker.indexOf("resetTurnState()");
    const leaseAt = worker.indexOf("startClaimedTurn(turn)");
    const executeAt = worker.indexOf("executeClaimedTurn(turn)");
    expect(resetAt, "the worker no longer clears per-turn state").toBeGreaterThan(-1);
    expect(leaseAt, "the worker no longer installs the claimed lease").toBeGreaterThan(-1);
    expect(executeAt, "the worker no longer executes the claimed turn").toBeGreaterThan(-1);
    expect(
      prepareAt,
      "session prep moved out of the turn loop",
    ).toBeGreaterThan(-1);
    expect(attemptAt, "the attempt call moved").toBeGreaterThan(-1);
    expect(resetAt).toBeLessThan(executeAt);
    expect(leaseAt).toBeLessThan(executeAt);
    expect(prepareAt).toBeLessThan(attemptAt);
  });

  test("every terminal path sends the claimed lease back to Convex", () => {
    const finalize = functionBody(
      daemon,
      "async function finalizeTurn(attempt: ProviderAttemptResult): Promise<void> {",
    );
    const failAndExit = functionBody(
      daemon,
      "async function failTurnAndExit(error: string): Promise<never> {",
    );
    const runTurn = functionBody(
      daemon,
      "async function executeClaimedTurn(turn: ClaimedTurn): Promise<void> {",
    );
    expect(finalize).toContain("appendClaimedTurnCompletion(completionArgs)");
    expect(failAndExit).toContain("postClaimedTurnFailureCompletion(");
    expect(runTurn).toContain("appendClaimedTurnCompletion(completionArgs)");
    const worker = functionBody(
      daemon,
      "export async function runCursorTurnWorker(): Promise<void> {",
    );
    expect(worker).toContain("finishClaimedTurn()");
  });

  /**
   * Only `flushStreaming` parses buffered lines into `accumulatedSteps`, so the
   * completion payload has to be built after a drain — and the drain has to
   * precede the mutation that persists it.
   */
  test("the turn is drained before its activity log is read and posted", () => {
    const finalize = functionBody(
      daemon,
      "async function finalizeTurn(attempt: ProviderAttemptResult): Promise<void> {",
    );
    const flushAt = finalize.indexOf("await drainStreamingAndCompleteSteps()");
    const serializeAt = finalize.indexOf("serializeSteps(S.accumulatedSteps)");
    const deliverAt = finalize.indexOf("deliverCompletionWithMedia(");
    expect(flushAt, "the pre-completion drain is gone").toBeGreaterThan(-1);
    expect(serializeAt, "the activity log build moved").toBeGreaterThan(-1);
    expect(deliverAt, "the completion call moved").toBeGreaterThan(-1);
    expect(flushAt).toBeLessThan(serializeAt);
    expect(flushAt).toBeLessThan(deliverAt);
  });

  /**
   * The server finalizes the user-facing message itself when it drains a
   * cancel, so a completion posted afterwards could resolve the NEXT turn's
   * workflow event instead of this already-settled one.
   */
  test("a cancelled turn posts no completion", () => {
    const runTurn = functionBody(
      daemon,
      "async function executeClaimedTurn(turn: ClaimedTurn): Promise<void> {",
    );
    const cancelAt = runTurn.indexOf("if (cancelInFlight) {");
    const finalizeAt = runTurn.indexOf("await finalizeTurn(attempt)");
    expect(cancelAt, "the cancel guard moved").toBeGreaterThan(-1);
    expect(finalizeAt, "the finalize call moved").toBeGreaterThan(-1);
    expect(cancelAt).toBeLessThan(finalizeAt);
  });

  /**
   * Only interactive chats stage turns for a daemon to claim. Jobs (tasks,
   * automations, arena) launch without CLAIM_MUTATION and must keep pushing
   * their prompt through the one-shot attempt path.
   */
  test("interactive cursor chats route to the daemon and jobs stay one-shot", () => {
    const entry = readSource("index.ts");
    const daemonBlock = functionBody(entry, "if (CLAIM_MUTATION) {");
    expect(daemonBlock).toContain('if (PROVIDER === "cursor")');
    expect(daemonBlock).toContain("await runCursorDaemon()");
    expect(entry).toContain(
      "const firstAttempt = await runProviderAttempt(initialSessionMode)",
    );
    const workerAt = entry.indexOf("if (IS_CURSOR_TURN_WORKER)");
    const readyUnlinkAt = entry.indexOf("unlinkSync(READY_FILE)");
    expect(workerAt, "the disposable worker entrypoint is missing").toBeGreaterThan(
      -1,
    );
    expect(
      readyUnlinkAt,
      "the parent ready-marker initialization moved",
    ).toBeGreaterThan(-1);
    expect(
      workerAt,
      "a child must not unlink or take ownership of the parent daemon's marker",
    ).toBeLessThan(readyUnlinkAt);
  });

  /** An idle daemon polling at 50ms burns ~20 Convex mutations/s for nothing. */
  test("the claim poll backs off once nothing is in flight", () => {
    const watcher = daemon.slice(daemon.indexOf("function startClaimWatcher("));
    expect(watcher).toContain("selectClaimPollIntervalMs(");
    expect(watcher).toContain("lastIdleActivityAtMs");
  });

  /**
   * claimPendingTurn clears the staged prompt server-side, so a claim the
   * daemon neither parks nor starts is a prompt the user never gets back. Only
   * a same-turn restage is safe to drop, which is exactly what the shared
   * guard decides — the inline `!turnActive || cancelInFlight` check missed the
   * follow-up-turn case the claude daemon was fixed for (aa9b8e1c1).
   */
  test("a claim that cannot start now is parked through the shared guard", () => {
    const watcher = daemon.slice(daemon.indexOf("function startClaimWatcher("));
    const guardAt = watcher.indexOf("shouldParkClaimedTurn({");
    const parkAt = watcher.indexOf("pendingClaimedTurn = turn;");
    const discardAt = watcher.indexOf("cursor daemon: claim discarded");
    expect(guardAt, "the park guard is gone").toBeGreaterThan(-1);
    expect(parkAt, "the park moved out of the claim handler").toBeGreaterThan(
      guardAt,
    );
    expect(discardAt, "the discard log moved").toBeGreaterThan(parkAt);
    // One park site only: a second, ungated one is the regression itself.
    expect(watcher.split("pendingClaimedTurn = turn;").length - 1).toBe(1);
    expect(watcher).toContain("claimedLeaseTurnId: turn.turnLease?.turnId");
    expect(watcher).toContain("acceptTurn:");
  });

  test("the supervisor spawns one child per claimed turn", () => {
    const supervisorTurn = functionBody(
      daemon,
      "async function runClaimedTurn(turn: ClaimedTurn): Promise<void> {",
    );
    const worker = functionBody(
      daemon,
      "export async function runCursorTurnWorker(): Promise<void> {",
    );
    expect(supervisorTurn).toContain("spawnCursorTurnWorker(turn, promptFile)");
    expect(supervisorTurn).not.toContain("runCursorSdkAttempt(");
    expect(worker).toContain("executeClaimedTurn(turn)");
    expect(worker).toContain("await stopStreamingLoops()");
  });

  test("the disposable worker has enough heap for a long Cursor run", () => {
    const spawnWorker = functionBody(
      daemon,
      "function spawnCursorTurnWorker(\n  turn: ClaimedTurn,\n  promptFile: string,\n): ChildProcess {",
    );
    expect(spawnWorker).toContain(
      "--max-old-space-size=${CURSOR_TURN_WORKER_HEAP_MB}",
    );
    expect(spawnWorker).toContain("writeOomScoreAdj(");
    expect(spawnWorker).toContain("CURSOR_TURN_WORKER_OOM_SCORE");
  });
});

function readSource(relativePath: string): string {
  return stripComments(
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "..", relativePath),
      "utf8",
    ).replaceAll("\r\n", "\n"),
  );
}

/** Slices from a declaration to the next top-level one. */
function functionBody(source: string, declaration: string): string {
  const startAt = source.indexOf(declaration);
  expect(startAt, `${declaration} moved or was renamed`).toBeGreaterThan(-1);
  const rest = source.slice(startAt + declaration.length);
  const nextAt = rest.search(/\n(?:export |async function |function |const )/);
  return declaration + (nextAt < 0 ? rest : rest.slice(0, nextAt));
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
