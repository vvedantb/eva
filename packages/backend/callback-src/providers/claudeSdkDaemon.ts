import { readdirSync } from "fs";
import { homedir } from "os";
import {
  CLAIM_MUTATION,
  COMPLETE_SYNTHETIC_TURN_MUTATION,
  COMPLETION_MUTATION,
  ENTITY_ID,
  HARNESS_CATALOG_TOKEN,
  MAX_TOTAL_RUNTIME_MS,
  MODEL,
  NO_MESSAGE_TIMEOUT_MS,
  OPEN_SYNTHETIC_TURN_MUTATION,
  UPDATE_BACKGROUND_AGENTS_MUTATION,
  WORK_DIR,
} from "../config.js";
import { resolveDaemonPaths } from "./daemonPaths.js";
import {
  callConvexWithRetry,
  callHarnessSkillCatalogReport,
  type HarnessCommandReport,
} from "../http/convexClient.js";
import {
  buildTurnCompletionPayload,
  deliverCompletionWithMedia,
  drainStreamingAndCompleteSteps,
  extractResultEvent,
  postClaimedTurnFailureCompletion,
  reconcileStreamingAndPersist,
  sendTurnCompletion,
  uploadAndAttachSandboxMedia,
} from "../runtime/completion.js";
import {
  startStreamingLoops,
  stopStreamingLoops,
} from "../runtime/heartbeats.js";
import { emitParsedStreamLine } from "../parse/streamRouter.js";
import { serializeSteps } from "../parse/stepBudget.js";
import { trimBufferHead } from "../runtime/buffers.js";
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
import {
  callbackState as S,
  resetDaemonTurnStreamingState,
} from "../runtime/state.js";
import {
  captureAndReportClaudeUsage,
  type ClaudeUsageResponseLike,
} from "../runtime/usageLimits.js";
import { materializeTurnAttachments } from "../runtime/turnAttachments.js";
import { persistTurnWork } from "../runtime/turnPersist.js";
import { beginTurnCheckpoint } from "../runtime/turnCheckpoint.js";
import {
  appendCurrentTurnLease,
  beginTurnOwnership,
  endTurnOwnership,
} from "../runtime/turnLease.js";
import {
  isJsonObject,
  log,
  readTrimmedString,
  unwrapConvexMutationPayload,
  errorText,
} from "../utils.js";
import {
  DAEMON_CLAIM_POLL_TIMING,
  bootWarmDaemon,
  callbackScriptWentStale,
  cleanOwnedMarkers,
  entityMutationArgs,
  sleep,
  selectClaimPollIntervalMs,
} from "../runtime/daemonProcess.js";
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
  routeClaimedTurn,
  startClaimedTurn,
  type ClaimedTurn,
} from "./claimedTurnLifecycle.js";
import { isZeroWorkTaskNotificationResult } from "./claudeResult.js";

// Entity-scoped daemon marker paths (see daemonPaths.ts). Legacy session paths
// are cleaned up on exit when this daemon is session-scoped.
const daemonPaths = resolveDaemonPaths();

// Exit if no new turn arrives for this long, so the sandbox can be reclaimed.
// Kept generous so a normal work session never pays a mid-session respawn (the
// respawn — re-upload + boot — is the ~20s "slow hi" users feel). Matches the
// keep-warm window of comparable agents (t3code reaps at 30min).
const IDLE_EXIT_MS = DAEMON_CLAIM_POLL_TIMING.idleExitMs;
// Poll interval for the claim mutation. Low enough to keep handoff→turn-start
// latency to ~one poll; the turn itself dominates so this only trims the tail.
const PROMPT_POLL_INTERVAL_MS = DAEMON_CLAIM_POLL_TIMING.fastPollIntervalMs;
// Idle backoff for that poll. At 50ms an idle daemon burns ~20 Convex mutation
// calls/s (~54k per 45-min idle window) purely to notice a turn that is not
// coming, and those silent executions flood `convex logs`. Once no turn is in
// flight and nothing has happened for the fast window, `selectClaimPollIntervalMs`
// polls at the idle interval instead — worst case adds ~1s before an idle daemon
// claims a fresh send, invisible next to model time-to-first-token. Any in-flight
// turn keeps the 50ms cadence so cancel/stop-task drains (which ride the same
// mutation) stay prompt even through long-silent tool runs.

