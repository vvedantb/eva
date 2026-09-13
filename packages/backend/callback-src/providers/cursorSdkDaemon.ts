import { spawn, type ChildProcess } from "child_process";
import { readFileSync, unlinkSync, writeFileSync } from "fs";
import {
  CALLBACK_SCRIPT_FP,
  CLAIM_MUTATION,
  CURSOR_TURN_WORKER_LEASE_GENERATION,
  CURSOR_TURN_WORKER_LIFECYCLE,
  CURSOR_TURN_WORKER_PROMPT_FILE,
  CURSOR_TURN_WORKER_TURN_ID,
  DAEMON_OPTS_SIG,
  ENTITY_ID,
  ENTITY_ID_FIELD,
  MAX_TOTAL_RUNTIME_MS,
  MODEL,
} from "../config.js";
import { evaMcpWorkerHandoffEnv } from "../evaMcp.js";
import { callConvexWithRetry } from "../http/convexClient.js";
import { refreshDaemonGithubTokenFromEnv } from "./githubToken.js";
import { serializeSteps } from "../parse/stepBudget.js";
import {
  appendDiagnosticTail,
  buildTurnCompletionPayload,
  deliverCompletionWithMedia,
  drainStreamingAndCompleteSteps,
  extractResultEvent,
  postClaimedTurnFailureCompletion,
  reconcileStreamingAndPersist,
  resolveProviderAttemptOutcome,
} from "../runtime/completion.js";
import {
  runPreflightHeartbeat,
  startStreamingLoops,
  stopStreamingLoops,
} from "../runtime/heartbeats.js";
import {
  callbackState as S,
  resetDaemonTurnStreamingState,
} from "../runtime/state.js";
import { materializeTurnAttachments } from "../runtime/turnAttachments.js";
import { persistTurnWork } from "../runtime/turnPersist.js";
import { getCurrentTurnLease } from "../runtime/turnLease.js";
import {
  prepareCursorSessionState,
  syncCursorStateToPersist,
} from "../session/cursorSession.js";
import type { JsonValue, ProviderAttemptResult } from "../types.js";
import { log } from "../utils.js";
import {
  DAEMON_CLAIM_POLL_TIMING,
  buildEntityMutationArgs,
  callbackBundleWentStale,
  claimDaemonPidfileBoot,
  cleanOwnedDaemonMarkers,
  readPidFromFile,
  selectClaimPollIntervalMs,
  sleep,
  startDaemonDepositionFence,
  writeOomScoreAdj,
} from "../runtime/daemonProcess.js";
import { decideCallbackRefresh } from "./callbackRefresh.js";
import { readCancelRequested } from "./claimPendingTurnParse.js";
import {
  appendClaimedTurnCompletion,
  finishClaimedTurn,
  readClaimedTurn,
  shouldParkClaimedTurn,
  startClaimedTurn,
  type ClaimedTurn,
} from "./claimedTurnLifecycle.js";
import { runCursorSdkAttempt } from "./cursorSdk.js";
import { resolveDaemonPaths } from "./daemonPaths.js";

// Same knobs as the Claude/Codex daemons (see claudeSdkDaemon.ts for the
// reasoning behind each): keep the sandbox warm for a whole work session, poll
// the claim mutation fast while anything is in flight and back off when idle so
// an idle daemon does not burn ~20 mutations/s for turns that never come.
const IDLE_EXIT_MS = DAEMON_CLAIM_POLL_TIMING.idleExitMs;
const FENCE_POLL_INTERVAL_MS = DAEMON_CLAIM_POLL_TIMING.fencePollIntervalMs;
const PROMPT_POLL_INTERVAL_MS = DAEMON_CLAIM_POLL_TIMING.fastPollIntervalMs;
const PROMPT_POLL_IDLE_INTERVAL_MS = DAEMON_CLAIM_POLL_TIMING.idlePollIntervalMs;
const PROMPT_POLL_FAST_WINDOW_MS = DAEMON_CLAIM_POLL_TIMING.fastPollWindowMs;
const WATCHDOG_TICK_MS = 5000;
// Outer bound on one claimed turn. `runCursorSdkAttempt` already enforces the
// runtime cap and the silence kill itself (cancelling the run so the attempt
// returns and reports a failure completion like the one-shot path). This is the
// backstop for the case that machinery cannot cover: a run whose `cancel()` never
// unsticks `wait()`, which would otherwise leave the workflow's awaitEvent
// hanging on an empty "Working…" bubble forever.
const TURN_HARD_TIMEOUT_MS = MAX_TOTAL_RUNTIME_MS + 5 * 60 * 1000;
// Safety net for a cancel whose run never settles (mirrors the Claude daemon's
// CANCEL_SETTLE_TIMEOUT_MS): exit for respawn rather than wedge.
const CANCEL_SETTLE_TIMEOUT_MS = 30_000;
const CURSOR_TURN_WORKER_FILE_PREFIX = "/tmp/eva-cursor-turn-";
// Cursor's SDK can retain several gigabytes of a long tool-heavy run. The
// default V8 heap (~4 GB in production) aborted a healthy 17-minute turn, so
// give the disposable worker room to finish while keeping the supervisor tiny.
const CURSOR_TURN_WORKER_HEAP_MB = 8192;
const CURSOR_TURN_WORKER_OOM_SCORE = "300";

