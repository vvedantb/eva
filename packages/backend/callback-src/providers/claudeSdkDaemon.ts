import { unlinkSync, writeFileSync, readFileSync, readdirSync } from "fs";
import { homedir } from "os";
import {
  CLAIM_MUTATION,
  COMPLETE_SYNTHETIC_TURN_MUTATION,
  COMPLETION_MUTATION,
  CONVEX_TOKEN,
  CONVEX_URL,
  CALLBACK_SCRIPT_FP,
  DAEMON_OPTS_SIG,
  ENTITY_ID,
  ENTITY_ID_FIELD,
  HARNESS_CATALOG_TOKEN,
  MAX_TOTAL_RUNTIME_MS,
  MODEL,
  NO_OUTPUT_TIMEOUT_MS,
  OPEN_SYNTHETIC_TURN_MUTATION,
  REPO_ID,
  RUN_ID,
  UPDATE_BACKGROUND_AGENTS_MUTATION,
  WORK_DIR,
} from "../config.js";
import {
  resolveDaemonPaths,
  resolveLegacySessionDaemonPaths,
} from "./daemonPaths.js";
import {
  callConvexWithRetry,
  callHarnessSkillCatalogReport,
  type HarnessCommandReport,
} from "../http/convexClient.js";
import {
  deliverCompletionWithMedia,
  extractResultEvent,
  uploadAndAttachSandboxMedia,
} from "../runtime/completion.js";
import {
  flushStreaming,
  runPreflightHeartbeat,
  setFinalizingState,
  startStreamingLoops,
  stopStreamingLoops,
} from "../runtime/heartbeats.js";
import { processRealtimeStdoutChunk } from "../parse/streamRouter.js";
import { serializeSteps } from "../parse/stepBudget.js";
import {
  appendToRawLogFile,
  appendToRawOutput,
  trimBufferHead,
} from "../runtime/buffers.js";
import {
  syncClaudeStateToPersist,
  prepareClaudeSessionState,
} from "../session/claudeSession.js";
import {
  buildSdkOptions,
  loadSdk,
  readSdkPlanUsage,
  sdkMessageJson,
  type SdkModule,
  type SdkUserMessage,
} from "./claudeSdk.js";
import { callbackState as S } from "../runtime/state.js";
import {
  captureAndReportClaudeUsage,
  type ClaudeUsageResponseLike,
} from "../runtime/usageLimits.js";
import { materializeTurnAttachments } from "../runtime/turnAttachments.js";
import { persistTurnWork } from "../runtime/turnPersist.js";
import {
  appendTurnCheckpoint,
  beginTurnCheckpoint,
} from "../runtime/turnCheckpoint.js";
import {
  beginTurnOwnership,
  endTurnOwnership,
  getCurrentTurnLease,
} from "../runtime/turnLease.js";
import { log, readResponseJson } from "../utils.js";
import { ensureGithubToken } from "./githubToken.js";
import type { JsonObject, JsonValue } from "../types.js";
import { DaemonSupervisor } from "../runtime/daemonSupervisor.js";
import {
  readCancelRequested,
  readStopTaskToolUseIds,
  readTurnLeaseIdentity,
  readUsageRefreshRequested,
} from "./claimPendingTurnParse.js";
import {
  appendClaimedTurnCompletion,
  finishClaimedTurn,
  readClaimedTurn,
  shouldParkClaimedTurn,
  startClaimedTurn,
  type ClaimedTurn,
} from "./claimedTurnLifecycle.js";
import { isZeroWorkTaskNotificationResult } from "./claudeResult.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True when `pid` refers to a live process this user can signal. */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Reads the entity daemon pidfile; NaN when missing or unreadable. */
function readDaemonPidFile(): number {
  try {
    return Number(readFileSync(DAEMON_PID_FILE, "utf8").trim());
  } catch {
    return Number.NaN;
  }
}

// Entity-scoped daemon marker paths (see daemonPaths.ts). Legacy session paths
// are cleaned up on exit when this daemon is session-scoped.
const daemonPaths = resolveDaemonPaths();
const DAEMON_PID_FILE = daemonPaths.pid;
const DAEMON_ENTITY_FILE = daemonPaths.entity;
const DAEMON_OPTS_FILE = daemonPaths.opts;

// Exit if no new turn arrives for this long, so the sandbox can be reclaimed.
// Kept generous so a normal work session never pays a mid-session respawn (the
// respawn — re-upload + boot — is the ~20s "slow hi" users feel). Matches the
// keep-warm window of comparable agents (t3code reaps at 30min).
const IDLE_EXIT_MS = 45 * 60 * 1000;
// How often a daemon re-checks that it still owns the entity pidfile. Concurrent
// launches race the multi-second gap between the launcher's alive-check and the
// pidfile write below, so several daemons can boot for one entity (observed in
// prod: 5 daemons flip-flopping one streaming row). Deposed daemons exit here.
const FENCE_POLL_INTERVAL_MS = 5000;
// Poll interval for the claim mutation. Low enough to keep handoff→turn-start
// latency to ~one poll; the turn itself dominates so this only trims the tail.
const PROMPT_POLL_INTERVAL_MS = 50;
// Idle backoff for that poll. At 50ms an idle daemon burns ~20 Convex mutation
// calls/s (~54k per 45-min idle window) purely to notice a turn that is not
// coming, and those silent executions flood `convex logs`. Once no turn is in
// flight and nothing has happened for PROMPT_POLL_FAST_WINDOW_MS, poll at the
// idle interval instead — worst case adds ~1s before an idle daemon claims a
// fresh send, invisible next to model time-to-first-token. Any in-flight turn
// keeps the 50ms cadence so cancel/stop-task drains (which ride the same
// mutation) stay prompt even through long-silent tool runs.
const PROMPT_POLL_IDLE_INTERVAL_MS = 1000;
const PROMPT_POLL_FAST_WINDOW_MS = 30_000;

// Per-turn watchdog. Without this a turn whose SDK query stalls or ends without
// emitting a result would never send a completion event, so the workflow's
// awaitEvent hangs until the 2h stale-session timeout (empty "Working…" bubble).
// Mirrors the one-shot path (claudeSdk.ts): fail the turn if it produces no SDK
// message for a while, or exceeds the hard runtime cap. Silence while a tool is
// in flight (S.inFlightToolUses > 0) is exempt — the SDK emits nothing during a
// tool run, so a long bash call would otherwise be killed as a hang (seen in
// prod). On a fire we send a failure completion (resolving awaitEvent) and exit
// so the next turn respawns a clean daemon rather than reusing a wedged query.
const NO_MESSAGE_TIMEOUT_MS = NO_OUTPUT_TIMEOUT_MS * 5;
const WATCHDOG_TICK_MS = 5000;

// Safety net for a cancel whose interrupted `result` never arrives (SDK
// interrupt() hung, or silently dropped it). The normal per-turn watchdog
// above is disarmed at cancel time (endWatchedTurn already ran), so without
// this a lost interrupt would wedge the supervisor in `cancelling` forever.
const CANCEL_SETTLE_TIMEOUT_MS = 30_000;

let turnActive = false;
let turnStartedAtMs = 0;
let lastMessageAtMs = 0;

type DaemonMessage = Record<string, JsonValue>;

/** The SDK's live query handle — inferred so no SDK type is named here. */
type AgentQuery = ReturnType<SdkModule["query"]>;

type DaemonTurn = { kind: "real" } | { kind: "synthetic"; messageId: string };