// Per-turn watchdog. Without this a turn whose SDK query stalls or ends without
// emitting a result would never send a completion event, so the workflow's
// awaitEvent hangs until the 2h stale-session timeout (empty "Working…" bubble).
// Mirrors the one-shot path (claudeSdk.ts): fail the turn if it produces no SDK
// message for a while, or exceeds the hard runtime cap. Silence while a tool is
// in flight (S.inFlightToolUses > 0) is exempt — the SDK emits nothing during a
// tool run, so a long bash call would otherwise be killed as a hang (seen in
// prod). On a fire we send a failure completion (resolving awaitEvent) and exit
// so the next turn respawns a clean daemon rather than reusing a wedged query.
// Silence limit: NO_MESSAGE_TIMEOUT_MS (config.ts).
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
  hasPending: () => boolean;
  stopTask: (taskId: string) => Promise<void>;
  /** Interrupts the in-flight turn (cancel). Logs and no-ops when the SDK
   * query handle does not support it. */
  interrupt: () => Promise<void>;
  /** Reads the SDK's experimental plan-usage data; null when unavailable. */
  readUsage: () => Promise<ClaudeUsageResponseLike | null>;
  /** Re-asserts default permission mode. No-ops when the SDK handle lacks it. */
  resetPermissionMode: () => Promise<void>;
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
let sawFirstMessageThisTurn = false;
let sawAssistantThisTurn = false;
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

/** Starts the per-turn clocks and arms the watchdog for a new turn. */
function beginAgentTurnClock(): void {
  agentTurnStartedAt = Date.now();
  sawFirstMessageThisTurn = false;
  sawAssistantThisTurn = false;
  S.activeAttemptStartedAt = agentTurnStartedAt;
  beginWatchedTurn();
}

/** Tears down a synthetic turn once its completion was sent (or abandoned). */
function settleSyntheticTurn(): void {
  endWatchedTurn();
  resetTurnState();
  endTurnOwnership();
  supervisor.settleTurn();
  agentTurnOutput = "";
}

/** Fails whichever turn is live: a synthetic turn settles, a real one exits. */
function failCurrentTurn(error: string): Promise<void> {
  return supervisor.currentTurn?.kind === "synthetic"
    ? failSyntheticTurn(error)
    : failTurnAndExit(error);
}

/** Synthetic completion payload, fenced by the synthetic turn's lease. */
function syntheticCompletionArgs(
  messageId: string,
  fields: { success: boolean; result: JsonValue; error: string | null },
): JsonObject {
  const args = entityMutationArgs({
    messageId,
    ...fields,
    activityLog: serializeSteps(S.accumulatedSteps),
  });
  appendCurrentTurnLease(args);
  return args;
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
    await postClaimedTurnFailureCompletion({
      error,
      activityLog: serializeSteps(S.accumulatedSteps),
    });
  } catch {
    /* best-effort: exit regardless so the daemon does not wedge */
  }
  // Only unlink markers this daemon still owns — a deposed daemon that
  // deferred its fence exit through this failing turn would otherwise delete
  // the rival's pidfile and take the healthy daemon down with it.
  cleanOwnedMarkers(daemonPaths);
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
  cleanOwnedMarkers(daemonPaths);
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
      void failCurrentTurn("The assistant exceeded the maximum turn runtime.");
    } else if (now - lastMessageAtMs > NO_MESSAGE_TIMEOUT_MS) {
      turnActive = false;
      void failCurrentTurn(
        "The assistant stopped responding. Please try again.",
      );
    }
  }, WATCHDOG_TICK_MS);
  timer.unref?.();
}

/**
 * FIFO whose `next()` blocks until an item arrives, and resolves null once the
 * queue is closed and drained.
 */
function createAsyncQueue<T>(): {
  push: (item: T) => void;
  next: () => Promise<T | null>;
  close: () => void;
  size: () => number;
} {
  const items: T[] = [];
  let notify: (() => void) | null = null;
  let closed = false;
  const wake = (): void => {
    const resume = notify;
    notify = null;
    if (resume) resume();
  };
  return {
    push: (item) => {
      items.push(item);
      wake();
    },
    next: async () => {
      while (items.length === 0) {
        if (closed) return null;
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
      }
      return items.shift() ?? null;
    },
    close: () => {
      closed = true;
      wake();
    },
    size: () => items.length,
  };
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
  const queue = createAsyncQueue<SdkUserMessage>();
  const push = (text: string): void => {
    queue.push({
      type: "user",
      message: { role: "user", content: text },
      parent_tool_use_id: null,
      session_id: S.activeClaudeSessionId || "",
    });
  };
  const iterable: AsyncIterable<SdkUserMessage> = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          // The prompt queue is never closed, so null never arrives.
          const value = await queue.next();
          if (value === null) {
            return { value: undefined, done: true as const };
          }
          return { value, done: false as const };
        },
      };
    },
  };
  return { push, iterable };
}

