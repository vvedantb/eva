import { TURN_MAX_RUNTIME_ERROR } from "@eva/shared/agentTurnLimits";
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
  unwrapConvexMutationPayload,
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
import { serializeFinalSteps, serializeSteps } from "../parse/stepBudget.js";
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
import {
  confirmSteerAcks,
  deliverSteers,
  readSteers,
  steerClaimArgs,
} from "../runtime/steering.js";
import { persistTurnWork } from "../runtime/turnPersist.js";
import { beginTurnCheckpoint } from "../runtime/turnCheckpoint.js";
import {
  appendCurrentTurnLease,
  beginTurnOwnership,
  endTurnOwnership,
} from "../runtime/turnLease.js";
import { isJsonObject, log, trimmedString } from "../utils.js";
import {
  DAEMON_CLAIM_POLL_TIMING,
  bootWarmDaemon,
  callbackScriptWentStale,
  cleanOwnedMarkers,
  entityMutationArgs,
  sleep,
  selectClaimPollIntervalMs,
} from "../runtime/daemonProcess.js";
import type { JsonValue } from "../types.js";
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
import { trackClaudeGoalFrame } from "./claudeGoalSync.js";

const daemonPaths = resolveDaemonPaths();

const IDLE_EXIT_MS = DAEMON_CLAIM_POLL_TIMING.idleExitMs;
const PROMPT_POLL_INTERVAL_MS = DAEMON_CLAIM_POLL_TIMING.fastPollIntervalMs;
const WATCHDOG_TICK_MS = 5000;

const CANCEL_SETTLE_TIMEOUT_MS = 30_000;

let turnActive = false;
let turnStartedAtMs = 0;
let lastMessageAtMs = 0;

type DaemonMessage = Record<string, JsonValue>;

type AgentQuery = ReturnType<SdkModule["query"]>;

type DaemonTurn = { kind: "real" } | { kind: "synthetic"; messageId: string };