type WarmRunner = {
  push: (text: string) => void;
  waitMessage: () => Promise<DaemonMessage | null>;
  drainPending: () => DaemonMessage[];
  hasPending: () => boolean;
  stopTask: (taskId: string) => Promise<void>;
  /** Interrupts the in-flight turn (cancel). Logs and no-ops when the SDK
   * query handle does not support it. */
  interrupt: () => Promise<void>;
  /** Reads the SDK's experimental plan-usage data; null when unavailable. */
  readUsage: () => Promise<ClaudeUsageResponseLike | null>;
  /** Claude-native plan mode. No-ops when the SDK handle lacks the method. */
  setPermissionMode: (mode: "plan" | "default") => Promise<void>;
};

type BackgroundAgentEntry = {
  toolUseId: string;
  taskId?: string;
  description?: string;
  status: string;
  backgrounded?: boolean;
  startedAt: number;
  settledAt?: number;
};

const supervisor = new DaemonSupervisor<ClaimedTurn, DaemonTurn>();
let callbackRefreshDeferralLogged = false;
let lastIdleActivityAtMs = Date.now();
let agentTurnOutput = "";
let agentTurnStartedAt = 0;
let sawFirstMessageThisTurn = { value: false };
let sawAssistantThisTurn = { value: false };
// Cancel state machine: set when a claim response drains a user cancel for
// the in-flight turn (see handleCancelRequested); cleared once that turn's
// result settles in runDaemonMessagePump, or force-exited by the safety net
// in startTurnWatchdog if it never does. While true: the per-turn watchdog is
// already disarmed (endWatchedTurn ran at cancel time), the claim watcher
// parks — rather than discards — any turn the same claim also carried, and
// the message pump drops the interrupted turn's tail instead of streaming or
// finalizing it.
let turnCancelRequestedAtMs = 0;

const recognisedSubagentToolUseIds = new Set<string>();
const settledSubagentToolUseIds = new Set<string>();
const unsettledBackgroundAgents = new Map<string, BackgroundAgentEntry>();
const pendingAgentStops = new Set<string>();
let currentAgentRunner: WarmRunner | null = null;
let usageRefreshInFlight = false;

function entityMutationArgs(
  fields: Record<string, JsonValue>,
): Record<string, JsonValue> {
  return {
    [ENTITY_ID_FIELD ?? "sessionId"]: ENTITY_ID ?? "",
    ...fields,
  };
}

function beginWatchedTurn(): void {
  turnActive = true;
  turnStartedAtMs = Date.now();
  lastMessageAtMs = turnStartedAtMs;
}

function noteWatchedMessage(): void {
  lastMessageAtMs = Date.now();
}

// Called as soon as a turn's result is in hand (before finalize) and between
// turns, so the watchdog only guards a turn that is genuinely in flight.
function endWatchedTurn(): void {
  turnActive = false;
}

/**
 * Sends a failure completion for the current turn (resolving the workflow's
 * awaitEvent so the UI stops spinning) and exits the process. Exiting abandons a
 * potentially wedged SDK query; the next turn's prewarm boots a fresh daemon.
 */
async function failTurnAndExit(error: string): Promise<never> {
  log("daemon: failing turn — " + error);
  // Durability BEFORE completion, exactly as finalizeTurn does it: success and
  // durability are orthogonal. A turn that committed work (or left it dirty) and
  // then failed still produced the user's work, and this process is about to
  // exit — nothing else will publish it, so a VM death erases it. The server's
  // own push stays gated on success: only this process knows the worktree state
  // at its death, and a post-failure server push would race the next turn's
  // daemon. Outside the try: persistTurnWork logs its own failures and never
  // throws, and the completion below must post regardless.
  //
  // This also runs on the watchdog's wedged-SDK path, so it delays the failure
  // completion. Every git step is a spawnSync with a timeout (20s, 60s for
  // fetch/merge/push), giving a hard worst case around 12 minutes on a hung
  // network and milliseconds in the normal already-published case. Past ~5
  // minutes the server's stall watchdog finalizes the turn instead — the same
  // outcome for the user, with the work published either way.
  persistTurnWork();
  try {
    const completionArgs: JsonObject = {
      [ENTITY_ID_FIELD ?? "sessionId"]: ENTITY_ID ?? "",
      success: false,
      result: null,
      error,
      activityLog: serializeSteps(S.accumulatedSteps),
      ...(RUN_ID ? { runId: RUN_ID } : {}),
    };
    appendClaimedTurnCompletion(completionArgs);
    appendTurnCheckpoint(completionArgs);
    await callConvexWithRetry(
      "mutation",
      COMPLETION_MUTATION ?? "",
      completionArgs,
    );
  } catch {
    /* best-effort: exit regardless so the daemon does not wedge */
  }
  // Only unlink a pidfile this daemon still owns — a deposed daemon that
  // deferred its fence exit through this failing turn would otherwise delete
  // the rival's pidfile and take the healthy daemon down with it.
  if (readDaemonPidFile() === process.pid) {
    try {
      unlinkSync(DAEMON_PID_FILE);
    } catch {
      /* ignore */
    }
  }
  await stopStreamingLoops();
  process.exit(1);
}

/**
 * Cleans up like failTurnAndExit (pid file + streaming loops) but WITHOUT
 * posting a completion mutation, then returns so the caller can let the
 * daemon shut down through runSdkDaemon's ordinary finally block instead of a
 * forced process.exit. Only used when the server already finalized the
 * user-facing turn itself (a drained cancel) — posting a completion here
 * could resolve the NEXT turn's workflow event instead of this
 * already-settled one.
 */
async function exitWithoutCompletion(reason: string): Promise<void> {
  log("daemon: exiting without completion — " + reason);
  // A cancelled turn can still have committed work, and this daemon is leaving
  // for good. persistTurnWork only touches git — it posts no mutation — so it is
  // safe on a turn the server has already finalized.
  persistTurnWork();
  // Same ownership gate as failTurnAndExit: never delete a rival's pidfile.
  if (readDaemonPidFile() === process.pid) {
    try {
      unlinkSync(DAEMON_PID_FILE);
    } catch {
      /* ignore */
    }
  }
  await stopStreamingLoops();
}

/** Arms the per-turn watchdog interval for the daemon's lifetime. */
function startTurnWatchdog(): void {
  const timer = setInterval(() => {
    const now = Date.now();
    if (supervisor.isCancellationInFlight) {
      if (now - turnCancelRequestedAtMs > CANCEL_SETTLE_TIMEOUT_MS) {
        // The server already finalized this turn when it drained the
        // cancel, so — like exitWithoutCompletion — do not post a completion
        // here; it could resolve the NEXT turn's workflow event instead.
        // Force-exit so prewarm respawns a clean daemon for whatever is next.
        log("daemon: cancelled turn did not settle in time — exiting");
        // Same reasoning as exitWithoutCompletion: publish the cancelled turn's
        // work (git only, no mutation) before this process disappears.
        persistTurnWork();
        process.exit(1);
      }
      return;
    }
    if (!turnActive) return;
    // A turn paused on a blocking question emits no SDK messages by design —
    // keep both timers fresh so the wait is never mistaken for a stalled turn.
    if (S.awaitingQuestionAnswer) {
      turnStartedAtMs = now;
      lastMessageAtMs = now;
      return;
    }
    // The SDK emits nothing between a tool_use and its tool_result, so a
    // long-running tool (Bash allows 10min; subagent Task calls longer) is
    // indistinguishable from a hang by message silence alone: while a tool is
    // in flight only the hard runtime cap
    // applies, and the silence clock restarts once the tool result lands.
    if (S.inFlightToolUses > 0) {
      lastMessageAtMs = now;
    }
    if (now - turnStartedAtMs > MAX_TOTAL_RUNTIME_MS) {
      turnActive = false;
      if (supervisor.currentTurn?.kind === "synthetic") {
        void failSyntheticTurn(
          "The assistant exceeded the maximum turn runtime.",
        );
      } else {
        void failTurnAndExit(
          "The assistant exceeded the maximum turn runtime.",
        );
      }
    } else if (now - lastMessageAtMs > NO_MESSAGE_TIMEOUT_MS) {
      turnActive = false;
      if (supervisor.currentTurn?.kind === "synthetic") {
        void failSyntheticTurn(
          "The assistant stopped responding. Please try again.",
        );
      } else {
        void failTurnAndExit(
          "The assistant stopped responding. Please try again.",
        );
      }
    }
  }, WATCHDOG_TICK_MS);
  timer.unref?.();
}