/** Clears the per-turn accumulators so the next turn starts clean on the same query. */
function resetTurnState(): void {
  resetDaemonTurnStreamingState();
  S.awaitingQuestionAnswer = false;
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
  await drainStreamingAndCompleteSteps();
  const resultEvent = extractResultEvent(output);
  const activityLog = serializeSteps(S.accumulatedSteps);
  const success = resultEvent ? !resultEvent.isError : false;
  const completionArgs = buildTurnCompletionPayload({
    success,
    result: resultEvent?.result ?? S.rawOutput,
    error: resultEvent?.isError ? resultEvent.result : null,
    activityLog,
    resultEvent,
  });
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
  if (await reconcileStreamingAndPersist()) return;
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
  const payload = unwrapConvexMutationPayload(result);
  if (!payload) return null;
  const messageId = payload.messageId;
  return typeof messageId === "string" ? messageId : null;
}

function recogniseSubagentToolUses(message: DaemonMessage): void {
  if (message.type !== "assistant") {
    return;
  }
  const nested = message.message;
  if (!isJsonObject(nested)) {
    return;
  }
  const content = nested.content;
  if (!Array.isArray(content)) {
    return;
  }
  for (const block of content) {
    if (!isJsonObject(block)) {
      continue;
    }
    if (block.type !== "tool_use") {
      continue;
    }
    const name = block.name;
    if (name !== "Agent" && name !== "Task") {
      continue;
    }
    const id = readTrimmedString(block.id);
    if (id) recognisedSubagentToolUseIds.add(id);
  }
}

function shouldDropSubagentMessage(message: DaemonMessage): boolean {
  const parentId = readTrimmedString(message.parent_tool_use_id) ?? null;
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
  const parentId = readTrimmedString(message.parent_tool_use_id) ?? null;
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
    const messageText = errorText(error);
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
  const cliVersion = readTrimmedString(message.claude_code_version);
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
      const messageText = errorText(error);
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
  const toolUseId = readTrimmedString(message.tool_use_id);
  if (subtype === "task_started" && toolUseId) {
    const entry: BackgroundAgentEntry = {
      toolUseId,
      taskId: readTrimmedString(message.task_id),
      description: readTrimmedString(message.description),
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
    const status = readTrimmedString(message.status);
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
    await drainStreamingAndCompleteSteps();
    const completionArgs = syntheticCompletionArgs(messageId, {
      success: false,
      result: null,
      error,
    });
    await sendTurnCompletion(
      COMPLETE_SYNTHETIC_TURN_MUTATION ?? "",
      completionArgs,
    );
  } catch {
    /* best-effort */
  }
  settleSyntheticTurn();
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
    const syntheticLease = readTurnLeaseIdentity(result);
    if (messageId === null || syntheticLease === null) {
      log("daemon: openSyntheticTurn returned no messageId or lease");
      return;
    }
    resetTurnState();
    // A synthetic turn owns the heartbeat without occupying the claim slot.
    beginTurnOwnership("provider", syntheticLease);
    beginTurnCheckpoint();
    if (!supervisor.startTurn({ kind: "synthetic", messageId })) {
      log("daemon: synthetic turn opened after lifecycle moved; ignoring");
      endTurnOwnership();
      return;
    }
    beginAgentTurnClock();
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
  await drainStreamingAndCompleteSteps();
  const resultEvent = extractResultEvent(output);
  const success = resultEvent ? !resultEvent.isError : false;
  const completionArgs = syntheticCompletionArgs(messageId, {
    success,
    result: resultEvent?.result ?? S.rawOutput,
    error: resultEvent?.isError ? resultEvent.result : null,
  });
  if (S.pendingQuestionData) {
    completionArgs.pendingQuestion = S.pendingQuestionData;
  }
  // Durability BEFORE completion, exactly as finalizeTurn does it: a synthetic
  // turn has no workflow, so the server-side pushSandboxBranch step never runs
  // for it and this is the ONLY push. Work committed here sat local for hours
  // until the next real turn happened to push it. Ordering matters too — the
  // completion may immediately dequeue the next message, and a VM death after
  // that point erases anything not on origin (see turnPersist.ts).
  persistTurnWork();
  // completeSyntheticTurn closes this turn server-side; sendTurnCompletion
  // releases the lease first so a late heartbeat is judged stale, not a
  // takeover (session 225, 21 Sep 2026).
  await sendTurnCompletion(
    COMPLETE_SYNTHETIC_TURN_MUTATION ?? "",
    completionArgs,
  );
  // Synthetic completion has an exact placeholder id. Target it explicitly:
  // completeSyntheticTurn may dequeue another message before media finishes,
  // so attaching to the latest message could put these captures on that turn.
  await uploadAndAttachSandboxMedia({ messageId });
  syncClaudeStateToPersist("daemon-synthetic-turn");
  settleSyntheticTurn();
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
  beginAgentTurnClock();
  await agentRunner.resetPermissionMode();
  agentRunner.push(turn.prompt);
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
    const messageText = errorText(error);
    log("daemon: interrupt failed — " + messageText);
  });
}

