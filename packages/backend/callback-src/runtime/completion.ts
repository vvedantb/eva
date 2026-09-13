import {
  CODEX_PRICING_PER_MILLION,
  COMPLETION_MUTATION,
  ENTITY_ID,
  ENTITY_ID_FIELD,
  PROVIDER,
  ROOT_DIRECTORY,
  RUN_ID,
  SCRIPT_STARTED_AT,
  TOOL_STEP_TYPES,
  DONE_FILE,
  FIRST_ASSISTANT_EVENT_TIMEOUT_MS,
  FIRST_EVENT_TIMEOUT_MS,
  MAX_TOTAL_RUNTIME_MS,
  NO_OUTPUT_TIMEOUT_MS,
  POST_TEXT_STALL_TIMEOUT_MS,
  WORK_DIR,
  normalizedCodexModel,
  normalizedCursorModel,
  normalizedOpencodeModel,
} from "../config.js";
import { callConvexWithRetry, fetchWithTimeout } from "../http/convexClient.js";
import { getCodexAgentMessageText } from "../parse/toolSteps.js";
import { callbackState as S } from "../runtime/state.js";
import { mediaSearchDirs } from "../runtime/sandboxMedia.js";
import { appendClaimedTurnCompletion } from "../providers/claimedTurnLifecycle.js";
import { buildEntityMutationArgs } from "./daemonProcess.js";
import { persistTurnWork } from "./turnPersist.js";
import { flushStreaming, setFinalizingState } from "./heartbeats.js";
import { appendTurnCheckpoint } from "../runtime/turnCheckpoint.js";
import type {
  JsonObject,
  JsonValue,
  ProviderAttemptResult,
  ResultEvent,
} from "../types.js";
import { attemptElapsedMs, readResponseJson, tryParseJson } from "../utils.js";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "fs";
import { createHash } from "crypto";

function parseJsonObject(line: string): JsonObject | null {
  const parsed = tryParseJson(line);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  return parsed;
}

/** Idempotent done-file writer. */
export function writeDoneFile(
  status: string,
  extras?: Record<string, string | number | boolean | null>,
): void {
  if (S.doneFileWritten) return;
  S.doneFileWritten = true;
  try {
    const payload = {
      endedAt: Date.now(),
      startedAt: SCRIPT_STARTED_AT,
      durationMs: Date.now() - SCRIPT_STARTED_AT,
      status,
      provider: PROVIDER,
      entityId: ENTITY_ID || null,
      runId: RUN_ID || null,
      resultEventSeen: S.resultEventSeen,
      accumulatedStepCount: S.accumulatedSteps.length,
      parsedStreamEventCount: S.parsedStreamEventCount,
      rawLogBytesWritten: S.rawLogBytesWritten,
      ...extras,
    };
    writeFileSync(DONE_FILE, JSON.stringify(payload));
  } catch (err) {
    console.error(
      "Failed to write done file: " +
        String(err instanceof Error ? err.message : err),
    );
  }
}

export function computeCodexCostUsd(
  model: string,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
): number {
  const pricing = CODEX_PRICING_PER_MILLION[model];
  if (!pricing) return 0;
  const nonCachedInput = Math.max(0, inputTokens - cachedInputTokens);
  return (
    (nonCachedInput * pricing.input) / 1_000_000 +
    (cachedInputTokens * pricing.cached) / 1_000_000 +
    (outputTokens * pricing.output) / 1_000_000
  );
}

export function buildClaudeShapedResult(args: {
  provider: string;
  totalCostUsd: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  model: string;
}): string {
  return JSON.stringify({
    type: "result",
    provider: args.provider,
    total_cost_usd: args.totalCostUsd,
    duration_ms: args.durationMs,
    usage: {
      input_tokens: args.inputTokens,
      output_tokens: args.outputTokens,
      cache_read_input_tokens: args.cacheReadInputTokens,
      cache_creation_input_tokens: args.cacheCreationInputTokens,
    },
    modelUsage: args.model ? { [args.model]: {} } : {},
  });
}

type SyntheticResult = {
  sawResult: boolean;
  resultText: string;
  isError: boolean;
  durationMs: number;
  totalCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  model: string;
  /** Fallback prose from `type:"assistant"` lines (Cursor emits these). */
  assistantText: string;
};