/**
 * A queue-backed async iterable of user messages that BLOCKS when empty and
 * never returns. Feeding this as `query({ prompt })` keeps the underlying
 * `claude` subprocess + MCP + API connection warm across turns — each pushed
 * message starts a new turn (ended by a `result` message).
 */
function createPromptStream(): {
  push: (text: string) => void;
  iterable: AsyncIterable<SdkUserMessage>;
} {
  const queue: SdkUserMessage[] = [];
  let notify: (() => void) | null = null;
  const push = (text: string): void => {
    queue.push({
      type: "user",
      message: { role: "user", content: text },
      parent_tool_use_id: null,
      session_id: S.activeClaudeSessionId || "",
    });
    const resume = notify;
    notify = null;
    if (resume) resume();
  };
  const iterable: AsyncIterable<SdkUserMessage> = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          while (queue.length === 0) {
            await new Promise<void>((resolve) => {
              notify = resolve;
            });
          }
          const value = queue.shift();
          if (value === undefined) {
            return { value: undefined, done: true as const };
          }
          return { value, done: false as const };
        },
      };
    },
  };
  return { push, iterable };
}

/** Sessions may push git commits; refresh the installation token like the one-shot path. */
async function refreshGithubToken(): Promise<void> {
  await ensureGithubToken({
    convexUrl: CONVEX_URL,
    convexToken: CONVEX_TOKEN,
    repoId: REPO_ID,
  });
}

/** Clears the per-turn accumulators so the next turn starts clean on the same query. */
function resetTurnState(): void {
  S.accumulatedSteps.length = 0;
  S.currentStreamedContent = "";
  S.streamedAssistantTextThisMessage = false;
  S.resultEventSeen = false;
  S.rawOutput = "";
  // rawOutput is truncated to "" above, so the flush cursor must return to the
  // head — otherwise flushStreaming's `rawOutput.length <= lastProcessed` guard
  // stays true for the whole next turn and its lines are never parsed into
  // accumulatedSteps (activity would be empty from turn 2 onward).
  S.lastProcessed = 0;
  S.inFlightToolUses = 0;
  S.pendingQuestionData = "";
  S.todoState.length = 0;
  S.awaitingQuestionAnswer = false;
  S.lastStepType = "thinking";
}

/** Reports one finished turn to the session workflow (mirrors the one-shot completion). */
async function finalizeTurn(
  output: string,
  readUsage: () => Promise<ClaudeUsageResponseLike | null>,
): Promise<void> {
  // Drain the buffered turn output into S.accumulatedSteps before building the
  // completion payload — exactly like the one-shot path (index.ts) flushes after
  // its attempt loop. processRealtimeStdoutChunk only runs the streaming
  // side-effects (onStreamLine); it does NOT parse tool_use blocks into
  // accumulatedSteps. Only flushStreaming -> parseStreamEvent -> claudeParseLine
  // does that, and it runs on a 150ms interval, so without this synchronous
  // drain the activityLog is read (and then resetTurnState-cleared) before the
  // loop has parsed this turn's tool steps — yielding an empty "[]" activityLog.
  await flushStreaming();
  const resultEvent = extractResultEvent(output);
  for (const step of S.accumulatedSteps) step.status = "complete";
  const activityLog = serializeSteps(S.accumulatedSteps);
  const success = resultEvent ? !resultEvent.isError : false;
  const completionArgs: Record<string, JsonValue> = {
    [ENTITY_ID_FIELD ?? "sessionId"]: ENTITY_ID ?? "",
    success,
    result: resultEvent?.result ?? S.rawOutput,
    error: resultEvent?.isError ? resultEvent.result : null,
    activityLog,
  };
  if (RUN_ID) completionArgs.runId = RUN_ID;
  if (resultEvent?.rawResultEvent) {
    completionArgs.rawResultEvent = resultEvent.rawResultEvent;
  }
  if (S.pendingQuestionData) {
    completionArgs.pendingQuestion = S.pendingQuestionData;
  }
  appendClaimedTurnCompletion(completionArgs);
  // Final streaming reconcile BEFORE completion. The completion mutation
  // finalizes the assistant message, after which the server clears the
  // streaming row and may immediately dequeue the next queued turn — so this
  // daemon must not write streaming state past that point. When this ran
  // post-completion it landed after that clear and resurrected this turn's
  // full reply text into the row, which the NEXT turn's placeholder rendered
  // as its response until the real reply arrived (stale-reply bug).
  // setFinalizingState (not plain flushStreaming, which would early-return on
  // the already-drained buffer) pushes the now-complete steps and final text.
  if (await setFinalizingState()) return;
  // Durability BEFORE completion: commit + push the turn's work so a VM death
  // after this point cannot erase it (a hard death snapshots nothing and the
  // next resume rolls the filesystem back — see turnPersist.ts).
  persistTurnWork();
  // Completion first, then media: attachMedia patches the assistant message
  // that was just written.
  const completionSentAt = Date.now();
  await deliverCompletionWithMedia(completionArgs);
  finishClaimedTurn();
  log(
    "daemon: turn finalized success=" +
      success +
      " steps=" +
      activityLog.length +
      " (completion mutation " +
      (Date.now() - completionSentAt) +
      "ms)",
  );
  // Persist the Claude transcript to the volume for restart recovery. Runs
  // AFTER completion so the ~5s synchronous transcript copy never delays the
  // reply the user is waiting on. The sandbox stays warm between turns, so
  // this only guards against a sandbox restart. accumulatedSteps is still
  // populated (resetTurnState runs after this returns).
  const bookkeepingAt = Date.now();
  syncClaudeStateToPersist("daemon-turn");
  // Detached after completion and transcript persistence: a degraded SDK
  // control channel must not stall the next queued message or risk losing the
  // persisted transcript. Capture still precedes report inside the helper.
  void captureAndReportClaudeUsage({
    readUsage,
    error: resultEvent?.isError ? resultEvent.result : undefined,
  });
  log(
    "daemon: post-turn bookkeeping took " + (Date.now() - bookkeepingAt) + "ms",
  );
}

function readSyntheticTurnMessageId(result: JsonValue): string | null {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    return null;
  }
  const inner = result.value;
  const payload =
    typeof inner === "object" && inner !== null && !Array.isArray(inner)
      ? inner
      : result;
  const messageId = payload.messageId;
  return typeof messageId === "string" ? messageId : null;
}

