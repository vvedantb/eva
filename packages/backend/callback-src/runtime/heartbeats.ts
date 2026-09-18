import {
  HEARTBEAT_ABSOLUTE_MAX_FAILURES,
  HEARTBEAT_FATAL_BURST,
  HEARTBEAT_FATAL_SLOW_COUNT,
  HEARTBEAT_FATAL_SLOW_WINDOW_MS,
  CLAIM_MUTATION,
  READY_FILE,
  SCRIPT_STARTED_AT,
  STREAMING_ENTITY_ID,
} from "../config.js";
import {
  callStreamingHeartbeat,
  callStreamingHeartbeatTouch,
} from "../http/convexClient.js";
import {
  markLastComplete,
  parseStreamEvent,
  updateThinkingStep,
} from "../parse/canonical.js";
import { buildClaudeStartupStep } from "../session/claudeSession.js";
import { log } from "../utils.js";
import { writeFileSync } from "fs";
import { freemem, loadavg } from "os";
import { callbackState as S } from "./state.js";
import { flushBackgroundShellQueue } from "./backgroundShells.js";
import { serializeSteps } from "../parse/stepBudget.js";
import {
  EVENT_LOOP_STALL_LOG_MS,
  measureTickStallMs,
} from "./eventLoopStall.js";
import { persistTurnWork } from "./turnPersist.js";
import {
  canSendTurnHeartbeat,
  decideTurnLeaseExit,
  getLeaseTerminalReason,
  getTurnOwnership,
} from "./turnLease.js";

let flushInterval: ReturnType<typeof setInterval> | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let activeFlush: Promise<void> | null = null;
let flushRequested = false;

function ownsHeartbeatLease(): boolean {
  return canSendTurnHeartbeat({
    claimMutation: CLAIM_MUTATION,
    ownership: getTurnOwnership(),
  });
}

export function buildStreamingPayload(): string {
  return serializeSteps(
    S.transientThinkingStep
      ? [...S.accumulatedSteps, S.transientThinkingStep]
      : S.accumulatedSteps,
  );
}

function markHeartbeatSuccess(payload: string): void {
  S.lastSentPayload = payload;
  S.lastSentContent = S.currentStreamedContent;
  S.lastStreamingSentAt = Date.now();
  if (S.consecutiveHeartbeatFailures > 0) {
    console.error(
      "Heartbeat recovered after " +
        S.consecutiveHeartbeatFailures +
        " consecutive failures",
    );
  }
  S.consecutiveHeartbeatFailures = 0;
  S.heartbeatFailureStreakStartedAt = 0;
}

function noteHeartbeatFailure(error: Error | string): void {
  const message = error instanceof Error ? error.message : String(error);
  S.consecutiveHeartbeatFailures++;
  if (S.consecutiveHeartbeatFailures === 1) {
    S.heartbeatFailureStreakStartedAt = Date.now();
  }
  log(
    "Heartbeat failed (consecutive: " +
      S.consecutiveHeartbeatFailures +
      "): " +
      message,
  );
  if (
    S.consecutiveHeartbeatFailures === 2 ||
    S.consecutiveHeartbeatFailures === 4
  ) {
    log(
      "[streaming-heartbeat] degraded: " +
        S.consecutiveHeartbeatFailures +
        " consecutive post-retry failures (burstFatal>=" +
        HEARTBEAT_FATAL_BURST +
        " or slowFatal>=" +
        HEARTBEAT_FATAL_SLOW_COUNT +
        " over " +
        HEARTBEAT_FATAL_SLOW_WINDOW_MS +
        "ms)",
    );
  }
  if (S.fatalHeartbeatErrorMessage) {
    return;
  }
  const streakAge =
    S.heartbeatFailureStreakStartedAt > 0
      ? Date.now() - S.heartbeatFailureStreakStartedAt
      : 0;
  const burstFatal = S.consecutiveHeartbeatFailures >= HEARTBEAT_FATAL_BURST;
  const slowFatal =
    S.consecutiveHeartbeatFailures >= HEARTBEAT_FATAL_SLOW_COUNT &&
    streakAge >= HEARTBEAT_FATAL_SLOW_WINDOW_MS;
  const absoluteFatal =
    S.consecutiveHeartbeatFailures >= HEARTBEAT_ABSOLUTE_MAX_FAILURES;
  if (burstFatal || slowFatal || absoluteFatal) {
    S.fatalHeartbeatErrorMessage =
      "Lost streaming heartbeat after " +
      String(S.consecutiveHeartbeatFailures) +
      " consecutive failures: " +
      message;
    // Setting the flag is the whole job: with no CLI subprocess left to kill,
    // each SDK runner's watchdog picks this up on its next tick and aborts the
    // turn through its own SDK cancellation path.
    log(S.fatalHeartbeatErrorMessage);
  }
}