/**
 * Reads the `{type:"result"}` line an SDK runner pushes at the end of a turn.
 *
 * Runners that own their own event loop (Cursor, OpenCode) also own the turn's
 * usage numbers, so completion picks up one line instead of reparsing the whole
 * stdout buffer — the reparse OpenCode needed while it ran as a CLI is gone.
 */
function readSyntheticResult(output: string): SyntheticResult {
  const found: SyntheticResult = {
    sawResult: false,
    resultText: "",
    isError: false,
    durationMs: 0,
    totalCostUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    model: "",
    assistantText: "",
  };
  const readNumberField = (source: JsonObject, key: string): number => {
    const value = source[key];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  };
  const assistantParts: string[] = [];
  for (const line of output.split("\n")) {
    const clean = line.trim();
    if (!clean) continue;
    try {
      const parsed = parseJsonObject(clean);
      if (!parsed) continue;
      if (parsed.type === "result") {
        found.sawResult = true;
        found.isError = Boolean(parsed.is_error);
        found.durationMs = readNumberField(parsed, "duration_ms");
        found.totalCostUsd = readNumberField(parsed, "total_cost_usd");
        found.model = typeof parsed.model === "string" ? parsed.model : "";
        if (typeof parsed.result === "string") {
          found.resultText = parsed.result;
        } else if (parsed.result !== undefined) {
          found.resultText = JSON.stringify(parsed.result);
        }
        if (
          parsed.usage &&
          typeof parsed.usage === "object" &&
          !Array.isArray(parsed.usage)
        ) {
          found.inputTokens = readNumberField(parsed.usage, "input_tokens");
          found.outputTokens = readNumberField(parsed.usage, "output_tokens");
          found.cacheReadTokens = readNumberField(
            parsed.usage,
            "cache_read_input_tokens",
          );
          found.cacheWriteTokens = readNumberField(
            parsed.usage,
            "cache_creation_input_tokens",
          );
        }
        continue;
      }
      if (
        parsed.type === "assistant" &&
        parsed.message &&
        typeof parsed.message === "object" &&
        !Array.isArray(parsed.message) &&
        Array.isArray(parsed.message.content)
      ) {
        for (const block of parsed.message.content) {
          if (
            block &&
            typeof block === "object" &&
            !Array.isArray(block) &&
            block.type === "text" &&
            typeof block.text === "string"
          ) {
            assistantParts.push(block.text);
          }
        }
      }
    } catch {
      /* skip malformed lines */
    }
  }
  found.assistantText = assistantParts.join("");
  return found;
}