function readParentToolUseId(message: DaemonMessage): string | null {
  const parentField = message.parent_tool_use_id;
  if (typeof parentField === "string" && parentField.trim()) {
    return parentField.trim();
  }
  return null;
}

function readStringField(
  message: DaemonMessage,
  field: string,
): string | undefined {
  const value = message[field];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function recogniseSubagentToolUses(message: DaemonMessage): void {
  if (message.type !== "assistant") {
    return;
  }
  const nested = message.message;
  if (typeof nested !== "object" || nested === null || Array.isArray(nested)) {
    return;
  }
  const content = nested.content;
  if (!Array.isArray(content)) {
    return;
  }
  for (const block of content) {
    if (typeof block !== "object" || block === null || Array.isArray(block)) {
      continue;
    }
    if (block.type !== "tool_use") {
      continue;
    }
    const name = block.name;
    if (name !== "Agent" && name !== "Task") {
      continue;
    }
    const id = block.id;
    if (typeof id === "string" && id.trim()) {
      recognisedSubagentToolUseIds.add(id.trim());
    }
  }
}

function shouldDropSubagentMessage(message: DaemonMessage): boolean {
  const parentId = readParentToolUseId(message);
  if (parentId === null) {
    return false;
  }
  return settledSubagentToolUseIds.has(parentId);
}

/**
 * Synara-compatible mint gate: only open a synthetic turn for main-context
 * assistant/stream traffic, or messages routed under a recognised Agent/Task
 * tool_use id. Between-turn system/task/telemetry noise must not mint — a
 * background Bash exit would otherwise open an empty bubble that the watchdog
 * fails as "The assistant stopped responding".
 */
function shouldMintSyntheticTurn(message: DaemonMessage): boolean {
  if (message.type === "assistant" || message.type === "stream_event") {
    return true;
  }
  const parentId = readParentToolUseId(message);
  if (parentId === null) {
    return false;
  }
  return recognisedSubagentToolUseIds.has(parentId);
}

function completeSubtaskStep(toolUseId: string): void {
  for (const step of S.accumulatedSteps) {
    if (step.type === "subtask" && step.toolUseId === toolUseId) {
      step.status = "complete";
    }
  }
}

function settleSubagent(toolUseId: string, terminalStatus: string): void {
  settledSubagentToolUseIds.add(toolUseId);
  const entry = unsettledBackgroundAgents.get(toolUseId);
  unsettledBackgroundAgents.delete(toolUseId);
  completeSubtaskStep(toolUseId);
  if (entry) {
    void syncBackgroundAgentsToConvex([
      {
        ...entry,
        status: terminalStatus,
        settledAt: Date.now(),
      },
    ]);
  }
}

function toConvexBackgroundAgent(
  entry: BackgroundAgentEntry,
): Record<string, string | number | boolean> {
  const payload: Record<string, string | number | boolean> = {
    toolUseId: entry.toolUseId,
    status: entry.status,
    startedAt: entry.startedAt,
  };
  if (entry.taskId) {
    payload.taskId = entry.taskId;
  }
  if (entry.description) {
    payload.description = entry.description;
  }
  if (entry.backgrounded === true) {
    payload.backgrounded = true;
  }
  if (entry.settledAt !== undefined) {
    payload.settledAt = entry.settledAt;
  }
  return payload;
}

async function syncBackgroundAgentsToConvex(
  agents: BackgroundAgentEntry[],
): Promise<void> {
  if (agents.length === 0) {
    return;
  }
  try {
    await callConvexWithRetry(
      "mutation",
      UPDATE_BACKGROUND_AGENTS_MUTATION ?? "",
      entityMutationArgs({
        agents: agents.map(toConvexBackgroundAgent),
      }),
    );
  } catch {
    /* best-effort */
  }
}

let harnessCatalogReportStarted = false;

/** Server-side caps on `/api/harness-skills/report`; exceeding any rejects the whole report. */
const CATALOG_MAX_COMMANDS = 100;
const CATALOG_MAX_NAME_LENGTH = 100;
const CATALOG_MAX_DESCRIPTION_LENGTH = 2000;
const CATALOG_MAX_ARGUMENT_HINT_LENGTH = 400;

/**
 * Command names the SDK picked up from this checkout or the sandbox user's
 * settings (`.claude/skills` directories and `.claude/commands` markdown
 * files) rather than from the CLI build. The catalog row is global across
 * repos, so these must never be reported as built-ins.
 */
function collectLocalCommandNames(): Set<string> {
  const names = new Set<string>();
  for (const root of [WORK_DIR, homedir()]) {
    try {
      for (const entry of readdirSync(root + "/.claude/skills", {
        withFileTypes: true,
      })) {
        if (entry.isDirectory()) names.add(entry.name);
      }
    } catch {
      /* no skills dir */
    }
    try {
      for (const entry of readdirSync(root + "/.claude/commands", {
        withFileTypes: true,
      })) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
          names.add(entry.name.slice(0, -".md".length));
        }
      }
    } catch {
      /* no commands dir */
    }
  }
  return names;
}

/** First non-empty line of a command description, within the server's length cap. */
function catalogDescription(description: string): string {
  const firstLine = description
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return (firstLine ?? "").slice(0, CATALOG_MAX_DESCRIPTION_LENGTH);
}

/**
 * Reports the built-in slash commands this sandbox's Claude CLI ships with, so
 * the composer's `/` picker tracks the installed build instead of a hardcoded
 * list. Goes to the HMAC-verified `/api/harness-skills/report` route: the row
 * is global, so only a sandbox Eva launched may write it — and commands the
 * SDK loaded from this repo's or the user's `.claude` directory are excluded
 * so one repo's skills never leak into every other repo's picker. Once per
 * daemon; the server drops the report when nothing changed. Best-effort — a
 * failure here must never touch the session, and an unsigned daemon just does
 * not report.
 */
async function reportHarnessSkillCatalog(
  cliVersion: string,
  query: AgentQuery,
): Promise<void> {
  try {
    if (!HARNESS_CATALOG_TOKEN) return;
    if (typeof query.initializationResult !== "function") {
      log("daemon: initializationResult unavailable — skipping skill report");
      return;
    }
    const init = await query.initializationResult();
    const localNames = collectLocalCommandNames();
    const commands: HarnessCommandReport[] = [];
    for (const command of init.commands) {
      if (localNames.has(command.name)) continue;
      if (command.name.length === 0) continue;
      if (command.name.length > CATALOG_MAX_NAME_LENGTH) continue;
      const argumentHint = (command.argumentHint ?? "").slice(
        0,
        CATALOG_MAX_ARGUMENT_HINT_LENGTH,
      );
      commands.push({
        name: command.name,
        description: catalogDescription(command.description),
        ...(argumentHint ? { argumentHint } : {}),
      });
    }
    if (commands.length === 0) return;
    if (commands.length > CATALOG_MAX_COMMANDS) {
      log(
        "daemon: harness skill report truncated from " +
          commands.length +
          " to " +
          CATALOG_MAX_COMMANDS +
          " commands",
      );
      commands.length = CATALOG_MAX_COMMANDS;
    }
    await callHarnessSkillCatalogReport("claude", cliVersion, commands);
    log(
      "daemon: reported " +
        commands.length +
        " built-in skills from CLI " +
        cliVersion,
    );
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    log("daemon: harness skill report failed — " + messageText);
  }
}