const daemonPaths = resolveDaemonPaths();

let daemonExiting = false;
let callbackRefreshPending = false;
let callbackRefreshDeferralLogged = false;
let pendingClaimedTurn: ClaimedTurn | null = null;
let turnActive = false;
let turnStartedAtMs = 0;
let lastIdleActivityAtMs = Date.now();
/** Set when a claim response drained a cancel for the running turn. */
let cancelInFlight = false;
let cancelRequestedAtMs = 0;
/** Aborts the in-flight Cursor run; registered by the attempt each turn. */
let abortActiveTurn: (() => void) | null = null;

export type CursorTurnWorkerExit =
  | { status: "exited"; code: number | null; signal: NodeJS.Signals | null }
  | { status: "spawn_error"; message: string };


function cursorTurnWorkerEntryPath(): string {
  const entryPath = process.argv[1];
  if (!entryPath) {
    throw new Error(
      "Cursor turn worker could not resolve the callback entrypoint",
    );
  }
  return entryPath;
}

/** Reads the narrow, validated handoff written by the parent Cursor daemon. */
function readCursorTurnWorkerClaim(): ClaimedTurn {
  if (!CURSOR_TURN_WORKER_PROMPT_FILE) {
    throw new Error("Cursor turn worker prompt file is missing");
  }
  const prompt = readFileSync(CURSOR_TURN_WORKER_PROMPT_FILE, "utf8");
  if (CURSOR_TURN_WORKER_LIFECYCLE === "legacy") {
    return {
      lifecycle: "legacy",
      prompt,
      attachmentUrls: [],
      interactionMode: "default",
      turnLease: null,
    };
  }
  if (
    CURSOR_TURN_WORKER_LIFECYCLE !== "durable" ||
    !CURSOR_TURN_WORKER_TURN_ID ||
    CURSOR_TURN_WORKER_LEASE_GENERATION <= 0
  ) {
    throw new Error("Cursor turn worker received an invalid durable lease");
  }
  return {
    lifecycle: "durable",
    prompt,
    attachmentUrls: [],
    interactionMode: "default",
    turnLease: {
      turnId: CURSOR_TURN_WORKER_TURN_ID,
      leaseGeneration: CURSOR_TURN_WORKER_LEASE_GENERATION,
    },
  };
}

export function cursorTurnWorkerFailureMessage(
  outcome: CursorTurnWorkerExit,
): string {
  if (outcome.status === "spawn_error") {
    return "Cursor turn worker could not start: " + outcome.message;
  }
  const exit =
    outcome.signal !== null
      ? `signal ${outcome.signal}`
      : `exit code ${String(outcome.code)}`;
  const oom = outcome.signal === "SIGABRT" || outcome.code === 134;
  return oom
    ? `Cursor turn worker ran out of memory (${exit}). The daemon remained healthy and is ready for the next message.`
    : `Cursor turn worker stopped unexpectedly (${exit}). The daemon remained healthy and is ready for the next message.`;
}

function waitForCursorTurnWorker(
  child: ChildProcess,
): Promise<CursorTurnWorkerExit> {
  return new Promise((resolve) => {
    child.once("error", (error) => {
      resolve({ status: "spawn_error", message: error.message });
    });
    child.once("exit", (code, signal) => {
      resolve({ status: "exited", code, signal });
    });
  });
}

/**
 * The environment for one disposable turn worker. The daemon's own module load
 * scrubbed the eva MCP transport variables from `process.env`, so a plain
 * inherit leaves the worker without the eva MCP server for the whole turn —
 * hand them back explicitly; the worker consumes and scrubs them again at
 * import, before the Cursor SDK spawns any agent tool processes.
 */