function startClaimWatcher(agentRunner: WarmRunner): void {
  void (async () => {
    while (!supervisor.isStopping) {
      if (callbackScriptWentStale()) {
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
          routeClaimedTurn({
            turn,
            hasActiveRealTurn: supervisor.currentTurn?.kind === "real",
            isCancellationInFlight: supervisor.isCancellationInFlight,
            park: () => supervisor.parkClaim(turn),
            logPrefix: "daemon",
          });
        }
      } catch {
        /* retry on next poll */
      }
      const turnInFlight = supervisor.hasWork;
      await sleep(
        selectClaimPollIntervalMs({
          busy: turnInFlight,
          lastIdleActivityAtMs,
        }),
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
        await failCurrentTurn(
          "The assistant ended without a reply. Please try again.",
        );
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
): { output: string; isResult: boolean } {
  const messageType = typeof message.type === "string" ? message.type : "?";
  if (!sawFirstMessageThisTurn) {
    sawFirstMessageThisTurn = true;
    log(
      "daemon[timing]: first SDK message (" +
        messageType +
        ") +" +
        (Date.now() - turnStartedAt) +
        "ms after turn start",
    );
  }
  if (!sawAssistantThisTurn && messageType === "assistant") {
    sawAssistantThisTurn = true;
    log(
      "daemon[timing]: first assistant msg +" +
        (Date.now() - turnStartedAt) +
        "ms after turn start",
    );
  }
  const line = JSON.stringify(message) + "\n";
  emitParsedStreamLine(line);
  const nextOutput = trimBufferHead(output + line);

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

  const pending = createAsyncQueue<DaemonMessage>();

  void (async () => {
    try {
      for await (const raw of query) {
        const message = sdkMessageJson(JSON.stringify(raw));
        if (message === null) continue;
        noteHarnessInitMessage(message, query);
        pending.push(message);
      }
    } catch (error) {
      const messageText = errorText(error);
      log("daemon: agent query pump failed — " + messageText);
    } finally {
      pending.close();
    }
  })();

  const waitMessage = (): Promise<DaemonMessage | null> => pending.next();

  const hasPending = (): boolean => pending.size() > 0;

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

  const resetPermissionMode = async (): Promise<void> => {
    if (typeof query.setPermissionMode !== "function") {
      log("daemon: setPermissionMode unavailable on SDK query handle");
      return;
    }
    try {
      await query.setPermissionMode("default");
      log("daemon: permission mode set to default");
    } catch (error) {
      const message = errorText(error);
      log("daemon: setPermissionMode failed — " + message);
    }
  };

  const readUsage = (): Promise<ClaudeUsageResponseLike | null> =>
    readSdkPlanUsage(query);

  return {
    push,
    waitMessage,
    hasPending,
    stopTask,
    interrupt,
    readUsage,
    resetPermissionMode,
  };
}

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

  await bootWarmDaemon({
    paths: daemonPaths,
    logPrefix: "daemon",
    hasActiveWork: () => supervisor.hasWork,
    onDeposedIdle: () => {
      process.exit(0);
    },
  });
  startStreamingLoops();

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
    const messageText = errorText(error);
    log("daemon: query failed — " + messageText);
    // Durability BEFORE completion, as failTurnAndExit does it: the SDK stream
    // died under a turn that may have committed work, and this daemon is
    // shutting down through the finally block below.
    persistTurnWork();
    try {
      // Not postClaimedTurnFailureCompletion: the stream can die on a
      // synthetic turn or while idle, where no claim owns the turn.
      const completionArgs = entityMutationArgs({
        success: false,
        result: null,
        error: "Agent SDK daemon failed: " + messageText,
        activityLog: serializeSteps(S.accumulatedSteps),
      });
      appendCurrentTurnLease(completionArgs);
      await sendTurnCompletion(COMPLETION_MUTATION ?? "", completionArgs);
    } catch {
      /* ignore */
    }
  } finally {
    // Only tear down markers this daemon still owns — after a fence
    // deposition a rival owns them (fence exits bypass this via
    // process.exit, but an SDK failure can reach here deposed).
    cleanOwnedMarkers(daemonPaths);
    await stopStreamingLoops();
  }
  process.exit(0);
}