/**
 * The init system message is the only place the CLI version appears; the
 * command descriptions only come from `initializationResult()`. Fires once,
 * detached, as soon as the first init message lands on the warm query.
 */
function noteHarnessInitMessage(
  message: DaemonMessage,
  query: AgentQuery,
): void {
  if (harnessCatalogReportStarted) return;
  if (message.type !== "system" || message.subtype !== "init") return;
  const cliVersion = readStringField(message, "claude_code_version");
  if (!cliVersion) return;
  harnessCatalogReportStarted = true;
  void reportHarnessSkillCatalog(cliVersion, query);
}

function findAgentByTaskId(taskId: string): BackgroundAgentEntry | undefined {
  for (const entry of unsettledBackgroundAgents.values()) {
    if (entry.taskId === taskId) {
      return entry;
    }
  }
  return undefined;
}

function markAgentsBackgrounded(taskIds: string[]): void {
  const patches: BackgroundAgentEntry[] = [];
  for (const taskId of taskIds) {
    const entry = findAgentByTaskId(taskId);
    if (!entry || entry.backgrounded === true) {
      continue;
    }
    entry.backgrounded = true;
    patches.push({ ...entry });
  }
  if (patches.length > 0) {
    void syncBackgroundAgentsToConvex(patches);
  }
}

async function dispatchPendingAgentStops(
  agentRunner: WarmRunner,
): Promise<void> {
  const pendingStops: string[] = [];
  pendingAgentStops.forEach((toolUseId) => {
    pendingStops.push(toolUseId);
  });
  for (const toolUseId of pendingStops) {
    const entry = unsettledBackgroundAgents.get(toolUseId);
    if (!entry?.taskId) {
      continue;
    }
    pendingAgentStops.delete(toolUseId);
    try {
      await agentRunner.stopTask(entry.taskId);
      log("daemon: stopTask dispatched taskId=" + entry.taskId);
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : String(error);
      log("daemon: stopTask failed — " + messageText);
      pendingAgentStops.add(toolUseId);
    }
  }
}

function handleBackgroundTasksChanged(message: DaemonMessage): void {
  if (
    message.type !== "system" ||
    message.subtype !== "background_tasks_changed"
  ) {
    return;
  }
  const tasksField = message.tasks;
  if (!Array.isArray(tasksField)) {
    return;
  }
  const taskIds: string[] = [];
  for (const task of tasksField) {
    if (typeof task !== "object" || task === null || Array.isArray(task)) {
      continue;
    }
    const taskIdField = task.task_id;
    const taskId =
      typeof taskIdField === "string" && taskIdField.trim()
        ? taskIdField.trim()
        : undefined;
    if (taskId) {
      taskIds.push(taskId);
    }
  }
  // Mark backgrounded idempotently from the full roster (markAgentsBackgrounded
  // skips already-marked entries). Do NOT consume diffNewBackgroundTaskIds here:
  // the parse layer owns that dedup set and diffs it to push the "Agent moved to
  // background" notice step — consuming it first leaves that diff empty and
  // the notice never renders.
  markAgentsBackgrounded(taskIds);
}

function handleSystemTaskMessage(message: DaemonMessage): void {
  if (message.type !== "system") {
    return;
  }
  const subtype = message.subtype;
  if (typeof subtype !== "string") {
    return;
  }
  const toolUseId = readStringField(message, "tool_use_id");
  if (subtype === "task_started" && toolUseId) {
    const entry: BackgroundAgentEntry = {
      toolUseId,
      taskId: readStringField(message, "task_id"),
      description: readStringField(message, "description"),
      status: "running",
      startedAt: Date.now(),
    };
    unsettledBackgroundAgents.set(toolUseId, entry);
    void syncBackgroundAgentsToConvex([entry]);
    if (currentAgentRunner) {
      void dispatchPendingAgentStops(currentAgentRunner);
    }
    return;
  }
  if (
    (subtype === "task_updated" || subtype === "task_notification") &&
    toolUseId
  ) {
    const status = readStringField(message, "status");
    const terminal =
      status === "completed" ||
      status === "failed" ||
      status === "killed" ||
      status === "stopped" ||
      subtype === "task_notification";
    if (terminal) {
      settleSubagent(toolUseId, status ?? "completed");
    }
  }
}

async function failSyntheticTurn(error: string): Promise<void> {
  const turn = supervisor.currentTurn;
  if (turn?.kind !== "synthetic") {
    return;
  }
  log("daemon: failing synthetic turn — " + error);
  const messageId = turn.messageId;
  // Durability BEFORE completion, exactly as finalizeSyntheticTurn does it: a
  // failed synthetic turn's committed work is still the user's work, and a
  // synthetic turn has no workflow, so this is the only push it will ever get.
  persistTurnWork();
  try {
    await flushStreaming();
    for (const step of S.accumulatedSteps) {
      step.status = "complete";
    }
    const turnLease = getCurrentTurnLease();
    const completionArgs = entityMutationArgs({
      messageId,
      success: false,
      result: null,
      error,
      activityLog: serializeSteps(S.accumulatedSteps),
      ...turnLease,
    });
    appendTurnCheckpoint(completionArgs);
    await callConvexWithRetry(
      "mutation",
      COMPLETE_SYNTHETIC_TURN_MUTATION ?? "",
      completionArgs,
    );
  } catch {
    /* best-effort */
  }
  endWatchedTurn();
  resetTurnState();
  endTurnOwnership();
  supervisor.settleTurn();
  agentTurnOutput = "";
}

async function ensureSyntheticTurn(): Promise<void> {
  if (!supervisor.beginSyntheticOpen()) return;
  try {
    const result = await callConvexWithRetry(
      "mutation",
      OPEN_SYNTHETIC_TURN_MUTATION ?? "",
      // This daemon's own model, so the server stamps the synthetic reply's
      // provider checkpoint from what actually ran the turn — the sticky
      // composer pick can move to another provider while this turn is open.
      entityMutationArgs({ model: MODEL }),
    );
    const messageId = readSyntheticTurnMessageId(result);
    if (messageId === null) {
      log("daemon: openSyntheticTurn returned no messageId");
      return;
    }
    resetTurnState();
    // A synthetic turn owns the heartbeat without occupying the claim slot;
    // a legacy synthetic turn carries no lease and must still heartbeat.
    beginTurnOwnership("provider", readTurnLeaseIdentity(result));
    beginTurnCheckpoint();
    if (!supervisor.startTurn({ kind: "synthetic", messageId })) {
      log("daemon: synthetic turn opened after lifecycle moved; ignoring");
      endTurnOwnership();
      return;
    }
    agentTurnStartedAt = Date.now();
    sawFirstMessageThisTurn = { value: false };
    sawAssistantThisTurn = { value: false };
    S.activeAttemptStartedAt = agentTurnStartedAt;
    beginWatchedTurn();
    log("daemon: synthetic turn opened messageId=" + messageId);
  } finally {
    supervisor.abandonSyntheticOpen();
  }
}