/** Extracts the final result event from a provider attempt's event stream. */
export function extractResultEvent(output: string): ResultEvent | null {
  if (PROVIDER === "cursor" || PROVIDER === "opencode") {
    const found = readSyntheticResult(output);
    if (found.sawResult) {
      return {
        result: found.resultText || found.assistantText,
        isError: found.isError,
        rawResultEvent: buildClaudeShapedResult({
          provider: PROVIDER,
          totalCostUsd: found.totalCostUsd,
          durationMs: found.durationMs || attemptElapsedMs(),
          inputTokens: found.inputTokens,
          outputTokens: found.outputTokens,
          cacheReadInputTokens: found.cacheReadTokens,
          cacheCreationInputTokens: found.cacheWriteTokens,
          // OpenCode reports the model the server actually served the turn
          // with; Cursor's runner does not, so fall back to the configured id.
          model:
            found.model ||
            (PROVIDER === "opencode"
              ? normalizedOpencodeModel
              : normalizedCursorModel),
        }),
      };
    }
    if (found.assistantText) {
      return {
        result: found.assistantText,
        isError: false,
        rawResultEvent: "",
      };
    }
    return null;
  }

  if (PROVIDER === "codex") {
    let finalText = "";
    let lastInputTokens = 0;
    let lastCachedInputTokens = 0;
    let lastCacheWriteInputTokens = 0;
    let lastOutputTokens = 0;
    for (const line of output.split("\n")) {
      const clean = line.trim();
      if (!clean) continue;
      try {
        const parsed = parseJsonObject(clean);
        if (!parsed) continue;
        if (
          parsed.type === "item.completed" &&
          parsed.item &&
          typeof parsed.item === "object" &&
          !Array.isArray(parsed.item) &&
          parsed.item.type === "agent_message"
        ) {
          const messageText = getCodexAgentMessageText(parsed.item);
          if (messageText) finalText = messageText;
          continue;
        }
        if (
          parsed.type === "turn.completed" &&
          parsed.usage &&
          typeof parsed.usage === "object" &&
          !Array.isArray(parsed.usage)
        ) {
          const usage = parsed.usage;
          if (typeof usage.input_tokens === "number") {
            lastInputTokens = usage.input_tokens;
          }
          if (typeof usage.cached_input_tokens === "number") {
            lastCachedInputTokens = usage.cached_input_tokens;
          }
          if (typeof usage.cache_write_input_tokens === "number") {
            lastCacheWriteInputTokens = usage.cache_write_input_tokens;
          }
          if (typeof usage.output_tokens === "number") {
            lastOutputTokens = usage.output_tokens;
          }
        }
      } catch {
        /* skip malformed lines */
      }
    }
    if (!finalText) return null;
    const nonCachedInput = Math.max(0, lastInputTokens - lastCachedInputTokens);
    return {
      result: finalText,
      isError: false,
      rawResultEvent: buildClaudeShapedResult({
        provider: "codex",
        totalCostUsd: computeCodexCostUsd(
          normalizedCodexModel,
          lastInputTokens,
          lastCachedInputTokens,
          lastOutputTokens,
        ),
        durationMs: attemptElapsedMs(),
        inputTokens: nonCachedInput,
        outputTokens: lastOutputTokens,
        cacheReadInputTokens: lastCachedInputTokens,
        cacheCreationInputTokens: lastCacheWriteInputTokens,
        model: normalizedCodexModel,
      }),
    };
  }

  let resultEvent: ResultEvent | null = null;
  for (const line of output.split("\n")) {
    const clean = line.trim();
    if (!clean) continue;
    try {
      const parsed = parseJsonObject(clean);
      if (!parsed) continue;
      if (parsed.type === "result") {
        const r = parsed.result ?? "";
        const withProvider = JSON.stringify({ ...parsed, provider: "claude" });
        resultEvent = {
          result: typeof r === "string" ? r : JSON.stringify(r),
          isError: Boolean(parsed.is_error),
          rawResultEvent: withProvider,
        };
      }
    } catch {
      /* skip malformed lines */
    }
  }
  return resultEvent;
}

export function buildErrorMessage(
  code: number,
  fatalHeartbeatError: string,
  toolStallError: string,
  timedOutForMaxRuntime: boolean,
  timedOutForNoOutput: boolean,
  timedOutForFirstEvent: boolean,
  timedOutForFirstAssistant: boolean,
  timedOutAfterFirstText: boolean,
  timedOutForZombie: boolean,
): string {
  const agentName =
    PROVIDER === "codex"
      ? "Codex SDK"
      : PROVIDER === "opencode"
        ? "Opencode SDK"
        : PROVIDER === "cursor"
          ? "Cursor SDK"
          : "Claude CLI";
  if (fatalHeartbeatError) return fatalHeartbeatError;
  if (toolStallError) return toolStallError;
  if (timedOutForZombie) {
    return (
      agentName +
      " terminated because the agent process entered zombie state (likely a grandchild held stdio open after the agent exited)"
    );
  }
  if (timedOutForMaxRuntime) {
    return (
      agentName +
      " terminated after max runtime of " +
      MAX_TOTAL_RUNTIME_MS +
      "ms"
    );
  }
  if (timedOutForFirstEvent) {
    return (
      agentName +
      " produced no parseable stream-json events within " +
      FIRST_EVENT_TIMEOUT_MS +
      "ms"
    );
  }
  if (timedOutForFirstAssistant) {
    return (
      agentName +
      " initialized but produced no assistant response within " +
      FIRST_ASSISTANT_EVENT_TIMEOUT_MS +
      "ms — likely MCP initialization or API congestion"
    );
  }
  if (timedOutAfterFirstText) {
    return (
      agentName +
      " stalled after first text block for " +
      POST_TEXT_STALL_TIMEOUT_MS +
      "ms"
    );
  }
  if (timedOutForNoOutput) {
    return (
      agentName +
      " terminated after no stdout for " +
      NO_OUTPUT_TIMEOUT_MS +
      "ms"
    );
  }
  // Signal kills (128 + signal number) reached here only when no timeout flag
  // fired, so the process was stopped by something outside the callback: a new
  // message cancelling the run, the sandbox being stopped or hitting its
  // timeout, or the kernel OOM-killer. Report it as an interruption, not a raw
  // exit code — an interrupted turn is never a success.
  if (code === 137 || code === 143) {
    return (
      agentName +
      (code === 137
        ? " was killed before it finished — the sandbox ran out of memory."
        : " was stopped before it finished — the run was interrupted.") +
      " This usually means the sandbox was stopped or a new message cancelled the run, so nothing was completed. Send the request again on a running sandbox."
    );
  }
  return agentName + " exited with code " + code;
}

