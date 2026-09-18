import { readFileSync, unlinkSync, writeFileSync } from "fs";
import {
  CALLBACK_SCRIPT_FP,
  CLAIM_MUTATION,
  CONVEX_TOKEN,
  CONVEX_URL,
  DAEMON_OPTS_SIG,
  ENTITY_ID,
  ENTITY_ID_FIELD,
  MAX_TOTAL_RUNTIME_MS,
  MODEL,
  REPO_ID,
  RUN_ID,
  SYSTEM_PROMPT,
  WORK_DIR,
  codexReasoningEffort,
  normalizedCodexModel,
} from "../config.js";
import { callConvexWithRetry } from "../http/convexClient.js";
import { ensureGithubToken } from "./githubToken.js";
import { processRealtimeStdoutChunk } from "../parse/streamRouter.js";
import { serializeSteps } from "../parse/stepBudget.js";
import { getCodexAgentMessageText } from "../parse/toolSteps.js";
import { appendToRawLogFile, appendToRawOutput } from "../runtime/buffers.js";
import {
  buildClaudeShapedResult,
  computeCodexCostUsd,
  deliverCompletionWithMedia,
} from "../runtime/completion.js";
import {
  flushStreaming,
  runPreflightHeartbeat,
  setFinalizingState,
  startStreamingLoops,
  stopStreamingLoops,
} from "../runtime/heartbeats.js";
import { callbackState as S } from "../runtime/state.js";
import { materializeTurnAttachments } from "../runtime/turnAttachments.js";
import { persistTurnWork } from "../runtime/turnPersist.js";
import { getCurrentTurnLease } from "../runtime/turnLease.js";
import { DaemonSupervisor } from "../runtime/daemonSupervisor.js";
import {
  prepareCodexSessionState,
  syncCodexStateToPersist,
  writeCodexSessionState,
} from "../session/codexSession.js";
import type { JsonObject, JsonValue, SessionMode } from "../types.js";
import { attemptElapsedMs, log } from "../utils.js";
import { readCancelRequested } from "./claimPendingTurnParse.js";
import {
  appendClaimedTurnCompletion,
  finishClaimedTurn,
  readClaimedTurn,
  shouldParkClaimedTurn,
  startClaimedTurn,
  type ClaimedTurn,
} from "./claimedTurnLifecycle.js";
import {
  CodexAppServerClient,
  type AppServerNotification,
} from "./codexAppServerClient.js";
import {
  resolveDaemonPaths,
  resolveLegacySessionDaemonPaths,
} from "./daemonPaths.js";

const IDLE_EXIT_MS = 45 * 60 * 1000;
const POLL_INTERVAL_MS = 50;
const FENCE_POLL_INTERVAL_MS = 5000;
const NO_EVENT_TIMEOUT_MS = 5 * 60 * 1000;

type CodexDaemonTurn = { providerTurnId: string };

const paths = resolveDaemonPaths();
const supervisor = new DaemonSupervisor<ClaimedTurn, CodexDaemonTurn>();
let activeTurnStartedAt = 0;
let lastEventAt = 0;
let lastIdleActivityAt = Date.now();
let finalText = "";
let exitWithError = false;
// Cumulative thread usage from `thread/tokenUsage/updated`; per-turn usage is
// the delta of this total across the turn boundary (the protocol reports no
// per-turn usage on `turn/completed`).
let threadTotalUsage: JsonObject | null = null;
let turnStartUsage: JsonObject | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function objectValue(value: JsonValue | undefined): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function stringField(value: JsonValue | undefined, field: string): string {
  const object = objectValue(value);
  return typeof object[field] === "string" ? object[field] : "";
}

function nestedId(value: JsonValue, field: string): string {
  return stringField(objectValue(value)[field], "id");
}