export function buildCursorTurnWorkerEnv(
  baseEnv: NodeJS.ProcessEnv,
  mcpHandoffEnv: Record<string, string>,
  turn: ClaimedTurn,
  promptFile: string,
): NodeJS.ProcessEnv {
  const workerEnv: NodeJS.ProcessEnv = {
    ...baseEnv,
    ...mcpHandoffEnv,
    EVA_CURSOR_TURN_WORKER_PROMPT_FILE: promptFile,
    EVA_CURSOR_TURN_WORKER_LIFECYCLE: turn.lifecycle,
  };
  if (turn.lifecycle === "durable") {
    workerEnv.EVA_CURSOR_TURN_WORKER_TURN_ID = turn.turnLease.turnId;
    workerEnv.EVA_CURSOR_TURN_WORKER_LEASE_GENERATION = String(
      turn.turnLease.leaseGeneration,
    );
  } else {
    delete workerEnv.EVA_CURSOR_TURN_WORKER_TURN_ID;
    delete workerEnv.EVA_CURSOR_TURN_WORKER_LEASE_GENERATION;
  }
  return workerEnv;
}

function spawnCursorTurnWorker(
  turn: ClaimedTurn,
  promptFile: string,
): ChildProcess {
  const workerEnv = buildCursorTurnWorkerEnv(
    process.env,
    evaMcpWorkerHandoffEnv,
    turn,
    promptFile,
  );
  const child = spawn(
    process.execPath,
    [
      `--max-old-space-size=${CURSOR_TURN_WORKER_HEAP_MB}`,
      cursorTurnWorkerEntryPath(),
    ],
    {
      cwd: process.cwd(),
      env: workerEnv,
      stdio: "inherit",
    },
  );
  // The parent daemon is deliberately OOM-protected by the launch script, and
  // Linux inherits that score into children. Raise only the disposable worker
  // so host-level pressure sacrifices it before the process that reports the
  // failure and accepts the next message.
  if (child.pid !== undefined) {
    writeOomScoreAdj(child.pid, CURSOR_TURN_WORKER_OOM_SCORE);
  }
  return child;
}


function readDaemonPidFile(): number {
  return readPidFromFile(daemonPaths.pid);
}

function entityMutationArgs(
  fields: Record<string, JsonValue>,
): Record<string, JsonValue> {
  return buildEntityMutationArgs(ENTITY_ID_FIELD, ENTITY_ID, fields);
}

/**
 * True when a newer callback bundle was uploaded while this daemon is running.
 * The daemon then stops claiming, lets active work settle, and exits so the
 * next prewarm spawns with fresh code — a refresh must never lose a turn.
 */
function callbackScriptWentStaleOnDisk(): boolean {
  return callbackBundleWentStale(CALLBACK_SCRIPT_FP);
}

/** Clears the per-turn accumulators so the next turn starts clean. */
function resetTurnState(): void {
  resetDaemonTurnStreamingState();
}

/** Sessions may push git commits; refresh the installation token like the one-shot path. */
async function refreshGithubToken(): Promise<void> {
  await refreshDaemonGithubTokenFromEnv();
}

/**
 * Turn outcome → completion payload, using the same rules as the one-shot path
 * (index.ts): a result event decides success, a timeout demotes it, and a
 * failure without a result event reports the shared diagnostic error message.
 */
export function buildTurnCompletion(attempt: ProviderAttemptResult): {
  success: boolean;
  error: string | null;
} {
  return resolveProviderAttemptOutcome(
    attempt,
    extractResultEvent(attempt.output),
  );
}

/** Reports one finished turn to the chat workflow (mirrors the one-shot completion). */
async function finalizeTurn(attempt: ProviderAttemptResult): Promise<void> {
  // Only flushStreaming parses buffered lines into accumulatedSteps, so the
  // drain has to happen before the activity log is read and before the
  // completion mutation persists it.
  await drainStreamingAndCompleteSteps();
  const resultEvent = extractResultEvent(attempt.output);
  const { success, error } = buildTurnCompletion(attempt);
  const completionArgs = buildTurnCompletionPayload({
    success,
    result: resultEvent?.result ?? S.rawOutput,
    error,
    activityLog: serializeSteps(S.accumulatedSteps),
    resultEvent,
  });
  appendClaimedTurnCompletion(completionArgs);
  // Final streaming reconcile BEFORE completion: the completion mutation
  // finalizes the assistant message and the server may dequeue the next turn
  // straight after, so writing streaming state past that point resurrects this
  // turn's text into the next turn's placeholder.
  if (await reconcileStreamingAndPersist()) return;
  await deliverCompletionWithMedia(completionArgs);
  syncCursorStateToPersist();
  log("cursor daemon: turn finalized success=" + success);
}