async function finalizeSyntheticTurn(output: string): Promise<void> {
  const turn = supervisor.currentTurn;
  if (turn?.kind !== "synthetic") {
    return;
  }
  supervisor.beginFinalizing();
  const messageId = turn.messageId;
  await flushStreaming();
  const resultEvent = extractResultEvent(output);
  for (const step of S.accumulatedSteps) {
    step.status = "complete";
  }
  const activityLog = serializeSteps(S.accumulatedSteps);
  const success = resultEvent ? !resultEvent.isError : false;
  const completionArgs: Record<string, JsonValue> = entityMutationArgs({
    messageId,
    success,
    result: resultEvent?.result ?? S.rawOutput,
    error: resultEvent?.isError ? resultEvent.result : null,
    activityLog,
  });
  if (S.pendingQuestionData) {
    completionArgs.pendingQuestion = S.pendingQuestionData;
  }
  const turnLease = getCurrentTurnLease();
  if (turnLease) {
    completionArgs.turnId = turnLease.turnId;
    completionArgs.leaseGeneration = turnLease.leaseGeneration;
  }
  // Durability BEFORE completion, exactly as finalizeTurn does it: a synthetic
  // turn has no workflow, so the server-side pushSandboxBranch step never runs
  // for it and this is the ONLY push. Work committed here sat local for hours
  // until the next real turn happened to push it. Ordering matters too — the
  // completion may immediately dequeue the next message, and a VM death after
  // that point erases anything not on origin (see turnPersist.ts).
  persistTurnWork();
  appendTurnCheckpoint(completionArgs);
  await callConvexWithRetry(
    "mutation",
    COMPLETE_SYNTHETIC_TURN_MUTATION ?? "",
    completionArgs,
  );
  // Synthetic completion has an exact placeholder id. Target it explicitly:
  // completeSyntheticTurn may dequeue another message before media finishes,
  // so attaching to the latest message could put these captures on that turn.
  await uploadAndAttachSandboxMedia({ messageId });
  syncClaudeStateToPersist("daemon-synthetic-turn");
  endWatchedTurn();
  resetTurnState();
  endTurnOwnership();
  supervisor.settleTurn();
  agentTurnOutput = "";
  log("daemon: synthetic turn finalized success=" + success);
}

async function startRealAgentTurn(
  turn: ClaimedTurn,
  agentRunner: WarmRunner,
): Promise<void> {
  // Do not drain the agent pump here: buffered post-result / background-agent
  // messages must stay queued so the main loop can open a synthetic turn (or
  // attribute them into this real turn once it is live).
  resetTurnState();
  if (!supervisor.startTurn({ kind: "real" })) {
    log("daemon: claimed turn could not enter running state");
    return;
  }
  startClaimedTurn(turn);
  agentTurnStartedAt = Date.now();
  sawFirstMessageThisTurn = { value: false };
  sawAssistantThisTurn = { value: false };
  beginWatchedTurn();
  await agentRunner.setPermissionMode("default");
  agentRunner.push(turn.prompt);
  S.activeAttemptStartedAt = agentTurnStartedAt;
  agentTurnOutput = "";
  log("daemon: real turn started");
}

/**
 * Handles a drained `cancelRequested` flag from a claim response: disarms the
 * per-turn watchdog and asks the SDK query to interrupt the in-flight turn.
 * Idempotent — a stale flag with no active turn, or one arriving while a
 * cancel is already in flight, is ignored (logged once). The turn itself is
 * not torn down here; runDaemonMessagePump settles it once the interrupted
 * turn's result arrives (or the watchdog's cancel-settle timeout fires).
 */
function handleCancelRequested(agentRunner: WarmRunner): void {
  if (supervisor.currentTurn === null) {
    log("daemon: cancelRequested with no active turn — ignored");
    return;
  }
  if (!supervisor.beginCancellation()) return;
  turnCancelRequestedAtMs = Date.now();
  endWatchedTurn();
  log("daemon: cancel requested — interrupting in-flight turn");
  void agentRunner.interrupt().catch((error) => {
    const messageText = error instanceof Error ? error.message : String(error);
    log("daemon: interrupt failed — " + messageText);
  });
}

function startClaimWatcher(agentRunner: WarmRunner): void {
  void (async () => {
    while (!supervisor.isStopping) {
      if (callbackScriptWentStaleOnDisk()) {
        supervisor.noticeRefresh();
      }
      const refreshDecision = supervisor.decideRefresh({
        watchedTurnActive: turnActive,
        backgroundAgentCount: unsettledBackgroundAgents.size,
        sdkMessagePending: agentRunner.hasPending(),
      });
      if (refreshDecision.action === "defer") {
        if (!callbackRefreshDeferralLogged) {
          log(
            "daemon: callback script updated on disk — deferring respawn until active work settles (" +
              refreshDecision.blocker +
              ")",
          );
          callbackRefreshDeferralLogged = true;
        }
        await sleep(PROMPT_POLL_INTERVAL_MS);
        continue;
      }
      if (refreshDecision.action === "exit") {
        log("daemon: callback script updated on disk — exiting for respawn");
        supervisor.stop();
        process.exit(0);
      }
      const acceptTurn =
        supervisor.phase === "idle" && supervisor.pendingClaim === null;
      try {
        const claimed = await callConvexWithRetry(
          "mutation",
          CLAIM_MUTATION ?? "",
          entityMutationArgs({ model: MODEL, acceptTurn }),
        );
        const stopIds = readStopTaskToolUseIds(claimed);
        for (const toolUseId of stopIds) {
          pendingAgentStops.add(toolUseId);
        }
        await dispatchPendingAgentStops(agentRunner);
        if (readCancelRequested(claimed)) {
          handleCancelRequested(agentRunner);
        }
        if (readUsageRefreshRequested(claimed) && !usageRefreshInFlight) {
          usageRefreshInFlight = true;
          log("daemon: usage refresh requested — reading SDK plan usage");
          const report = captureAndReportClaudeUsage({
            readUsage: agentRunner.readUsage,
            force: true,
          });
          void report.finally(() => {
            usageRefreshInFlight = false;
          });
        }
        const turn = readClaimedTurn(claimed);
        if (turn !== null) {
          await materializeTurnAttachments(turn);
          lastIdleActivityAtMs = Date.now();
          // claimPendingTurn already cleared session.pendingTurn atomically, so
          // any branch that does not park/start the claim loses that prompt.
          // Same-turn restages (workflow re-staging the prompt already running)
          // must still be discarded — parking those replays the prompt twice.
          const currentTurn = supervisor.currentTurn;
          const currentLease = getCurrentTurnLease();
          if (
            shouldParkClaimedTurn({
              hasActiveRealTurn: currentTurn?.kind === "real",
              isCancellationInFlight: supervisor.isCancellationInFlight,
              isFinalizing: false,
              currentLeaseTurnId: currentLease?.turnId ?? null,
              claimedLeaseTurnId: turn.turnLease?.turnId ?? null,
            })
          ) {
            if (!supervisor.parkClaim(turn)) {
              log("daemon: duplicate claimed turn ignored");
            }
          } else {
            log(
              "daemon: claim discarded while real turn active (prompt lost; pendingTurn was already cleared)",
            );
          }
        }
      } catch {
        /* retry on next poll */
      }
      const turnInFlight = supervisor.hasWork;
      const recentlyActive =
        Date.now() - lastIdleActivityAtMs < PROMPT_POLL_FAST_WINDOW_MS;
      await sleep(
        turnInFlight || recentlyActive
          ? PROMPT_POLL_INTERVAL_MS
          : PROMPT_POLL_IDLE_INTERVAL_MS,
      );
    }
  })();
}