async function sendStreamingHeartbeatUpdate(payload: string): Promise<boolean> {
  if (!ownsHeartbeatLease()) return true;
  try {
    await callStreamingHeartbeat(
      STREAMING_ENTITY_ID ?? "",
      payload,
      S.currentStreamedContent,
      S.pendingQuestionData || undefined,
    );
    markHeartbeatSuccess(payload);
    return true;
  } catch (error) {
    noteHeartbeatFailure(error instanceof Error ? error : String(error));
    return false;
  }
}

async function flushStreamingPass(): Promise<void> {
  if (!ownsHeartbeatLease()) {
    void flushBackgroundShellQueue();
    return;
  }

  let hasNew = false;
  if (S.rawOutput.length > S.lastProcessed) {
    const pending = S.rawOutput.slice(S.lastProcessed);
    const lastNewline = pending.lastIndexOf("\n");
    if (lastNewline >= 0) {
      S.lastProcessed += lastNewline + 1;
      for (const line of pending.slice(0, lastNewline).split("\n")) {
        const clean = line.trim();
        if (!clean) continue;
        if (parseStreamEvent(clean)) {
          hasNew = true;
          S.parsedStreamEventCount++;
        }
      }
    }
  }

  const payload = buildStreamingPayload();
  const contentChanged = S.currentStreamedContent !== S.lastSentContent;
  const activityChanged = payload !== S.lastSentPayload;
  if (hasNew || contentChanged || activityChanged) {
    await sendStreamingHeartbeatUpdate(payload);
  } else if (
    S.inFlightToolUses > 0 &&
    Date.now() - S.lastStreamingSentAt > 15_000
  ) {
    const entityId = STREAMING_ENTITY_ID ?? "";
    if (entityId) {
      await callStreamingHeartbeatTouch(entityId);
      S.lastStreamingSentAt = Date.now();
    }
  }

  void flushBackgroundShellQueue();
}

async function drainRequestedFlushes(): Promise<void> {
  S.flushInProgress = true;
  try {
    do {
      flushRequested = false;
      await flushStreamingPass();
    } while (flushRequested);
  } finally {
    S.flushInProgress = false;
  }
}

/**
 * Coalesces concurrent parser flushes into one drain that every caller can
 * await. A result event can arrive while an earlier heartbeat is still in
 * flight; returning early in that case let finalization serialize the turn
 * before its last tool events were parsed, and live updates could disappear.
 */
export function flushStreaming(): Promise<void> {
  flushRequested = true;
  if (activeFlush) return activeFlush;

  const flush = drainRequestedFlushes();
  activeFlush = flush;
  const clearActiveFlush = () => {
    if (activeFlush === flush) activeFlush = null;
  };
  void flush.then(clearActiveFlush, clearActiveFlush);
  return flush;
}

const PING_STUCK_MS = 45_000;

async function heartbeatPing(): Promise<void> {
  if (!ownsHeartbeatLease()) return;
  if (
    S.pingInProgress &&
    S.pingStartedAt > 0 &&
    Date.now() - S.pingStartedAt < PING_STUCK_MS
  ) {
    return;
  }
  if (S.pingInProgress) {
    console.warn(
      "[streaming-heartbeat] pingInProgress stuck past timeout, resetting",
    );
    S.pingInProgress = false;
  }
  if (Date.now() - S.lastStreamingSentAt < 10000) return;
  S.pingInProgress = true;
  S.pingStartedAt = Date.now();
  try {
    if (S.waitingForFirstAssistantEvent) {
      const startupStep = buildClaudeStartupStep();
      updateThinkingStep(startupStep.label, startupStep.detail);
      await sendStreamingHeartbeatUpdate(buildStreamingPayload());
      return;
    }
    if (S.transientThinkingStep) {
      await sendStreamingHeartbeatUpdate(buildStreamingPayload());
      return;
    }
    const entityId = STREAMING_ENTITY_ID ?? "";
    if (!entityId) return;
    // Touch-only ping: keep watchdog heartbeats alive during long silent tool
    // runs (e.g. `pnpm tsc`) without POSTing the full accumulatedSteps JSON.
    await callStreamingHeartbeatTouch(entityId);
    S.lastStreamingSentAt = Date.now();
    S.consecutiveHeartbeatFailures = 0;
    S.heartbeatFailureStreakStartedAt = 0;
  } catch (error) {
    noteHeartbeatFailure(error instanceof Error ? error : String(error));
  } finally {
    S.pingInProgress = false;
    S.pingStartedAt = 0;
  }
}