/**
 * Posts a failure completion for the running turn (resolving the workflow's
 * awaitEvent so the UI stops spinning) and exits, abandoning a possibly wedged
 * run — the next turn's prewarm boots a fresh daemon.
 */
async function failTurnAndExit(error: string): Promise<never> {
  log("cursor daemon: failing turn — " + error);
  // Durability BEFORE completion, as finalizeTurn does it: a failed turn's
  // committed work is still the user's work and this process is about to exit.
  persistTurnWork();
  try {
    // The disposable worker owns the live steps. A null log tells Convex to
    // preserve the last streaming snapshot when the worker cannot report.
    await postClaimedTurnFailureCompletion({ error, activityLog: null });
  } catch {
    /* best-effort: exit regardless so the daemon does not wedge */
  }
  cleanOwnedMarkers();
  await stopStreamingLoops();
  process.exit(1);
}

/** Removes marker files only while this process still owns the pidfile. */
function cleanOwnedMarkers(): void {
  cleanOwnedDaemonMarkers({
    paths: daemonPaths,
    includeLegacySessionPaths: ENTITY_ID_FIELD === "sessionId",
  });
}

/**
 * Backstops the per-attempt watchdog inside `runCursorSdkAttempt`: a turn that
 * outlives the hard cap (or a cancel that never settles) means that machinery
 * failed, so resolve the turn server-side and exit for a clean respawn.
 */
function startTurnWatchdog(): void {
  const timer = setInterval(() => {
    const now = Date.now();
    if (cancelInFlight) {
      if (now - cancelRequestedAtMs > CANCEL_SETTLE_TIMEOUT_MS) {
        // The server already finalized this turn when it drained the cancel, so
        // posting a completion here could resolve the NEXT turn's event.
        log("cursor daemon: cancelled turn did not settle in time — exiting");
        cleanOwnedMarkers();
        process.exit(1);
      }
      return;
    }
    if (!turnActive) return;
    if (now - turnStartedAtMs > TURN_HARD_TIMEOUT_MS) {
      turnActive = false;
      abortActiveTurn?.();
      void failTurnAndExit("The assistant exceeded the maximum turn runtime.");
    }
  }, WATCHDOG_TICK_MS);
  timer.unref?.();
}

/**
 * Polls the claim mutation: hands staged turns to the run loop, drains cancels
 * for the running turn, and stops claiming once a newer callback bundle lands.
 */
function startClaimWatcher(): void {
  void (async () => {
    while (!daemonExiting) {
      if (callbackScriptWentStaleOnDisk()) callbackRefreshPending = true;
      const refreshDecision = decideCallbackRefresh({
        refreshPending: callbackRefreshPending,
        watchedTurnActive: turnActive,
        daemonTurnActive: false,
        claimedTurnPending: pendingClaimedTurn !== null,
        cancellationInFlight: cancelInFlight,
        backgroundAgentCount: 0,
        sdkMessagePending: false,
        syntheticTurnOpening: false,
      });
      if (refreshDecision.action === "defer") {
        if (!callbackRefreshDeferralLogged) {
          callbackRefreshDeferralLogged = true;
          log(
            "cursor daemon: callback script updated on disk — deferring respawn until active work settles (" +
              refreshDecision.blocker +
              ")",
          );
        }
        await sleep(PROMPT_POLL_INTERVAL_MS);
        continue;
      }
      if (refreshDecision.action === "exit") {
        log(
          "cursor daemon: callback script updated on disk — exiting for respawn",
        );
        daemonExiting = true;
        return;
      }
      try {
        const claimed = await callConvexWithRetry(
          "mutation",
          CLAIM_MUTATION ?? "",
          entityMutationArgs({
            model: MODEL,
            acceptTurn:
              !turnActive && pendingClaimedTurn === null && !cancelInFlight,
          }),
        );
        if (readCancelRequested(claimed)) handleCancelRequested();
        const turn = readClaimedTurn(claimed);
        if (turn !== null) {
          await materializeTurnAttachments(turn);
          lastIdleActivityAtMs = Date.now();
          // claimPendingTurn already cleared the staged turn atomically, so any
          // branch that neither parks nor starts it loses that prompt. The one
          // safe discard is a same-turn restage of the prompt already running;
          // everything else (cancel drains, follow-up sends) parks through the
          // shared guard the claude and codex daemons use.
          const currentLease = getCurrentTurnLease();
          if (
            shouldParkClaimedTurn({
              hasActiveRealTurn: turnActive,
              isCancellationInFlight: cancelInFlight,
              isFinalizing: false,
              currentLeaseTurnId: currentLease?.turnId ?? null,
              claimedLeaseTurnId: turn.turnLease?.turnId ?? null,
            })
          ) {
            if (pendingClaimedTurn === null) {
              pendingClaimedTurn = turn;
            } else {
              log("cursor daemon: duplicate claimed turn ignored");
            }
          } else {
            log(
              "cursor daemon: claim discarded while real turn active (prompt lost; pendingTurn was already cleared)",
            );
          }
        }
      } catch {
        /* retry on the next poll */
      }
      const busy = turnActive || pendingClaimedTurn !== null || cancelInFlight;
      await sleep(
        selectClaimPollIntervalMs({
          busy,
          lastIdleActivityAtMs,
        }),
      );
    }
  })();
}