async function runDaemonMessagePump(agentRunner: WarmRunner): Promise<void> {
  while (!supervisor.isStopping) {
    if (supervisor.currentTurn === null && supervisor.pendingClaim !== null) {
      const turn = supervisor.takeClaim();
      if (turn === null) continue;
      await startRealAgentTurn(turn, agentRunner);
      continue;
    }

    if (
      !supervisor.hasWork &&
      unsettledBackgroundAgents.size === 0 &&
      Date.now() - lastIdleActivityAtMs > IDLE_EXIT_MS
    ) {
      log("daemon: idle timeout — exiting");
      return;
    }

    if (supervisor.currentTurn === null && !agentRunner.hasPending()) {
      await sleep(PROMPT_POLL_INTERVAL_MS);
      continue;
    }

    const message = await agentRunner.waitMessage();
    if (message === null) {
      if (supervisor.isCancellationInFlight) {
        // The SDK query's async iterable ended while we were waiting out an
        // interrupted turn's tail. The server already finalized the
        // user-facing turn when it drained the cancel, so exit like
        // failTurnAndExit but WITHOUT posting a completion — one here could
        // resolve the NEXT turn's workflow event instead of this
        // already-settled one.
        await exitWithoutCompletion("pump ended while a cancel was settling");
        return;
      }
      if (turnActive) {
        if (supervisor.currentTurn?.kind === "synthetic") {
          await failSyntheticTurn(
            "The assistant ended without a reply. Please try again.",
          );
        } else {
          await failTurnAndExit(
            "The assistant ended without a reply. Please try again.",
          );
        }
      }
      return;
    }

    lastIdleActivityAtMs = Date.now();

    if (shouldDropSubagentMessage(message)) {
      const messageType = typeof message.type === "string" ? message.type : "?";
      log("daemon: dropped settled subagent message type=" + messageType);
      continue;
    }

    recogniseSubagentToolUses(message);
    handleSystemTaskMessage(message);
    handleBackgroundTasksChanged(message);

    if (supervisor.isCancellationInFlight) {
      if (message.type !== "result") {
        // Drop the interrupted turn's tail from user-visible streaming (no
        // processRealtimeStdoutChunk) — the server already finalized the
        // user-facing message for this turn. Background-agent bookkeeping
        // above still ran unconditionally.
        continue;
      }
      // The cancelled turn's result has arrived. Do not finalize or post a
      // completion — the server already finalized this turn when it drained
      // the cancel. Reset per-turn state and let the pump either pick up a
      // parked turn (next loop iteration) or go idle.
      resetTurnState();
      finishClaimedTurn();
      supervisor.settleTurn();
      agentTurnOutput = "";
      continue;
    }

    if (message.type === "result" && supervisor.currentTurn === null) {
      log("daemon: result with no live turn — ignored");
      continue;
    }

    if (isZeroWorkTaskNotificationResult(message)) {
      // A background task notification can finish immediately before the SDK
      // starts processing the user prompt already pushed to this warm query.
      // Keep the current turn and its placeholder alive; the subsequent
      // assistant/result events belong to that prompt.
      log(
        "daemon: zero-work task notification result ignored; active turn preserved",
      );
      continue;
    }

    if (supervisor.currentTurn === null) {
      if (!shouldMintSyntheticTurn(message)) {
        const messageType =
          typeof message.type === "string" ? message.type : "?";
        log(
          "daemon: between-turn " +
            messageType +
            " consumed without minting a synthetic turn",
        );
        continue;
      }
      await ensureSyntheticTurn();
      if (supervisor.currentTurn === null) {
        continue;
      }
      agentTurnOutput = "";
    }

    noteWatchedMessage();
    const processed = handleDaemonMessage(
      message,
      agentTurnOutput,
      agentTurnStartedAt,
      sawFirstMessageThisTurn,
      sawAssistantThisTurn,
    );
    agentTurnOutput = processed.output;
    if (!processed.isResult) {
      continue;
    }

    endWatchedTurn();
    const resultAt = Date.now();
    log(
      "daemon[timing]: result message +" +
        (resultAt - agentTurnStartedAt) +
        "ms after turn start",
    );

    if (supervisor.currentTurn?.kind === "synthetic") {
      await finalizeSyntheticTurn(agentTurnOutput);
    } else {
      supervisor.beginFinalizing();
      await finalizeTurn(agentTurnOutput, agentRunner.readUsage);
      log(
        "daemon[timing]: finalizeTurn took " + (Date.now() - resultAt) + "ms",
      );
      supervisor.settleTurn();
    }
    // Leave any already-queued SDK messages in the pump. The next loop
    // iteration will ensureSyntheticTurn() / handle them — draining here
    // orphaned background-agent "report back" continuations (session 43).

    if (supervisor.pendingClaim !== null && supervisor.currentTurn === null) {
      const parked = supervisor.takeClaim();
      if (parked === null) continue;
      await startRealAgentTurn(parked, agentRunner);
    }
  }
}

/** Processes one SDK message through the streaming pipeline. */
function handleDaemonMessage(
  message: DaemonMessage,
  output: string,
  turnStartedAt: number,
  sawFirstMessageThisTurn: { value: boolean },
  sawAssistantThisTurn: { value: boolean },
): { output: string; isResult: boolean } {
  const messageType = typeof message.type === "string" ? message.type : "?";
  if (!sawFirstMessageThisTurn.value) {
    sawFirstMessageThisTurn.value = true;
    log(
      "daemon[timing]: first SDK message (" +
        messageType +
        ") +" +
        (Date.now() - turnStartedAt) +
        "ms after turn start",
    );
  }
  if (!sawAssistantThisTurn.value && messageType === "assistant") {
    sawAssistantThisTurn.value = true;
    log(
      "daemon[timing]: first assistant msg +" +
        (Date.now() - turnStartedAt) +
        "ms after turn start",
    );
  }
  const line = JSON.stringify(message) + "\n";
  appendToRawLogFile(line);
  const nextOutput = trimBufferHead(output + line);
  appendToRawOutput(line);
  processRealtimeStdoutChunk(line);

  const isResult = message.type === "result";
  return { output: nextOutput, isResult };
}

/**
 * Session-lifetime agent query pump. Turn boundaries are state changes (see
 * supervisor's running turn), not loop exits — the same query() serves every turn for the
 * life of the daemon.
 */
function createWarmAgentRunner(
  sdk: Awaited<ReturnType<typeof loadSdk>>,
  options: ReturnType<typeof buildSdkOptions>,
): WarmRunner {
  const { push, iterable } = createPromptStream();
  log("daemon: booting warm agent query()");
  const query = sdk.query({ prompt: iterable, options });

  const pending: DaemonMessage[] = [];
  let notify: (() => void) | null = null;
  let pumpFinished = false;

  const wakeWaiters = (): void => {
    const resume = notify;
    notify = null;
    if (resume) resume();
  };

  void (async () => {
    try {
      for await (const raw of query) {
        const message = sdkMessageJson(JSON.stringify(raw));
        if (message === null) continue;
        noteHarnessInitMessage(message, query);
        pending.push(message);
        wakeWaiters();
      }
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : String(error);
      log("daemon: agent query pump failed — " + messageText);
    } finally {
      pumpFinished = true;
      wakeWaiters();
    }
  })();

  const waitMessage = async (): Promise<DaemonMessage | null> => {
    while (pending.length === 0) {
      if (pumpFinished) return null;
      await new Promise<void>((resolve) => {
        notify = resolve;
      });
      if (pending.length === 0 && pumpFinished) return null;
    }
    const message = pending.shift();
    return message ?? null;
  };

  const drainPending = (): DaemonMessage[] => {
    const drained = pending.slice();
    pending.length = 0;
    return drained;
  };

  const hasPending = (): boolean => pending.length > 0;

  const stopTask = async (taskId: string): Promise<void> => {
    if (typeof query.stopTask === "function") {
      await query.stopTask(taskId);
      return;
    }
    log("daemon: stopTask unavailable on SDK query handle");
  };

  const interrupt = async (): Promise<void> => {
    if (typeof query.interrupt === "function") {
      await query.interrupt();
      return;
    }
    log("daemon: interrupt unavailable on SDK query handle");
  };

  const setPermissionMode = async (mode: "plan" | "default"): Promise<void> => {
    if (typeof query.setPermissionMode !== "function") {
      log("daemon: setPermissionMode unavailable on SDK query handle");
      return;
    }
    try {
      await query.setPermissionMode(mode === "plan" ? "plan" : "default");
      log("daemon: permission mode set to " + mode);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("daemon: setPermissionMode failed — " + message);
    }
  };

  const readUsage = (): Promise<ClaudeUsageResponseLike | null> =>
    readSdkPlanUsage(query);

  return {
    push,
    waitMessage,
    drainPending,
    hasPending,
    stopTask,
    interrupt,
    readUsage,
    setPermissionMode,
  };
}