type WarmRunner = {
  push: (text: string, priority?: "next") => void;
  waitMessage: () => Promise<DaemonMessage | null>;
  drainPending: () => DaemonMessage[];
  hasPending: () => boolean;
  stopTask: (taskId: string) => Promise<void>;
  interrupt: () => Promise<void>;
  readUsage: () => Promise<ClaudeUsageResponseLike | null>;
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
let turnCancelRequestedAtMs = 0;

const recognisedSubagentToolUseIds = new Set<string>();
const settledSubagentToolUseIds = new Set<string>();
const unsettledBackgroundAgents = new Map<string, BackgroundAgentEntry>();
const pendingAgentStops = new Set<string>();
let currentAgentRunner: WarmRunner | null = null;
let usageRefreshInFlight = false;
let wakeIdlePump: (() => void) | null = null;

function beginWatchedTurn(): void {
  turnActive = true;
  turnStartedAtMs = Date.now();
  lastMessageAtMs = turnStartedAtMs;
}

function noteWatchedMessage(): void {
  lastMessageAtMs = Date.now();
}

function endWatchedTurn(): void {
  turnActive = false;
}

async function failTurnAndExit(error: string): Promise<never> {
  log("daemon: failing turn — " + error);
  persistTurnWork();
  try {
    await postClaimedTurnFailureCompletion({
      error,
      activityLog: serializeSteps(S.accumulatedSteps),
    });
  } catch {
  }
  cleanOwnedMarkers(daemonPaths);
  await stopStreamingLoops();
  process.exit(1);
}

async function exitWithoutCompletion(reason: string): Promise<void> {
  log("daemon: exiting without completion — " + reason);
  persistTurnWork();
  cleanOwnedMarkers(daemonPaths);
  await stopStreamingLoops();
}

function startTurnWatchdog(): void {
  const timer = setInterval(() => {
    const now = Date.now();
    if (supervisor.isCancellationInFlight) {
      if (now - turnCancelRequestedAtMs > CANCEL_SETTLE_TIMEOUT_MS) {
        log("daemon: cancelled turn did not settle in time — exiting");
        persistTurnWork();
        process.exit(1);
      }
      return;
    }
    if (!turnActive) return;
    if (S.awaitingQuestionAnswer) {
      turnStartedAtMs = now;
      lastMessageAtMs = now;
      return;
    }
    if (S.inFlightToolUses > 0) {
      lastMessageAtMs = now;
    }
    if (now - turnStartedAtMs > MAX_TOTAL_RUNTIME_MS) {
      turnActive = false;
      if (supervisor.currentTurn?.kind === "synthetic") {
        void failSyntheticTurn(
          TURN_MAX_RUNTIME_ERROR,
        );
      } else {
        void failTurnAndExit(
          TURN_MAX_RUNTIME_ERROR,
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

function createPromptStream(): {
  push: (text: string, priority?: "next") => void;
  iterable: AsyncIterable<SdkUserMessage>;
} {
  const queue: SdkUserMessage[] = [];
  let notify: (() => void) | null = null;
  const push = (text: string, priority?: "next"): void => {
    queue.push({
      type: "user",
      message: { role: "user", content: text },
      parent_tool_use_id: null,
      session_id: S.activeClaudeSessionId || "",
      ...(priority ? { priority } : {}),
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

function resetTurnState(): void {
  resetDaemonTurnStreamingState();
  S.awaitingQuestionAnswer = false;
}

async function finalizeTurn(
  output: string,
  readUsage: () => Promise<ClaudeUsageResponseLike | null>,
): Promise<void> {
  await drainStreamingAndCompleteSteps();
  const resultEvent = extractResultEvent(output);
  const activityLog = serializeFinalSteps(
    S.accumulatedSteps,
    resultEvent?.result ?? "",
  );
  const success = resultEvent ? !resultEvent.isError : false;
  const completionArgs = buildTurnCompletionPayload({
    success,
    result: resultEvent?.result ?? S.rawOutput,
    error: resultEvent?.isError ? resultEvent.result : null,
    activityLog,
    resultEvent,
  });
  appendClaimedTurnCompletion(completionArgs);
  if (await reconcileStreamingAndPersist()) return;
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
  const bookkeepingAt = Date.now();
  syncClaudeStateToPersist("daemon-turn");
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
    const id = block.id;
    if (typeof id === "string" && id.trim()) {
      recognisedSubagentToolUseIds.add(id.trim());
    }
  }
}

function shouldDropSubagentMessage(message: DaemonMessage): boolean {
  const parentId = trimmedString(message.parent_tool_use_id) ?? null;
  if (parentId === null) {
    return false;
  }
  return settledSubagentToolUseIds.has(parentId);
}

function shouldMintSyntheticTurn(message: DaemonMessage): boolean {
  if (message.type === "assistant" || message.type === "stream_event") {
    return true;
  }
  const parentId = trimmedString(message.parent_tool_use_id) ?? null;
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
  }
}

let harnessCatalogReportStarted = false;

const CATALOG_MAX_COMMANDS = 100;
const CATALOG_MAX_NAME_LENGTH = 100;
const CATALOG_MAX_DESCRIPTION_LENGTH = 2000;
const CATALOG_MAX_ARGUMENT_HINT_LENGTH = 400;

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
    }
  }
  return names;
}

function catalogDescription(description: string): string {
  const firstLine = description
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return (firstLine ?? "").slice(0, CATALOG_MAX_DESCRIPTION_LENGTH);
}

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

function noteHarnessInitMessage(
  message: DaemonMessage,
  query: AgentQuery,
): void {
  if (harnessCatalogReportStarted) return;
  if (message.type !== "system" || message.subtype !== "init") return;
  const cliVersion = trimmedString(message.claude_code_version);
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
    if (!isJsonObject(task)) {
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
  const toolUseId = trimmedString(message.tool_use_id);
  if (subtype === "task_started" && toolUseId) {
    if (trimmedString(message.task_type) === "local_bash") {
      return;
    }
    const entry: BackgroundAgentEntry = {
      toolUseId,
      taskId: trimmedString(message.task_id),
      description: trimmedString(message.description),
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
    const status = trimmedString(message.status);
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
  persistTurnWork();
  try {
    await drainStreamingAndCompleteSteps();
    const completionArgs = entityMutationArgs({
      messageId,
      success: false,
      result: null,
      error,
      activityLog: serializeSteps(S.accumulatedSteps),
    });
    appendCurrentTurnLease(completionArgs);
    await sendTurnCompletion(
      COMPLETE_SYNTHETIC_TURN_MUTATION ?? "",
      completionArgs,
    );
  } catch {
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
      entityMutationArgs({ model: MODEL }),
    );
    const messageId = readSyntheticTurnMessageId(result);
    const syntheticLease = readTurnLeaseIdentity(result);
    if (messageId === null || syntheticLease === null) {
      log("daemon: openSyntheticTurn returned no messageId or lease");
      return;
    }
    resetTurnState();
    beginTurnOwnership("provider", syntheticLease);
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
  await drainStreamingAndCompleteSteps();
  const resultEvent = extractResultEvent(output);
  const activityLog = serializeFinalSteps(
    S.accumulatedSteps,
    resultEvent?.result ?? "",
  );
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
  appendCurrentTurnLease(completionArgs);
  persistTurnWork();
  await sendTurnCompletion(
    COMPLETE_SYNTHETIC_TURN_MUTATION ?? "",
    completionArgs,
  );
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

function canTakeSteer(): boolean {
  return (
    supervisor.phase === "running" &&
    supervisor.currentTurn?.kind === "real" &&
    !S.awaitingQuestionAnswer
  );
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
      const steerArgs = steerClaimArgs(canTakeSteer());
      try {
        const claimed = await callConvexWithRetry(
          "mutation",
          CLAIM_MUTATION ?? "",
          entityMutationArgs({ model: MODEL, acceptTurn, ...steerArgs }),
        );
        confirmSteerAcks(steerArgs);
        const stopIds = readStopTaskToolUseIds(claimed);
        for (const toolUseId of stopIds) {
          pendingAgentStops.add(toolUseId);
        }
        await dispatchPendingAgentStops(agentRunner);
        if (readCancelRequested(claimed)) {
          handleCancelRequested(agentRunner);
        }
        await deliverSteers(readSteers(claimed), async (text) => {
          if (!canTakeSteer()) return false;
          agentRunner.push(text, "next");
          return true;
        });
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
          const routed = routeClaimedTurn({
            turn,
            hasActiveRealTurn: supervisor.currentTurn?.kind === "real",
            isCancellationInFlight: supervisor.isCancellationInFlight,
            park: () => supervisor.parkClaim(turn),
            logPrefix: "daemon",
          });
          if (routed === "parked") wakeIdlePump?.();
        }
      } catch {
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
      await new Promise<void>((resolve) => {
        wakeIdlePump = resolve;
        setTimeout(resolve, PROMPT_POLL_INTERVAL_MS);
      });
      wakeIdlePump = null;
      continue;
    }

    const message = await agentRunner.waitMessage();
    if (message === null) {
      if (supervisor.isCancellationInFlight) {
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
    trackClaudeGoalFrame(message);

    if (supervisor.isCancellationInFlight) {
      if (message.type !== "result") {
        continue;
      }
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

    if (supervisor.pendingClaim !== null && supervisor.currentTurn === null) {
      const parked = supervisor.takeClaim();
      if (parked === null) continue;
      await startRealAgentTurn(parked, agentRunner);
    }
  }
}

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
  emitParsedStreamLine(line);
  const nextOutput = trimBufferHead(output + line);

  const isResult = message.type === "result";
  return { output: nextOutput, isResult };
}

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

  const sessionMode = prepareClaudeSessionState();
  const sdk = await loadSdk();
  const options = buildSdkOptions(sessionMode);
  const agentRunner = createWarmAgentRunner(sdk, options);
  currentAgentRunner = agentRunner;

  log(
    "runSdkDaemon started (entityId=" +
      (ENTITY_ID ?? "none") +
      ", mode=" +
      sessionMode.mode +
      ")",
  );

  log("daemon: warm query() live, claim watcher started");
  startTurnWatchdog();
  startClaimWatcher(agentRunner);

  try {
    await runDaemonMessagePump(agentRunner);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    log("daemon: query failed — " + messageText);
    persistTurnWork();
    try {
      const completionArgs = entityMutationArgs({
        success: false,
        result: null,
        error: "Agent SDK daemon failed: " + messageText,
        activityLog: serializeSteps(S.accumulatedSteps),
      });
      appendCurrentTurnLease(completionArgs);
      await sendTurnCompletion(COMPLETION_MUTATION ?? "", completionArgs);
    } catch {
    }
  } finally {
    cleanOwnedMarkers(daemonPaths);
    await stopStreamingLoops();
  }
  process.exit(0);
}