/**
 * Handles a drained `cancelRequested` flag: cancels the in-flight Cursor run so
 * the attempt returns, and marks the turn as server-finalized so no completion
 * is posted for it. Idempotent; a stale flag with no running turn is ignored.
 */
function handleCancelRequested(): void {
  if (!turnActive) {
    log("cursor daemon: cancelRequested with no active turn — ignored");
    return;
  }
  if (cancelInFlight) return;
  cancelInFlight = true;
  cancelRequestedAtMs = Date.now();
  log("cursor daemon: cancel requested — cancelling the in-flight run");
  abortActiveTurn?.();
}

/** Runs a claimed turn inside the disposable Cursor worker process. */
async function executeClaimedTurn(turn: ClaimedTurn): Promise<void> {
  turnActive = true;
  turnStartedAtMs = Date.now();
  abortActiveTurn = null;
  log("cursor turn worker: turn started");
  try {
    if (!process.env.CURSOR_API_KEY?.trim()) {
      throw new Error(
        "CURSOR_API_KEY is missing in the sandbox environment — the Cursor SDK cannot authenticate",
      );
    }
    const sessionMode = prepareCursorSessionState();
    const attempt = await runCursorSdkAttempt(sessionMode, {
      promptText: turn.prompt,
      onAbortHandle: (abort) => {
        abortActiveTurn = abort;
        // A cancel that arrived while the agent was still being created has no
        // run to stop yet; apply it as soon as the handle exists.
        if (cancelInFlight) abort();
      },
    });
    turnActive = false;
    if (cancelInFlight) {
      log("cursor daemon: cancelled turn settled — no completion posted");
      return;
    }
    await finalizeTurn(attempt);
  } catch (error) {
    turnActive = false;
    const message = error instanceof Error ? error.message : String(error);
    log("cursor daemon: turn failed — " + message);
    if (cancelInFlight) return;
    try {
      await drainStreamingAndCompleteSteps();
      if (await reconcileStreamingAndPersist()) return;
      const completionArgs = buildTurnCompletionPayload({
        success: false,
        result: null,
        error: appendDiagnosticTail(message),
        activityLog: serializeSteps(S.accumulatedSteps),
      });
      appendClaimedTurnCompletion(completionArgs);
      await deliverCompletionWithMedia(completionArgs);
    } catch {
      /* best-effort — the watchdog and stall recovery own the rest */
    }
  } finally {
    turnActive = false;
    abortActiveTurn = null;
    cancelInFlight = false;
    lastIdleActivityAtMs = Date.now();
  }
}

/**
 * Child entrypoint: one process, one turn. The persisted SDK store still
 * resumes the same Cursor agent, while all SDK heap dies with this process.
 */
export async function runCursorTurnWorker(): Promise<void> {
  const turn = readCursorTurnWorkerClaim();
  resetTurnState();
  startClaimedTurn(turn);
  try {
    const preflightOk = await runPreflightHeartbeat();
    if (!preflightOk) {
      throw new Error("Cursor turn worker preflight failed");
    }
    startStreamingLoops();
    await refreshGithubToken();
    await executeClaimedTurn(turn);
  } finally {
    await stopStreamingLoops();
    finishClaimedTurn();
  }
}

