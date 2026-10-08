import {
  CLAIM_MUTATION,
  MAX_TOTAL_RUNTIME_MS,
  MODEL,
  NO_MESSAGE_TIMEOUT_MS,
  SYSTEM_PROMPT,
  WORK_DIR,
  codexReasoningEffort,
  normalizedCodexModel,
} from "../config.js";
import { callConvexWithRetry } from "../http/convexClient.js";
import { emitParsedStreamLine } from "../parse/streamRouter.js";
import { serializeSteps } from "../parse/stepBudget.js";
import { getCodexAgentMessageText } from "../parse/toolSteps.js";
import {
  buildCodexResultEvent,
  buildTurnCompletionPayload,
  deliverCompletionWithMedia,
  drainStreamingAndCompleteSteps,
  reconcileStreamingAndPersist,
} from "../runtime/completion.js";
import {
  startStreamingLoops,
  stopStreamingLoops,
} from "../runtime/heartbeats.js";
import {
  callbackState as S,
  resetDaemonTurnStreamingState,
} from "../runtime/state.js";
import { materializeTurnAttachments } from "../runtime/turnAttachments.js";
import { DaemonSupervisor } from "../runtime/daemonSupervisor.js";
import {
  prepareCodexSessionState,
  syncCodexStateToPersist,
  writeCodexSessionState,
} from "../session/codexSession.js";
import type { JsonObject, JsonValue, SessionMode } from "../types.js";
import { asJsonObject, log } from "../utils.js";
import {
  DAEMON_CLAIM_POLL_TIMING,
  bootWarmDaemon,
  callbackScriptWentStale,
  cleanOwnedMarkers,
  entityMutationArgs,
  sleep,
} from "../runtime/daemonProcess.js";
import { readCancelRequested } from "./claimPendingTurnParse.js";
import {
  appendClaimedTurnCompletion,
  finishClaimedTurn,
  readClaimedTurn,
  routeClaimedTurn,
  startClaimedTurn,
  type ClaimedTurn,
} from "./claimedTurnLifecycle.js";
import {
  CodexAppServerClient,
  type AppServerNotification,
} from "./codexAppServerClient.js";
import { resolveDaemonPaths } from "./daemonPaths.js";

const IDLE_EXIT_MS = DAEMON_CLAIM_POLL_TIMING.idleExitMs;
const POLL_INTERVAL_MS = DAEMON_CLAIM_POLL_TIMING.fastPollIntervalMs;

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

function stringField(value: JsonValue | undefined, field: string): string {
  const object = asJsonObject(value);
  return typeof object[field] === "string" ? object[field] : "";
}

function nestedId(value: JsonValue, field: string): string {
  return stringField(asJsonObject(value)[field], "id");
}

function resetTurnState(): void {
  resetDaemonTurnStreamingState();
  S.codexToolItemIds.clear();
  activeTurnStartedAt = 0;
  finalText = "";
}

function emitEvent(event: JsonObject): void {
  emitParsedStreamLine(JSON.stringify(event) + "\n");
}

export function normalizeAppServerNotification(
  notification: AppServerNotification,
): JsonObject | null {
  const { method, params } = notification;
  if (method === "turn/started") return { type: "turn.started" };
  if (method === "turn/completed") return { type: "turn.completed" };
  if (method === "item/started") {
    return { type: "item.started", item: asJsonObject(params.item) };
  }
  if (method === "item/completed") {
    return { type: "item.completed", item: asJsonObject(params.item) };
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
  const turn = asJsonObject(params.turn);
  const error = asJsonObject(turn.error);
  return typeof error.message === "string" ? error.message : null;
}

async function finalizeTurn(
  success: boolean,
  error: string | null,
): Promise<void> {
  await drainStreamingAndCompleteSteps();
  const result = finalText || S.currentStreamedContent || S.rawOutput;
  if (await reconcileStreamingAndPersist()) return;
  const usage = computeTurnUsageDelta(turnStartUsage, threadTotalUsage);
  // codex never sets S.pendingQuestionData (only the Claude parser emits a
  // question), so the shared envelope adds no pendingQuestion here.
  const completionArgs = buildTurnCompletionPayload({
    success,
    result,
    error,
    activityLog: serializeSteps(S.accumulatedSteps),
    rawResultEvent: usage ? buildCodexResultEvent(usage) : undefined,
  });
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
    const total = asJsonObject(
      asJsonObject(notification.params.tokenUsage).total,
    );
    // Keep the last known totals on a malformed notification: an empty object
    // here would turn into an all-zeros usage event at finalize.
    if (Object.keys(total).length > 0) threadTotalUsage = total;
  }
  const event = normalizeAppServerNotification(notification);
  if (event) emitEvent(event);
  if (notification.method === "item/completed") {
    const item = asJsonObject(notification.params.item);
    const text = getCodexAgentMessageText(item);
    if (text) finalText = text;
  }
  if (notification.method !== "turn/completed") return null;
  const turn = asJsonObject(notification.params.turn);
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

export async function runCodexAppServerDaemon(): Promise<void> {
  if (!CLAIM_MUTATION)
    throw new Error("CLAIM_MUTATION is required for Codex App Server mode");
  await bootWarmDaemon({
    paths,
    logPrefix: "codex daemon",
    hasActiveWork: () => supervisor.hasWork,
    onDeposedIdle: () => {
      exitWithError = true;
      supervisor.stop();
    },
  });
  startStreamingLoops();

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
      if (callbackScriptWentStale()) supervisor.noticeRefresh();
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
        entityMutationArgs({ model: MODEL, acceptTurn }),
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
        routeClaimedTurn({
          turn: claimedTurn,
          hasActiveRealTurn: supervisor.currentTurn !== null,
          isCancellationInFlight: supervisor.isCancellationInFlight,
          park: () => supervisor.parkClaim(claimedTurn),
          logPrefix: "codex daemon",
        });
      }
      if (supervisor.currentTurn === null && supervisor.pendingClaim !== null) {
        const next = supervisor.takeClaim();
        if (next === null) continue;
        await startTurn(client, next);
      }

      const now = Date.now();
      // App Server emits nothing while a tool runs, so a long silent tool call
      // is indistinguishable from a hang by event silence alone: while a tool
      // is in flight only the hard runtime cap applies, and the silence clock
      // restarts once the tool result lands.
      if (S.inFlightToolUses > 0) {
        lastEventAt = now;
      }
      if (
        supervisor.currentTurn !== null &&
        now - activeTurnStartedAt > MAX_TOTAL_RUNTIME_MS
      ) {
        await failActiveTurn(
          "The assistant exceeded the maximum turn runtime.",
        );
      } else if (
        supervisor.currentTurn !== null &&
        now - lastEventAt > NO_MESSAGE_TIMEOUT_MS
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
    cleanOwnedMarkers(paths);
    await stopStreamingLoops();
  }
  process.exit(exitWithError ? 1 : 0);
}