/**
 * Returns true when a newer callback bundle was uploaded while this daemon is
 * running — exit cleanly so the next prewarm can spawn with fresh code.
 */
function callbackScriptWentStaleOnDisk(): boolean {
  if (!CALLBACK_SCRIPT_FP) return false;
  try {
    const onDisk = readFileSync("/tmp/eva-callback-fp", "utf8").trim();
    return onDisk !== CALLBACK_SCRIPT_FP;
  } catch {
    return false;
  }
}

/**
 * Polls the claimPendingTurn mutation until a turn is staged for this session
 * (daemon-pull), then returns it. Returns null on idle timeout so the
 * daemon can exit and free the sandbox. The claim is atomic server-side, so a
 * prompt is handed to exactly one poll and never re-executed.
 */
/**
 * Persistent warm-session daemon. Creates one `query()` and feeds it prompts
 * across turns so only the first turn pays the CLI/MCP/API boot; later turns
 * cost model time only. Session-only (entity/streaming/completion are stable
 * per session — only the prompt varies). Falls back to the one-shot path (via
 * launchOnExistingSandbox respawn) if this process dies.
 */
export async function runSdkDaemon(): Promise<void> {
  if (!CLAIM_MUTATION) {
    log("daemon: CLAIM_MUTATION env is required in sdk-daemon mode");
    process.exit(1);
  }
  if (!OPEN_SYNTHETIC_TURN_MUTATION || !COMPLETE_SYNTHETIC_TURN_MUTATION) {
    log(
      "daemon: synthetic turn mutation env vars are required in sdk-daemon mode",
    );
    process.exit(1);
  }

  // Single-daemon fence, part 1 (boot claim): if a live rival already owns the
  // pidfile, exit without touching its marker files. First writer wins. A dead
  // pid in the file (e.g. after KILL_PRIOR_AGENT_PROCESSES_CMD) is overwritten.
  const rivalPid = readDaemonPidFile();
  if (
    !Number.isNaN(rivalPid) &&
    rivalPid !== process.pid &&
    pidAlive(rivalPid)
  ) {
    log(
      `daemon: rival daemon pid=${rivalPid} already owns ${DAEMON_PID_FILE} — exiting`,
    );
    process.exit(0);
  }

  writeFileSync(DAEMON_PID_FILE, String(process.pid));
  writeFileSync(DAEMON_ENTITY_FILE, ENTITY_ID ?? "");
  writeFileSync(DAEMON_OPTS_FILE, DAEMON_OPTS_SIG);

  // Single-daemon fence, part 2: a launch racing past the boot claim (or an
  // optsmismatch respawn) overwrites the pidfile; the deposed daemon must exit
  // or it lives forever, double-claiming turns and flip-flopping the shared
  // streaming row. Deferred while a real turn is active so work is never
  // killed mid-flight — the rival idles on claim polling meanwhile. A missing
  // pidfile also means deposed (a kill+respawn removed it; the successor will
  // claim it).
  let deposedLogged = false;
  setInterval(() => {
    const owner = readDaemonPidFile();
    if (owner === process.pid) {
      deposedLogged = false;
      return;
    }
    const ownerLabel = Number.isNaN(owner) ? "none" : String(owner);
    if (supervisor.hasWork) {
      if (!deposedLogged) {
        deposedLogged = true;
        log(
          `daemon: deposed (pidfile owner=${ownerLabel}) — exiting after active turn`,
        );
      }
      return;
    }
    log(`daemon: deposed (pidfile owner=${ownerLabel}) — exiting`);
    process.exit(0);
  }, FENCE_POLL_INTERVAL_MS);

  const preflightOk = await runPreflightHeartbeat();
  if (!preflightOk) {
    log("daemon: preflight failed");
    process.exit(1);
  }
  startStreamingLoops();
  await refreshGithubToken();

  // Session mode establishes/continues the Claude session id used for resume.
  const sessionMode = prepareClaudeSessionState();
  const options = buildSdkOptions(sessionMode);
  const sdk = await loadSdk();
  const agentRunner = createWarmAgentRunner(sdk, options);
  currentAgentRunner = agentRunner;

  log(
    "runSdkDaemon started (entityId=" +
      (ENTITY_ID ?? "none") +
      ", mode=" +
      sessionMode.mode +
      ")",
  );

  // Daemon-pull: the claim watcher polls claimPendingTurn every 50ms while the
  // agent pump consumes the session-lifetime SDK stream (including synthetic
  // continuations between real turns).
  log("daemon: warm query() live, claim watcher started");
  startTurnWatchdog();
  startClaimWatcher(agentRunner);

  try {
    await runDaemonMessagePump(agentRunner);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    log("daemon: query failed — " + messageText);
    // Durability BEFORE completion, as failTurnAndExit does it: the SDK stream
    // died under a turn that may have committed work, and this daemon is
    // shutting down through the finally block below.
    persistTurnWork();
    try {
      const completionArgs: JsonObject = {
        [ENTITY_ID_FIELD ?? "sessionId"]: ENTITY_ID ?? "",
        success: false,
        result: null,
        error: "Agent SDK daemon failed: " + messageText,
        activityLog: serializeSteps(S.accumulatedSteps),
        ...getCurrentTurnLease(),
      };
      appendTurnCheckpoint(completionArgs);
      await callConvexWithRetry(
        "mutation",
        COMPLETION_MUTATION ?? "",
        completionArgs,
      );
    } catch {
      /* ignore */
    }
  } finally {
    // Only tear down markers this daemon still owns — after a fence
    // deposition a rival owns them (fence exits bypass this via
    // process.exit, but an SDK failure can reach here deposed).
    if (readDaemonPidFile() === process.pid) {
      try {
        unlinkSync(DAEMON_PID_FILE);
        unlinkSync(DAEMON_ENTITY_FILE);
        unlinkSync(DAEMON_OPTS_FILE);
        if (ENTITY_ID_FIELD === "sessionId") {
          const legacy = resolveLegacySessionDaemonPaths();
          try {
            unlinkSync(legacy.pid);
          } catch {
            /* ignore */
          }
          try {
            unlinkSync(legacy.entity);
          } catch {
            /* ignore */
          }
          try {
            unlinkSync(legacy.opts);
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    }
    await stopStreamingLoops();
  }
  process.exit(0);
}