async function reportCursorTurnWorkerFailure(
  outcome: CursorTurnWorkerExit,
): Promise<void> {
  const error = cursorTurnWorkerFailureMessage(outcome);
  log("cursor daemon: " + error);
  // The worker died too hard to publish its own work, so the supervisor does it
  // from the same working tree — durability before the failure completion.
  persistTurnWork();
  // Convex falls back to the last streamed activity so a hard worker crash
  // cannot erase the reasoning/tools the user already saw.
  await postClaimedTurnFailureCompletion({ error, activityLog: null });
}

/**
 * The warm daemon only supervises a disposable worker. It retains cancellation
 * and claim polling without retaining the Cursor SDK's heap between messages.
 */
async function runClaimedTurn(turn: ClaimedTurn): Promise<void> {
  const promptFile =
    CURSOR_TURN_WORKER_FILE_PREFIX +
    String(process.pid) +
    "-" +
    String(Date.now()) +
    ".txt";
  writeFileSync(promptFile, turn.prompt);
  startClaimedTurn(turn);
  turnActive = true;
  turnStartedAtMs = Date.now();
  log("cursor daemon: starting isolated turn worker");
  try {
    const child = spawnCursorTurnWorker(turn, promptFile);
    abortActiveTurn = () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
      }
    };
    const outcome = await waitForCursorTurnWorker(child);
    turnActive = false;
    if (cancelInFlight) {
      log("cursor daemon: cancelled worker settled — no completion posted");
      return;
    }
    if (
      outcome.status === "exited" &&
      outcome.code === 0 &&
      outcome.signal === null
    ) {
      log("cursor daemon: isolated turn worker finished");
      return;
    }
    try {
      await reportCursorTurnWorkerFailure(outcome);
    } catch (error) {
      log(
        "cursor daemon: worker failure completion could not be delivered — " +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  } finally {
    turnActive = false;
    abortActiveTurn = null;
    cancelInFlight = false;
    finishClaimedTurn();
    lastIdleActivityAtMs = Date.now();
    try {
      unlinkSync(promptFile);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Persistent warm-session supervisor for Cursor. It claims turns and handles
 * cancellation, but each turn executes in a disposable child process so the
 * SDK cannot retain heap between messages. Jobs (no CLAIM_MUTATION) never
 * reach this and stay on the one-shot path in index.ts.
 */
export async function runCursorDaemon(): Promise<void> {
  if (!CLAIM_MUTATION) {
    log("cursor daemon: CLAIM_MUTATION env is required in daemon mode");
    process.exit(1);
  }

  // Single-daemon fence, part 1 (boot claim): a live rival owning the pidfile
  // wins, and this process exits without touching its markers.
  const bootClaim = claimDaemonPidfileBoot({
    paths: daemonPaths,
    entityId: ENTITY_ID ?? "",
    optsSig: DAEMON_OPTS_SIG,
  });
  if (bootClaim.status === "rival_alive") {
    log(
      `cursor daemon: rival daemon pid=${bootClaim.rivalPid} already owns ${daemonPaths.pid} — exiting`,
    );
    process.exit(0);
  }

  // Single-daemon fence, part 2: a launch racing past the boot claim (or an
  // opts-mismatch respawn) overwrites the pidfile; the deposed daemon must exit
  // or it double-claims turns and flip-flops the shared streaming row. Deferred
  // while a turn is running so work is never killed mid-flight.
  startDaemonDepositionFence({
    readOwnerPid: readDaemonPidFile,
    hasActiveWork: () => turnActive,
    pollIntervalMs: FENCE_POLL_INTERVAL_MS,
    log,
    logPrefix: "cursor daemon",
    onDeposedIdle: () => {
      process.exit(0);
    },
  });

  const preflightOk = await runPreflightHeartbeat();
  if (!preflightOk) {
    log("cursor daemon: preflight failed");
    process.exit(1);
  }
  await refreshGithubToken();

  log(
    "runCursorDaemon started (entityId=" +
      (ENTITY_ID ?? "none") +
      ", model=" +
      MODEL +
      ")",
  );
  startTurnWatchdog();
  startClaimWatcher();

  try {
    while (!daemonExiting) {
      if (pendingClaimedTurn !== null) {
        const turn = pendingClaimedTurn;
        pendingClaimedTurn = null;
        await runClaimedTurn(turn);
        continue;
      }
      if (Date.now() - lastIdleActivityAtMs > IDLE_EXIT_MS) {
        log("cursor daemon: idle timeout — exiting");
        break;
      }
      await sleep(PROMPT_POLL_INTERVAL_MS);
    }
  } finally {
    daemonExiting = true;
    cleanOwnedMarkers();
  }
  process.exit(0);
}