/** Signal death (direct or shell-translated) is never a successful result. */
export function providerAttemptWasInterrupted(
  attempt: Pick<ProviderAttemptResult, "code" | "terminatedBySignal">,
): boolean {
  return (
    attempt.terminatedBySignal || attempt.code === 137 || attempt.code === 143
  );
}

/** Any watchdog timeout or tool stall counts as a timed-out attempt. */
export function providerAttemptTimedOut(
  attempt: ProviderAttemptResult,
): boolean {
  return (
    attempt.timedOutAfterFirstText ||
    attempt.timedOutForNoOutput ||
    attempt.timedOutForMaxRuntime ||
    attempt.timedOutForFirstEvent ||
    attempt.timedOutForFirstAssistant ||
    attempt.timedOutForZombie ||
    Boolean(attempt.toolStallErrorMessage)
  );
}

/**
 * Maps a provider attempt + parsed result event to `{ success, error }`.
 * One-shot still owns task-commit and response-step dedup on top of this.
 */
export function resolveProviderAttemptOutcome(
  attempt: ProviderAttemptResult,
  resultEvent: ResultEvent | null,
): { success: boolean; error: string | null } {
  const agentWasInterrupted = providerAttemptWasInterrupted(attempt);
  const attemptEndedDueToTimeout = providerAttemptTimedOut(attempt);
  const runSucceededWithResult =
    resultEvent != null && !resultEvent.isError && !agentWasInterrupted;
  if (resultEvent?.isError) {
    return { success: false, error: resultEvent.result };
  }
  if (
    (!runSucceededWithResult && attempt.code !== 0) ||
    (attemptEndedDueToTimeout && !runSucceededWithResult)
  ) {
    return {
      success: false,
      error: appendDiagnosticTail(
        buildErrorMessage(
          attempt.code,
          S.fatalHeartbeatErrorMessage,
          attempt.toolStallErrorMessage,
          attempt.timedOutForMaxRuntime,
          attempt.timedOutForNoOutput,
          attempt.timedOutForFirstEvent,
          attempt.timedOutForFirstAssistant,
          attempt.timedOutAfterFirstText,
          attempt.timedOutForZombie,
        ),
      ),
    };
  }
  return { success: runSucceededWithResult, error: null };
}

/** Drain the stream into steps and mark them complete before reading the log. */
export async function drainStreamingAndCompleteSteps(): Promise<void> {
  await flushStreaming();
  for (const step of S.accumulatedSteps) step.status = "complete";
}

/**
 * Final streaming reconcile then persist. True means skip the completion
 * (lease lost or already finalizing).
 */
export async function reconcileStreamingAndPersist(): Promise<boolean> {
  if (await setFinalizingState()) return true;
  persistTurnWork();
  return false;
}

