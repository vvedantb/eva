import { TURN_MAX_RUNTIME_ERROR } from "@eva/shared/agentTurnLimits";
import { spawn, type ChildProcess } from "child_process";
import { readFileSync, unlinkSync, writeFileSync } from "fs";
import {
  CLAIM_MUTATION,
  CURSOR_TURN_WORKER_LEASE_GENERATION,
  CURSOR_TURN_WORKER_PROMPT_FILE,
  CURSOR_TURN_WORKER_TURN_ID,
  ENTITY_ID,
  MAX_TOTAL_RUNTIME_MS,
  MODEL,
} from "../config.js";
import { evaMcpWorkerHandoffEnv } from "../evaMcp.js";
import { callConvexWithRetry } from "../http/convexClient.js";
import { refreshDaemonGithubTokenFromEnv } from "./githubToken.js";
import { serializeFinalSteps, serializeSteps } from "../parse/stepBudget.js";
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
import {
  prepareCursorSessionState,
  syncCursorStateToPersist,
} from "../session/cursorSession.js";
import type { ProviderAttemptResult } from "../types.js";
import { log } from "../utils.js";
import {
  DAEMON_CLAIM_POLL_TIMING,
  bootWarmDaemon,
  callbackScriptWentStale,
  cleanOwnedMarkers,
  entityMutationArgs,
  selectClaimPollIntervalMs,
  sleep,
  writeOomScoreAdj,
} from "../runtime/daemonProcess.js";
import { DaemonSupervisor } from "../runtime/daemonSupervisor.js";
import { readCancelRequested } from "./claimPendingTurnParse.js";
import {
  appendClaimedTurnCompletion,
  finishClaimedTurn,
  readClaimedTurn,
  routeClaimedTurn,
  startClaimedTurn,
  type ClaimedTurn,
} from "./claimedTurnLifecycle.js";
import { preloadCursorSdk, runCursorSdkAttempt } from "./cursorSdk.js";
import { resolveDaemonPaths } from "./daemonPaths.js";

const IDLE_EXIT_MS = DAEMON_CLAIM_POLL_TIMING.idleExitMs;
const PROMPT_POLL_INTERVAL_MS = DAEMON_CLAIM_POLL_TIMING.fastPollIntervalMs;
const WATCHDOG_TICK_MS = 5000;
const TURN_HARD_TIMEOUT_MS = MAX_TOTAL_RUNTIME_MS + 5 * 60 * 1000;
const CANCEL_SETTLE_TIMEOUT_MS = 30_000;
const CURSOR_TURN_WORKER_FILE_PREFIX = "/tmp/eva-cursor-turn-";
const CURSOR_TURN_WORKER_HEAP_MB = 8192;
const CURSOR_TURN_WORKER_OOM_SCORE = "300";

const daemonPaths = resolveDaemonPaths();

const supervisor = new DaemonSupervisor<ClaimedTurn, { kind: "worker" }>();
let callbackRefreshDeferralLogged = false;
let turnStartedAtMs = 0;
let lastIdleActivityAtMs = Date.now();
let cancelRequestedAtMs = 0;
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

function readCursorTurnWorkerClaim(): ClaimedTurn {
  if (!CURSOR_TURN_WORKER_PROMPT_FILE) {
    throw new Error("Cursor turn worker prompt file is missing");
  }
  const prompt = readFileSync(CURSOR_TURN_WORKER_PROMPT_FILE, "utf8");
  if (!CURSOR_TURN_WORKER_TURN_ID || CURSOR_TURN_WORKER_LEASE_GENERATION <= 0) {
    throw new Error("Cursor turn worker received an invalid durable lease");
  }
  return {
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
    EVA_CURSOR_TURN_WORKER_TURN_ID: turn.turnLease.turnId,
    EVA_CURSOR_TURN_WORKER_LEASE_GENERATION: String(
      turn.turnLease.leaseGeneration,
    ),
  };
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
  if (child.pid !== undefined) {
    writeOomScoreAdj(child.pid, CURSOR_TURN_WORKER_OOM_SCORE);
  }
  return child;
}

function resetTurnState(): void {
  resetDaemonTurnStreamingState();
}

async function finalizeTurn(attempt: ProviderAttemptResult): Promise<void> {
  await drainStreamingAndCompleteSteps();
  const resultEvent = extractResultEvent(attempt.output);
  const { success, error } = resolveProviderAttemptOutcome(
    attempt,
    resultEvent,
  );
  const completionArgs = buildTurnCompletionPayload({
    success,
    result: resultEvent?.result ?? S.rawOutput,
    error,
    activityLog: serializeFinalSteps(
      S.accumulatedSteps,
      resultEvent?.result ?? "",
    ),
    resultEvent,
  });
  appendClaimedTurnCompletion(completionArgs);
  if (await reconcileStreamingAndPersist()) return;
  await deliverCompletionWithMedia(completionArgs);
  syncCursorStateToPersist();
  log("cursor daemon: turn finalized success=" + success);
}