function entityArgs(
  fields: Record<string, JsonValue>,
): Record<string, JsonValue> {
  return { [ENTITY_ID_FIELD ?? "sessionId"]: ENTITY_ID ?? "", ...fields };
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readOwnerPid(): number {
  try {
    return Number(readFileSync(paths.pid, "utf8").trim());
  } catch {
    return Number.NaN;
  }
}

function callbackWentStale(): boolean {
  if (!CALLBACK_SCRIPT_FP) return false;
  try {
    return (
      readFileSync("/tmp/eva-callback-fp", "utf8").trim() !== CALLBACK_SCRIPT_FP
    );
  } catch {
    return false;
  }
}

function resetTurnState(): void {
  S.accumulatedSteps.length = 0;
  S.currentStreamedContent = "";
  S.streamedAssistantTextThisMessage = false;
  S.pendingParagraphBreak = false;
  S.resultEventSeen = false;
  S.rawOutput = "";
  S.lastProcessed = 0;
  S.realtimeOutputBuffer = "";
  S.inFlightToolUses = 0;
  S.codexToolItemIds.clear();
  S.pendingQuestionData = "";
  S.todoState.length = 0;
  S.lastStepType = "thinking";
  activeTurnStartedAt = 0;
  finalText = "";
}

function emitEvent(event: JsonObject): void {
  const line = JSON.stringify(event) + "\n";
  appendToRawLogFile(line);
  appendToRawOutput(line);
  processRealtimeStdoutChunk(line);
}

export function normalizeAppServerNotification(
  notification: AppServerNotification,
): JsonObject | null {
  const { method, params } = notification;
  if (method === "turn/started") return { type: "turn.started" };
  if (method === "turn/completed") return { type: "turn.completed" };
  if (method === "item/started") {
    return { type: "item.started", item: objectValue(params.item) };
  }
  if (method === "item/completed") {
    return { type: "item.completed", item: objectValue(params.item) };
  }
  if (
    method === "item/agentMessage/delta" &&
    typeof params.delta === "string"
  ) {
    return { type: "item.agent_message.delta", delta: params.delta };
  }
  if (
    method === "item/reasoning/textDelta" &&
    typeof params.delta === "string"
  ) {
    return { type: "item.reasoning.delta", delta: params.delta };
  }
  if (
    method === "item/reasoning/summaryTextDelta" &&
    typeof params.delta === "string"
  ) {
    return { type: "item.reasoning.delta", delta: params.delta };
  }
  return null;
}

/**
 * Per-turn usage as the delta of cumulative thread totals (codex 0.146.0
 * `thread/tokenUsage/updated` reports `TokenUsageBreakdown` fields, camelCase).
 */
function readTokenCount(source: JsonObject | null, key: string): number {
  const value = source ? source[key] : 0;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function computeTurnUsageDelta(
  start: JsonObject | null,
  end: JsonObject | null,
): {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
} | null {
  if (!end) return null;
  const delta = (key: string): number =>
    Math.max(0, readTokenCount(end, key) - readTokenCount(start, key));
  return {
    inputTokens: delta("inputTokens"),
    cachedInputTokens: delta("cachedInputTokens"),
    cacheWriteInputTokens: delta("cacheWriteInputTokens"),
    outputTokens: delta("outputTokens"),
  };
}

function turnError(params: JsonObject): string | null {
  const turn = objectValue(params.turn);
  const error = objectValue(turn.error);
  return typeof error.message === "string" ? error.message : null;
}

async function finalizeTurn(
  success: boolean,
  error: string | null,
): Promise<void> {
  await flushStreaming();
  for (const step of S.accumulatedSteps) step.status = "complete";
  const result = finalText || S.currentStreamedContent || S.rawOutput;
  if (await setFinalizingState()) return;
  persistTurnWork();
  const usage = computeTurnUsageDelta(turnStartUsage, threadTotalUsage);
  const completionArgs: JsonObject = {
    [ENTITY_ID_FIELD ?? "sessionId"]: ENTITY_ID ?? "",
    success,
    result,
    error,
    activityLog: serializeSteps(S.accumulatedSteps),
    ...(RUN_ID ? { runId: RUN_ID } : {}),
    ...(usage
      ? {
          rawResultEvent: buildClaudeShapedResult({
            provider: "codex",
            totalCostUsd: computeCodexCostUsd(
              normalizedCodexModel,
              usage.inputTokens,
              usage.cachedInputTokens,
              usage.outputTokens,
            ),
            durationMs: attemptElapsedMs(),
            inputTokens: Math.max(
              0,
              usage.inputTokens - usage.cachedInputTokens,
            ),
            outputTokens: usage.outputTokens,
            cacheReadInputTokens: usage.cachedInputTokens,
            cacheCreationInputTokens: usage.cacheWriteInputTokens,
            model: normalizedCodexModel,
          }),
        }
      : {}),
  };
  appendClaimedTurnCompletion(completionArgs);
  await deliverCompletionWithMedia(completionArgs);
  finishClaimedTurn();
  syncCodexStateToPersist();
  log("codex daemon: turn finalized success=" + success);
}

async function failActiveTurn(error: string): Promise<void> {
  if (supervisor.currentTurn === null && activeTurnStartedAt === 0) return;
  supervisor.beginFinalizing();
  try {
    await finalizeTurn(false, error);
  } catch {
    /* best effort */
  }
  exitWithError = true;
  supervisor.stop();
}

function processNotification(
  notification: AppServerNotification,
): Promise<void> | null {
  lastEventAt = Date.now();
  if (notification.method === "thread/tokenUsage/updated") {
    const total = objectValue(
      objectValue(notification.params.tokenUsage).total,
    );
    // Keep the last known totals on a malformed notification: an empty object
    // here would turn into an all-zeros usage event at finalize.
    if (Object.keys(total).length > 0) threadTotalUsage = total;
  }
  const event = normalizeAppServerNotification(notification);
  if (event) emitEvent(event);
  if (notification.method === "item/completed") {
    const item = objectValue(notification.params.item);
    const text = getCodexAgentMessageText(item);
    if (text) finalText = text;
  }
  if (notification.method !== "turn/completed") return null;
  const turn = objectValue(notification.params.turn);
  const status = typeof turn.status === "string" ? turn.status : "failed";
  lastIdleActivityAt = Date.now();
  if (supervisor.isCancellationInFlight || status === "interrupted") {
    finishClaimedTurn();
    resetTurnState();
    supervisor.settleTurn();
    return null;
  }
  supervisor.beginFinalizing();
  return finalizeTurn(
    status === "completed",
    turnError(notification.params),
  ).then(() => {
    resetTurnState();
    supervisor.settleTurn();
  });
}

async function refreshGithubToken(): Promise<void> {
  await ensureGithubToken({
    convexUrl: CONVEX_URL,
    convexToken: CONVEX_TOKEN,
    repoId: REPO_ID,
  });
}

async function establishThread(
  client: CodexAppServerClient,
  sessionMode: SessionMode,
): Promise<string> {
  if (sessionMode.sessionId) {
    try {
      const resumed = await client.request("thread/resume", {
        threadId: sessionMode.sessionId,
      });
      const resumedId = nestedId(resumed, "thread") || sessionMode.sessionId;
      log("codex daemon: resumed thread " + resumedId);
      return resumedId;
    } catch (error) {
      log(
        "codex daemon: resume failed, starting fresh: " +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }
  const started = await client.request("thread/start", {
    model: normalizedCodexModel,
    cwd: WORK_DIR,
    approvalPolicy: "never",
    serviceName: "eva",
  });
  const threadId = nestedId(started, "thread");
  if (!threadId) throw new Error("Codex App Server did not return a thread id");
  return threadId;
}

async function startTurn(
  client: CodexAppServerClient,
  turn: ClaimedTurn,
): Promise<void> {
  resetTurnState();
  if (!supervisor.beginStarting({ providerTurnId: "" })) {
    throw new Error("Codex daemon could not enter starting state");
  }
  startClaimedTurn(turn);
  await materializeTurnAttachments(turn);
  const text = SYSTEM_PROMPT
    ? SYSTEM_PROMPT + "\n\n" + turn.prompt
    : turn.prompt;
  activeTurnStartedAt = Date.now();
  lastEventAt = activeTurnStartedAt;
  // Snapshot before the request: tokenUsage notifications for this turn can
  // arrive ahead of the turn/start response on the same stream.
  turnStartUsage = threadTotalUsage;
  const result = await client.request("turn/start", {
    threadId: S.activeCodexThreadId,
    input: [{ type: "text", text }],
    cwd: WORK_DIR,
    model: normalizedCodexModel,
    approvalPolicy: "never",
    sandboxPolicy: { type: "externalSandbox", networkAccess: "enabled" },
    ...(codexReasoningEffort ? { effort: codexReasoningEffort } : {}),
  });
  const providerTurnId = nestedId(result, "turn");
  if (!providerTurnId)
    throw new Error("Codex App Server did not return a turn id");
  if (!supervisor.markRunning({ providerTurnId })) {
    throw new Error("Codex daemon could not enter running state");
  }
  lastIdleActivityAt = activeTurnStartedAt;
  S.activeAttemptStartedAt = activeTurnStartedAt;
  log("codex daemon: turn started " + providerTurnId);
}

function cleanMarkers(): void {
  if (readOwnerPid() !== process.pid) return;
  for (const path of [paths.pid, paths.entity, paths.opts]) {
    try {
      unlinkSync(path);
    } catch {
      /* ignore */
    }
  }
  if (ENTITY_ID_FIELD === "sessionId") {
    const legacy = resolveLegacySessionDaemonPaths();
    for (const path of [legacy.pid, legacy.entity, legacy.opts]) {
      try {
        unlinkSync(path);
      } catch {
        /* ignore */
      }
    }
  }
}

export async function runCodexAppServerDaemon(): Promise<void> {
  if (!CLAIM_MUTATION)
    throw new Error("CLAIM_MUTATION is required for Codex App Server mode");
  const rivalPid = readOwnerPid();
  if (
    !Number.isNaN(rivalPid) &&
    rivalPid !== process.pid &&
    pidAlive(rivalPid)
  ) {
    log("codex daemon: live rival already owns entity; exiting");
    process.exit(0);
  }
  writeFileSync(paths.pid, String(process.pid));
  writeFileSync(paths.entity, ENTITY_ID ?? "");
  writeFileSync(paths.opts, DAEMON_OPTS_SIG);

  const fence = setInterval(() => {
    if (readOwnerPid() !== process.pid && !supervisor.hasWork) {
      exitWithError = true;
      supervisor.stop();
    }
  }, FENCE_POLL_INTERVAL_MS);
  fence.unref?.();

  const preflightOk = await runPreflightHeartbeat();
  if (!preflightOk) process.exit(1);
  startStreamingLoops();
  await refreshGithubToken();

  const client = new CodexAppServerClient();
  try {
    // App Server reads CODEX_HOME during startup, so hydrate credentials and
    // runtime config before spawning it rather than immediately before resume.
    const sessionMode = prepareCodexSessionState();
    client.start();
    await client.initialize();
    S.activeCodexThreadId = await establishThread(client, sessionMode);
    writeCodexSessionState();
    syncCodexStateToPersist();
    emitEvent({ type: "thread.started", thread_id: S.activeCodexThreadId });
    log("codex daemon: app-server ready thread=" + S.activeCodexThreadId);

    while (!supervisor.isStopping) {
      if (callbackWentStale()) supervisor.noticeRefresh();
      const refreshDecision = supervisor.decideRefresh({
        watchedTurnActive: supervisor.currentTurn !== null,
        backgroundAgentCount: 0,
        sdkMessagePending: client.hasNotifications(),
      });
      if (refreshDecision.action === "exit") break;
      const terminalError = client.getError();
      if (terminalError) throw terminalError;

      for (const notification of client.drainNotifications()) {
        const completion = processNotification(notification);
        if (completion) await completion;
      }

      const acceptTurn =
        supervisor.phase === "idle" && supervisor.pendingClaim === null;

      const claimed = await callConvexWithRetry(
        "mutation",
        CLAIM_MUTATION,
        entityArgs({ model: MODEL, acceptTurn }),
      );
      const providerTurnId = supervisor.currentTurn?.providerTurnId ?? "";
      if (
        readCancelRequested(claimed) &&
        providerTurnId &&
        supervisor.beginCancellation()
      ) {
        // Fire-and-forget like the claude daemon: an awaited interrupt can
        // stall claiming for the full request timeout, and its failure must
        // not tear the daemon down — the turn settles via `turn/completed`.
        void client
          .request("turn/interrupt", {
            threadId: S.activeCodexThreadId,
            turnId: providerTurnId,
          })
          .catch((error) => {
            const message =
              error instanceof Error ? error.message : String(error);
            log("codex daemon: interrupt failed — " + message);
          });
      }
      const claimedTurn = readClaimedTurn(claimed);
      if (claimedTurn) {
        const currentLease = getCurrentTurnLease();
        if (
          shouldParkClaimedTurn({
            hasActiveRealTurn: supervisor.currentTurn !== null,
            isCancellationInFlight: supervisor.isCancellationInFlight,
            isFinalizing: false,
            currentLeaseTurnId: currentLease?.turnId ?? null,
            claimedLeaseTurnId: claimedTurn.turnLease?.turnId ?? null,
          })
        ) {
          // A cancel response can carry the next queued prompt in the same
          // mutation; claimPendingTurn already cleared it server-side, so
          // parking is the only lossless option. A follow-up send during
          // finalizing is a different turn and must be parked too.
          if (!supervisor.parkClaim(claimedTurn)) {
            log("codex daemon: duplicate claimed turn ignored");
          }
        } else {
          // Mid-turn claims are the workflow's per-turn re-stage of the
          // prompt this turn is already running — parking and replaying it
          // after the turn would execute the same prompt twice.
          log(
            "codex daemon: claim discarded while real turn active (prompt lost; pendingTurn was already cleared)",
          );
        }
      }
      if (supervisor.currentTurn === null && supervisor.pendingClaim !== null) {
        const next = supervisor.takeClaim();
        if (next === null) continue;
        await startTurn(client, next);
      }

      const now = Date.now();
      if (
        supervisor.currentTurn !== null &&
        now - activeTurnStartedAt > MAX_TOTAL_RUNTIME_MS
      ) {
        await failActiveTurn(
          "The assistant exceeded the maximum turn runtime.",
        );
      } else if (
        supervisor.currentTurn !== null &&
        now - lastEventAt > NO_EVENT_TIMEOUT_MS
      ) {
        await failActiveTurn(
          "The assistant stopped responding. Please try again.",
        );
      } else if (
        !supervisor.hasWork &&
        now - lastIdleActivityAt > IDLE_EXIT_MS
      ) {
        break;
      }
      await sleep(POLL_INTERVAL_MS);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("codex daemon failed: " + message);
    await failActiveTurn("Codex App Server failed: " + message);
  } finally {
    client.stop();
    cleanMarkers();
    await stopStreamingLoops();
  }
  process.exit(exitWithError ? 1 : 0);
}