/** Shared success/failure completion envelope. Callers still decide the fields. */
export function buildTurnCompletionPayload(params: {
  success: boolean;
  result: JsonValue;
  error: string | null;
  activityLog: string | null;
  resultEvent?: ResultEvent | null;
  entityFieldFallback?: string;
}): JsonObject {
  return buildEntityMutationArgs(
    ENTITY_ID_FIELD ?? params.entityFieldFallback,
    ENTITY_ID,
    {
      success: params.success,
      result: params.result,
      error: params.error,
      activityLog: params.activityLog,
      ...(RUN_ID ? { runId: RUN_ID } : {}),
      ...(params.resultEvent?.rawResultEvent
        ? { rawResultEvent: params.resultEvent.rawResultEvent }
        : {}),
      ...(S.pendingQuestionData
        ? { pendingQuestion: S.pendingQuestionData }
        : {}),
    },
  );
}

/**
 * Posts a failure completion without media harvest. Callers persist first,
 * then choose whether to exit. A null activityLog tells Convex to keep the
 * last streaming snapshot.
 */
export async function postClaimedTurnFailureCompletion(params: {
  error: string;
  activityLog: string | null;
}): Promise<void> {
  const completionArgs = buildEntityMutationArgs(
    ENTITY_ID_FIELD,
    ENTITY_ID,
    {
      success: false,
      result: null,
      error: params.error,
      activityLog: params.activityLog,
      ...(RUN_ID ? { runId: RUN_ID } : {}),
    },
  );
  appendClaimedTurnCompletion(completionArgs);
  appendTurnCheckpoint(completionArgs);
  await callConvexWithRetry(
    "mutation",
    COMPLETION_MUTATION ?? "",
    completionArgs,
  );
}

export function appendDiagnosticTail(message: string): string {
  const details: string[] = [];
  const stdoutTail = S.rawOutput.slice(-1500).trim();
  const stderrTail = S.stderrOutput.slice(-1500).trim();
  if (stdoutTail) details.push("stdout tail:\n" + stdoutTail);
  if (stderrTail) details.push("stderr tail:\n" + stderrTail);
  if (details.length === 0) {
    details.push(
      "(stdout and stderr were empty — the agent likely failed before emitting any events, e.g. invalid model or auth)",
    );
  }
  return message + "\n\n" + details.join("\n\n");
}

async function uploadMediaFile(
  filePath: string,
  mimeType: string,
): Promise<string> {
  const urlRes = await callConvexWithRetry(
    "mutation",
    "screenshots:generateUploadUrl",
    {},
    3,
  );
  const urlValue =
    urlRes &&
    typeof urlRes === "object" &&
    !Array.isArray(urlRes) &&
    urlRes.value &&
    typeof urlRes.value === "string"
      ? urlRes.value
      : "";
  if (!urlValue) throw new Error("Missing upload URL");
  const fileData = readFileSync(filePath);
  const uploadRes = await fetchWithTimeout(
    urlValue,
    {
      method: "POST",
      headers: { "Content-Type": mimeType },
      body: fileData,
    },
    30000,
  );
  if (!uploadRes.ok) {
    throw new Error("Upload failed: " + uploadRes.status);
  }
  const uploadJson = await readResponseJson(uploadRes);
  if (
    uploadJson &&
    typeof uploadJson === "object" &&
    !Array.isArray(uploadJson) &&
    typeof uploadJson.storageId === "string"
  ) {
    return uploadJson.storageId;
  }
  throw new Error("Missing storageId in upload response");
}

/** Attaches uploaded media to the chat message the turn just wrote. */
async function attachChatMediaIfAny(
  uploaded: { storageId: string; fileName: string }[],
  target: { messageId?: string },
): Promise<void> {
  if (uploaded.length === 0) return;
  const mediaArgs: JsonObject = {
    parentId: ENTITY_ID ?? "",
    mediaStorageIds: uploaded.map((item) => item.storageId),
  };
  if (target.messageId) mediaArgs.messageId = target.messageId;
  await callConvexWithRetry("action", "screenshots:attachMedia", mediaArgs, 3);
}

/**
 * Sends the completion mutation, then attaches sandbox media.
 *
 * Completion runs first so `screenshots:attachMedia` can patch the assistant
 * message that was just written.
 */