async function initialHeartbeat(): Promise<void> {
  if (!ownsHeartbeatLease()) {
    log("initialHeartbeat skipped: daemon is waiting to claim a turn");
    return;
  }
  const startedAt = Date.now();
  let attempt = 0;
  while (attempt <= 1) {
    try {
      const payload = buildStreamingPayload();
      await callStreamingHeartbeat(
        STREAMING_ENTITY_ID ?? "",
        payload,
        S.currentStreamedContent,
        S.pendingQuestionData || undefined,
      );
      markHeartbeatSuccess(payload);
      log(
        "initialHeartbeat succeeded in " +
          String(Date.now() - startedAt) +
          "ms attempts=" +
          String(attempt + 1),
      );
      return;
    } catch (e) {
      attempt++;
      if (attempt > 1) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

const HEARTBEAT_TICK_MS = 10_000;
let lastHeartbeatTickAt = 0;

/**
 * A starved process (VM swap thrash, CPU starvation) cannot heartbeat, so its
 * lease expires server-side and the turn is finalised as stalled. This line is
 * the daemon-side evidence that the process was frozen rather than dead.
 */
function logEventLoopStall(now: number): void {
  const stalledMs = measureTickStallMs({
    previousTickAt: lastHeartbeatTickAt,
    now,
    intervalMs: HEARTBEAT_TICK_MS,
    toleranceMs: EVENT_LOOP_STALL_LOG_MS,
  });
  lastHeartbeatTickAt = now;
  if (stalledMs === 0) return;
  const mb = (bytes: number): string => String(Math.round(bytes / 1024 / 1024));
  const memory = process.memoryUsage();
  log(
    "event loop stalled for " +
      stalledMs +
      "ms (rss=" +
      mb(memory.rss) +
      "MB heapUsed=" +
      mb(memory.heapUsed) +
      "MB freemem=" +
      mb(freemem()) +
      "MB loadavg=" +
      loadavg()
        .map((n) => n.toFixed(2))
        .join(",") +
      ")",
  );
}

export function startStreamingLoops(): void {
  flushInterval = setInterval(() => {
    void flushStreaming().then(enforceTurnLease);
  }, 150);
  lastHeartbeatTickAt = Date.now();
  heartbeatInterval = setInterval(() => {
    logEventLoopStall(Date.now());
    void heartbeatPing().then(enforceTurnLease);
  }, HEARTBEAT_TICK_MS);
}

export async function stopStreamingLoops(): Promise<void> {
  if (S.streamingLoopsStopped) return;
  S.streamingLoopsStopped = true;
  if (flushInterval) clearInterval(flushInterval);
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  await flushStreaming();
}

const LEASE_EXIT_GRACE_MS = 500;
let leaseExitScheduled = false;

function enforceTurnLease(): boolean {
  const decision = decideTurnLeaseExit({
    terminalReason: getLeaseTerminalReason(),
    exitScheduled: leaseExitScheduled,
  });
  if (decision.action === "continue") return false;
  if (decision.action === "wait") return true;
  leaseExitScheduled = true;
  log("exiting: turn lease terminal (" + decision.reason + ")");
  if (flushInterval) clearInterval(flushInterval);
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  S.streamingLoopsStopped = true;
  if (decision.reason !== "superseded") {
    // The server already finalised this turn (stalled, cancelled or timed out),
    // so nothing downstream will publish what the agent wrote: this daemon holds
    // the only copy of those edits. persistTurnWork is synchronous, bounded by
    // its own git timeouts, best-effort, and skips task runs itself.
    // "superseded" is excluded on purpose: a rival daemon owns the same
    // worktree, and a commit from the loser could race the winner's work.
    log(
      "persisting turn work before lease-terminal exit (" +
        decision.reason +
        ")",
    );
    persistTurnWork();
  }
  setTimeout(() => process.exit(0), LEASE_EXIT_GRACE_MS).unref();
  return true;
}

export async function setFinalizingState(): Promise<boolean> {
  // No "Finalizing response..." step — status filler isn't shown in the
  // activity flow; the response text itself is the signal.
  markLastComplete();
  S.lastStepType = "thinking";
  try {
    await sendStreamingHeartbeatUpdate(buildStreamingPayload());
  } catch {
    /* ignore final heartbeat errors */
  }
  return enforceTurnLease();
}

export async function runPreflightHeartbeat(): Promise<boolean> {
  try {
    await initialHeartbeat();
    try {
      writeFileSync(READY_FILE, String(Date.now()));
      log(
        "ready file written after " +
          String(Date.now() - SCRIPT_STARTED_AT) +
          "ms",
      );
    } catch {
      /* ignore ready file errors */
    }
    return true;
  } catch (error) {
    console.error("Callback preflight failed:", String(error));
    return false;
  }
}