async function failTurnAndExit(error: string): Promise<never> {
  log("cursor daemon: failing turn — " + error);
  persistTurnWork();
  try {
    await postClaimedTurnFailureCompletion({ error, activityLog: null });
  } catch {
  }
  cleanOwnedMarkers(daemonPaths);
  await stopStreamingLoops();
  process.exit(1);
}

function startTurnWatchdog(): void {
  const timer = setInterval(() => {
    const now = Date.now();
    if (supervisor.isCancellationInFlight) {
      if (now - cancelRequestedAtMs > CANCEL_SETTLE_TIMEOUT_MS) {
        log("cursor daemon: cancelled turn did not settle in time — exiting");
        cleanOwnedMarkers(daemonPaths);
        process.exit(1);
      }
      return;
    }
    if (supervisor.phase !== "running") return;
    if (now - turnStartedAtMs > TURN_HARD_TIMEOUT_MS) {
      supervisor.beginFinalizing();
      abortActiveTurn?.();
      void failTurnAndExit(TURN_MAX_RUNTIME_ERROR);
    }
  }, WATCHDOG_TICK_MS);
  timer.unref?.();
}

function startClaimWatcher(): void {
  void (async () => {
    while (!supervisor.isStopping) {
      if (callbackScriptWentStale()) supervisor.noticeRefresh();
      const refreshDecision = supervisor.decideRefresh({
        watchedTurnActive: supervisor.currentTurn !== null,
        backgroundAgentCount: 0,
        sdkMessagePending: false,
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
        supervisor.stop();
        return;
      }
      try {
        const claimed = await callConvexWithRetry(
          "mutation",
          CLAIM_MUTATION ?? "",
          entityMutationArgs({
            model: MODEL,
            acceptTurn:
              supervisor.phase === "idle" && supervisor.pendingClaim === null,
          }),
        );
        if (readCancelRequested(claimed)) handleCancelRequested();
        const turn = readClaimedTurn(claimed);
        if (turn !== null) {
          await materializeTurnAttachments(turn);
          lastIdleActivityAtMs = Date.now();
          routeClaimedTurn({
            turn,
            hasActiveRealTurn: supervisor.currentTurn !== null,
            isCancellationInFlight: supervisor.isCancellationInFlight,
            park: () => supervisor.parkClaim(turn),
            logPrefix: "cursor daemon",
          });
        }
      } catch {
      }
      await sleep(
        selectClaimPollIntervalMs({
          busy: supervisor.hasWork,
          lastIdleActivityAtMs,
        }),
      );
    }
  })();
}

function handleCancelRequested(): void {
  if (supervisor.currentTurn === null) {
    log("cursor daemon: cancelRequested with no active turn — ignored");
    return;
  }
  if (!supervisor.beginCancellation()) return;
  cancelRequestedAtMs = Date.now();
  log("cursor daemon: cancel requested — cancelling the in-flight run");
  abortActiveTurn?.();
}

async function executeClaimedTurn(turn: ClaimedTurn): Promise<void> {
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
    });
    await finalizeTurn(attempt);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("cursor daemon: turn failed — " + message);
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
    }
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
    preloadCursorSdk();
    const [preflightOk] = await Promise.all([
      runPreflightHeartbeat(),
      refreshDaemonGithubTokenFromEnv(),
    ]);
    if (!preflightOk) {
      throw new Error("Cursor turn worker preflight failed");
    }
    startStreamingLoops();
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
  persistTurnWork();
  await postClaimedTurnFailureCompletion({ error, activityLog: null });
}

async function runClaimedTurn(turn: ClaimedTurn): Promise<void> {
  const promptFile =
    CURSOR_TURN_WORKER_FILE_PREFIX +
    String(process.pid) +
    "-" +
    String(Date.now()) +
    ".txt";
  if (!supervisor.startTurn({ kind: "worker" })) {
    throw new Error("cursor daemon: could not enter running state");
  }
  turnStartedAtMs = Date.now();
  log("cursor daemon: starting isolated turn worker");
  try {
    writeFileSync(promptFile, turn.prompt);
    startClaimedTurn(turn);
    const child = spawnCursorTurnWorker(turn, promptFile);
    abortActiveTurn = () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
      }
    };
    const outcome = await waitForCursorTurnWorker(child);
    if (supervisor.isCancellationInFlight) {
      log("cursor daemon: cancelled worker settled — no completion posted");
      return;
    }
    supervisor.beginFinalizing();
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
    abortActiveTurn = null;
    finishClaimedTurn();
    supervisor.settleTurn();
    lastIdleActivityAtMs = Date.now();
    try {
      unlinkSync(promptFile);
    } catch {
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

  await bootWarmDaemon({
    paths: daemonPaths,
    logPrefix: "cursor daemon",
    hasActiveWork: () => supervisor.hasWork,
    onDeposedIdle: () => {
      process.exit(0);
    },
  });

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
    while (!supervisor.isStopping) {
      const turn = supervisor.takeClaim();
      if (turn !== null) {
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
    supervisor.stop();
    cleanOwnedMarkers(daemonPaths);
  }
  process.exit(0);
}