export async function deliverCompletionWithMedia(
  completionArgs: JsonObject,
): Promise<void> {
  // Every success path runs persistTurnWork() before this, so the checkpoint's
  // afterSha is the pushed turn-end tip.
  appendTurnCheckpoint(completionArgs);
  await callConvexWithRetry(
    "mutation",
    COMPLETION_MUTATION ?? "",
    completionArgs,
  );
  await uploadAndAttachSandboxMedia({});
}

/**
 * Scans sandbox `recordings/` then `screenshots/` under the repo root and the
 * app rootDirectory, uploads all captured media (videos first, in capture
 * order), and attaches it to the last chat message.
 * Shared by the one-shot callback and the Claude sdk-daemon finalize path —
 * daemon turns previously skipped this, so chat never showed agent
 * recordings.
 *
 * Posted files move into `<dir>/.posted/` rather than being deleted, so a
 * later turn can reuse a capture (PR/Linear embeds) without recapturing.
 * Files whose upload failed stay at the top level and are retried by the
 * next turn's harvest — deleting them destroyed the only copy.
 *
 * Prefer calling via `deliverCompletionWithMedia` so the message exists before
 * attachMedia patches it.
 */
/**
 * Moves a posted deliverable into `<dir>/.posted/`. Same-name files
 * overwrite, so a re-posted capture keeps only its latest copy. The `.posted`
 * entry itself never matches the harvest's extension filters, so archived
 * files are not re-posted.
 */
function archivePostedFile(dir: string, file: string): void {
  const postedDir = dir + "/.posted";
  mkdirSync(postedDir, { recursive: true });
  renameSync(dir + "/" + file, postedDir + "/" + file);
}

export async function uploadAndAttachSandboxMedia(
  target: { messageId?: string },
): Promise<void> {
  // Task runs (RUN_ID set) have no chat message to attach to — only chat turns
  // scan. Anything a run leaves behind is picked up by the next chat turn.
  if (RUN_ID) return;

  const uploaded: { storageId: string; fileName: string }[] = [];
  // Agents re-capture the same frame more than once (a retried screenshot, a
  // verify loop); byte-identical files add chat noise, so only the first copy
  // of any content uploads. Distinct captures are the prompt's job — the
  // deliverable folders are documented as post-everything-to-chat.
  const seenDigests = new Set<string>();
  const isDuplicate = (filePath: string): boolean => {
    const digest = createHash("sha256")
      .update(readFileSync(filePath))
      .digest("hex");
    if (seenDigests.has(digest)) return true;
    seenDigests.add(digest);
    return false;
  };

  const { recordings, screenshots } = mediaSearchDirs(WORK_DIR, ROOT_DIRECTORY);

  for (const recDir of recordings) {
    if (!existsSync(recDir)) continue;
    for (const file of readdirSync(recDir)) {
      if (!/\.(webm|mp4|mov|avi)$/i.test(file)) continue;
      const fp = recDir + "/" + file;
      const mimeType = file.endsWith(".mp4") ? "video/mp4" : "video/webm";
      try {
        if (!isDuplicate(fp)) {
          const storageId = await uploadMediaFile(fp, mimeType);
          uploaded.push({ storageId, fileName: file });
        }
        archivePostedFile(recDir, file);
      } catch {
        /* upload failed — leave the file for the next turn's harvest */
      }
    }
  }

  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
  };
  for (const ssDir of screenshots) {
    if (!existsSync(ssDir)) continue;
    for (const file of readdirSync(ssDir)) {
      if (!/\.(png|jpg|jpeg|gif|webp)$/i.test(file)) continue;
      const fp = ssDir + "/" + file;
      const ext = file.split(".").pop()?.toLowerCase() ?? "png";
      const mimeType = mimeMap[ext] || "image/png";
      try {
        if (!isDuplicate(fp)) {
          const storageId = await uploadMediaFile(fp, mimeType);
          uploaded.push({ storageId, fileName: file });
        }
        archivePostedFile(ssDir, file);
      } catch {
        /* upload failed — leave the file for the next turn's harvest */
      }
    }
  }

  try {
    await attachChatMediaIfAny(uploaded, target);
  } catch (e) {
    console.error("Failed to attach sandbox media:", e);
  }
}

export function hasToolActivity(): boolean {
  return S.accumulatedSteps.some((step) => TOOL_STEP_TYPES.has(step.type));
}
