import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import type {
  CanUseTool,
  Options,
  Query,
  SDKUserMessage,
  query,
} from "@anthropic-ai/claude-agent-sdk";
import {
  ALLOWED_TOOLS,
  BLOCKING_QUESTIONS_ENABLED,
  CLAIM_MUTATION,
  CLAUDE_RUNTIME_CONFIG_DIR,
  ENTITY_ID_FIELD,
  MAX_TOTAL_RUNTIME_MS,
  NO_OUTPUT_CHECK_INTERVAL_MS,
  NO_OUTPUT_TIMEOUT_MS,
  SYSTEM_PROMPT,
  WORK_DIR,
  claudeEffort,
  normalizedClaudeModel,
  settingsJson,
} from "../config.js";
import { evaMcpServers } from "../evaMcp.js";
import { buildClaudeStartupStep } from "../session/claudeSession.js";
import { processRealtimeStdoutChunk } from "../parse/streamRouter.js";
import { updateThinkingStep } from "../parse/canonical.js";
import {
  appendToRawLogFile,
  appendToRawOutput,
  trimBufferHead,
} from "../runtime/buffers.js";
import { buildCanUseTool } from "../runtime/pendingQuestion.js";
import { callbackState as S, resetAttemptState } from "../runtime/state.js";
import {
  startClaudeUsageReport,
  type ClaudeUsageResponseLike,
} from "../runtime/usageLimits.js";
import type { ProviderAttemptResult, SessionMode } from "../types.js";
import { log } from "../utils.js";
import { isZeroWorkTaskNotificationResult } from "./claudeResult.js";

const SDK_PACKAGE = "@anthropic-ai/claude-agent-sdk";
const SDK_VERSION = "0.3.201";

export type JsonLike =
  | string
  | number
  | boolean
  | null
  | JsonLike[]
  | { [key: string]: JsonLike };

/** Official SDK types are erased from the standalone callback bundle. */
export type SdkCanUseTool = CanUseTool;
export type SdkOptions = Options;
export type SdkUserMessage = SDKUserMessage;
export type SdkQuery = Query;
export type SdkModule = { query: typeof query };

/**
 * Reads the plan-usage data behind `/usage` off a live query handle.
 *
 * The method name is explicitly marked experimental by the SDK, so a version
 * that renames or drops it must degrade rather than throw — the caller wraps
 * this in `captureClaudeUsage`, which swallows the rest.
 */
export async function readSdkPlanUsage(
  handle: SdkQuery,
): Promise<ClaudeUsageResponseLike | null> {
  if (
    typeof handle.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET !==
    "function"
  ) {
    log("usage limits: this SDK query handle exposes no usage method");
    return null;
  }
  if (typeof handle.initializationResult === "function") {
    try {
      await handle.initializationResult();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      log("usage limits: initialization wait failed — " + messageText);
    }
  }
  return await handle.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET();
}

/** Resolves the sandbox's global npm root once (e.g. /usr/lib/node_modules). */
export function globalNpmRoot(): string {
  return execSync("npm root -g", { encoding: "utf8" }).trim();
}

/** User-writable fallback install location (persists in home across resumes). */
const SDK_LOCAL_PREFIX = "/home/eva/.eva-agent-sdk";

/** Version recorded in `packageRoot`'s manifest, or null when unreadable. */
function installedSdkVersion(packageRoot: string): string | null {
  try {
    const manifest: JsonLike = JSON.parse(
      readFileSync(packageRoot + "/package.json", "utf8"),
    );
    if (
      typeof manifest !== "object" ||
      manifest === null ||
      Array.isArray(manifest)
    ) {
      return null;
    }
    const version = manifest.version;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

/**
 * Absolute entry path for an agent SDK pinned to `version`, preferring the base
 * Image's global install and falling back to a one-time user-local prefix
 * install under the eva home (the callback runs as the unprivileged `eva` user,
 * so a global `npm i -g` fails with EACCES on the root-owned npm root).
 *
 * Both roots are version-checked rather than merely tested for existence. The
 * seed guard in snapshotActions only asserts the package directory is present,
 * so a snapshot built before a pin moved keeps serving the old version forever.
 * That drift fails quietly instead of loudly: the stream parsers match one
 * SDK's event names exactly, so an unexpected version yields zero canonical
 * events and the turn reports no activity at all while still returning its
 * final answer.
 */
export function resolvePinnedSdkEntry(pin: {
  packageName: string;
  version: string;
  entryRelPath: string;
}): string {
  const globalRoot = globalNpmRoot() + "/" + pin.packageName;
  const localRoot = SDK_LOCAL_PREFIX + "/node_modules/" + pin.packageName;
  const globalVersion = installedSdkVersion(globalRoot);
  if (globalVersion === pin.version) return globalRoot + pin.entryRelPath;
  if (globalVersion !== null) {
    log(
      "sdk version drift: global " +
        pin.packageName +
        " is " +
        globalVersion +
        ", need " +
        pin.version +
        "; falling back to the pinned user-local copy",
    );
  }
  if (installedSdkVersion(localRoot) !== pin.version) {
    log(
      "installing " +
        pin.packageName +
        "@" +
        pin.version +
        " to " +
        SDK_LOCAL_PREFIX,
    );
    execSync(
      "mkdir -p " +
        SDK_LOCAL_PREFIX +
        " && npm install --prefix " +
        SDK_LOCAL_PREFIX +
        " " +
        pin.packageName +
        "@" +
        pin.version,
      { encoding: "utf8", timeout: 180_000 },
    );
  }
  return localRoot + pin.entryRelPath;
}

/** Imports the Agent SDK version this callback's parsers were written for. */
export async function loadSdk(): Promise<SdkModule> {
  const mod: SdkModule = await import(
    resolvePinnedSdkEntry({
      packageName: SDK_PACKAGE,
      version: SDK_VERSION,
      entryRelPath: "/sdk.mjs",
    })
  );
  return mod;
}

/**
 * Locates the claude CLI binary the SDK should drive: the image's global
 * install when it is on PATH, else the CLAUDE_BIN_PATH fallback install —
 * launch.ts provisions one under a /tmp prefix (not on PATH) when the
 * global is missing.
 */
function claudeExecutablePath(): string {
  try {
    return execSync("command -v claude", { encoding: "utf8" }).trim();
  } catch {
    const fallback = process.env.CLAUDE_BIN_PATH || "";
    return fallback && existsSync(fallback) ? fallback : "claude";
  }
}

function readPromptText(): string {
  return readFileSync("/tmp/design-prompt.txt", "utf8");
}

export function buildSdkOptions(sessionMode: SessionMode): SdkOptions {
  // Map SDK option shapes from the existing config (model, system prompt,
  // allowed tools, MCP, permissions, session resume). Formerly mirrored
  // Claude CLI flags; those builders are gone.
  const extraArgs: Record<string, string> = { settings: settingsJson };
  return buildSdkOptionsFromParts(sessionMode, extraArgs);
}

const EVA_SDK_SYSTEM_APPEND =
  "You are running inside Eva, a platform that runs coding agents in remote sandboxes against GitHub repos. Treat the workspace as the active repo checkout.";

function buildSdkOptionsFromParts(
  sessionMode: SessionMode,
  extraArgs: Record<string, string>,
  tools: "agent" | "none" = "agent",
): SdkOptions {
  const allowedToolsOption: { allowedTools: string[] } =
    tools === "agent" && ALLOWED_TOOLS
      ? { allowedTools: ALLOWED_TOOLS.split(",") }
      : { allowedTools: [] };

  // Blocking questions need `canUseTool`, which the SDK ignores under
  // `bypassPermissions`. When enabled we switch to `default` mode and let the
  // gate auto-allow every tool except AskUserQuestion (which waits for the user).
  // Otherwise keep the original bypass behaviour (no per-tool gating).
  const permissionOption: Pick<
    SdkOptions,
    "permissionMode" | "allowDangerouslySkipPermissions" | "canUseTool"
  > =
    tools === "agent" && BLOCKING_QUESTIONS_ENABLED
      ? {
          permissionMode: "default",
          allowDangerouslySkipPermissions: false,
          canUseTool: buildCanUseTool(),
        }
      : {
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
        };

  // Suppress the claude engine's per-turn NON-ESSENTIAL model calls (topic /
  // title / flavour-text side calls) — measured as a ~6s second API call
  // that delays turn completion after the visible reply.
  // Policy A: delete CLAUDE_CODE_DISABLE_BACKGROUND_TASKS so session SDK
  // children can Bash-background (panel tracks/kills). Do not set the key to
  // undefined — some spawn paths stringify it. Only warm daemons (CLAIM_MUTATION
  // set) and session attempts may background — one-shot task/project runs exit
  // after `result`, which would kill any backgrounded child, so launch.ts's =1
  // must survive for them.
  const env: Record<string, string | undefined> = {
    ...process.env,
    CLAUDE_CONFIG_DIR: CLAUDE_RUNTIME_CONFIG_DIR,
    DISABLE_NON_ESSENTIAL_MODEL_CALLS: "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    DISABLE_TELEMETRY: "1",
    DISABLE_AUTOUPDATER: "1",
    DISABLE_ERROR_REPORTING: "1",
    // Defer MCP/tool schemas when they exceed ~10% of context (agent turns only).
    ENABLE_TOOL_SEARCH: "auto",
  };
  if (
    CLAIM_MUTATION ||
    ENTITY_ID_FIELD === "sessionId" ||
    ENTITY_ID_FIELD === "chatId"
  ) {
    delete env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS;
  }

  const effortOption: Pick<SdkOptions, "effort"> =
    claudeEffort === "low" ||
    claudeEffort === "medium" ||
    claudeEffort === "high" ||
    claudeEffort === "xhigh" ||
    claudeEffort === "max"
      ? { effort: claudeEffort }
      : {};

  return {
    cwd: WORK_DIR,
    model: normalizedClaudeModel,
    pathToClaudeCodeExecutable: claudeExecutablePath(),
    systemPrompt: SYSTEM_PROMPT
      ? {
          type: "preset",
          preset: "claude_code",
          append: `${EVA_SDK_SYSTEM_APPEND}\n\n${SYSTEM_PROMPT}`,
        }
      : {
          type: "preset",
          preset: "claude_code",
          append: EVA_SDK_SYSTEM_APPEND,
        },
    ...permissionOption,
    // Emit token-level partial (`stream_event`) messages so claudeParseLine can
    // stream text deltas into the reply live (dedup guards the final message).
    includePartialMessages: true,
    ...allowedToolsOption,
    env,
    ...(sessionMode.mode === "session" && sessionMode.sessionId
      ? { sessionId: sessionMode.sessionId }
      : {}),
    ...(sessionMode.mode === "resume" && sessionMode.sessionId
      ? { resume: sessionMode.sessionId }
      : {}),
    extraArgs,
    ...(Object.keys(evaMcpServers).length > 0
      ? { mcpServers: evaMcpServers }
      : {}),
    ...effortOption,
  };
}

/**
 * Runs one Claude turn via the Agent SDK (`query()`).
 *
 * Integration model: every SDKMessage the query yields is serialized to a JSON
 * line and pushed through the realtime pipeline (`processRealtimeStdoutChunk`
 * -> claudeParseLine -> canonical events -> accumulated steps / session
 * capture / result detection), so streaming, activity, session persistence and
 * completion share the same parser as other stream-json providers.
 */
export async function runClaudeSdkAttempt(
  sessionMode: SessionMode,
): Promise<ProviderAttemptResult> {
  resetAttemptState();
  S.activeAttemptStartedAt = Date.now();
  const startupStep = buildClaudeStartupStep();
  updateThinkingStep(startupStep.label, startupStep.detail);
  log(
    "runClaudeSdkAttempt started (mode=" +
      sessionMode.mode +
      ", sessionId=" +
      (sessionMode.sessionId || "none") +
      ")",
  );

  let attemptOutput = "";
  let lastMessageAt = Date.now();
  let timedOutForNoOutput = false;
  let timedOutForMaxRuntime = false;
  let sawResult = false;
  let resultIsError = false;
  let resultErrorMessage = "";
  let queryErrorMessage = "";
  let sawZeroWorkTaskNotification = false;

  const sdk = await loadSdk();
  let effectiveMode = sessionMode;
  let q = sdk.query({
    prompt: readPromptText(),
    options: buildSdkOptions(effectiveMode),
  });

  const interrupt = async (): Promise<void> => {
    try {
      if (q.interrupt) await q.interrupt();
    } catch {
      /* already finished */
    }
  };
  const healthTimer = setInterval(() => {
    const now = Date.now();
    // A turn paused on a blocking question produces no SDK messages by design —
    // keep the timers fresh so it is never killed while genuinely waiting.
    if (S.awaitingQuestionAnswer) {
      S.activeAttemptStartedAt = now;
      lastMessageAt = now;
      return;
    }
    if (now - S.activeAttemptStartedAt > MAX_TOTAL_RUNTIME_MS) {
      timedOutForMaxRuntime = true;
      log("runClaudeSdkAttempt: max runtime exceeded — interrupting");
      void interrupt();
      return;
    }
    // The SDK emits nothing between a tool_use and its tool_result, so a
    // long-running tool (Bash allows 10min; subagent Task calls longer) is
    // indistinguishable from a hang by message silence alone: while a tool is
    // in flight only the hard runtime cap
    // applies, and the silence clock restarts once the tool result lands.
    if (S.inFlightToolUses > 0) {
      lastMessageAt = now;
    }
    // Idle only counts before the result event; after it the turn is done.
    if (!sawResult && now - lastMessageAt > NO_OUTPUT_TIMEOUT_MS * 5) {
      timedOutForNoOutput = true;
      log("runClaudeSdkAttempt: no SDK messages — interrupting");
      void interrupt();
    }
  }, NO_OUTPUT_CHECK_INTERVAL_MS);

  const consumeQuery = async (): Promise<void> => {
    for await (const message of q) {
      lastMessageAt = Date.now();
      if (isZeroWorkTaskNotificationResult(message)) {
        sawZeroWorkTaskNotification = true;
        log(
          "runClaudeSdkAttempt: ignored zero-work task notification result",
        );
        continue;
      }
      const line = JSON.stringify(message) + "\n";
      appendToRawLogFile(line);
      attemptOutput = trimBufferHead(attemptOutput + line);
      appendToRawOutput(line);
      processRealtimeStdoutChunk(line);
      if (message.type === "result") {
        sawResult = true;
        resultIsError = message.is_error === true;
        if (resultIsError && typeof message.result === "string") {
          resultErrorMessage = message.result;
        }
      }
      if (timedOutForMaxRuntime || timedOutForNoOutput) break;
    }
  };

  try {
    try {
      await consumeQuery();
      if (sawZeroWorkTaskNotification && !sawResult) {
        log(
          "runClaudeSdkAttempt: retrying prompt after zero-work task notification",
        );
        sawZeroWorkTaskNotification = false;
        q = sdk.query({
          prompt: readPromptText(),
          options: buildSdkOptions(effectiveMode),
        });
        await consumeQuery();
      }
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : String(error);
      // Self-heal a stale persisted session id: a prior attempt that died
      // before Claude ran can persist a session id whose conversation was
      // never created, making `resume` fail. Retry once as a fresh
      // conversation with the same id so persistence stays consistent.
      if (
        effectiveMode.mode === "resume" &&
        effectiveMode.sessionId &&
        messageText.includes("No conversation found with session ID")
      ) {
        log(
          "runClaudeSdkAttempt: resume target missing — retrying as a new session with the same id",
        );
        appendToRawLogFile("[sdk-retry] " + messageText + "\n");
        sawResult = false;
        resultIsError = false;
        effectiveMode = { mode: "session", sessionId: effectiveMode.sessionId };
        q = sdk.query({
          prompt: readPromptText(),
          options: buildSdkOptions(effectiveMode),
        });
        await consumeQuery();
      } else {
        throw error;
      }
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    queryErrorMessage = messageText;
    log("runClaudeSdkAttempt: query failed — " + messageText);
    appendToRawLogFile("[sdk-error] " + messageText + "\n");
    S.stderrOutput = trimBufferHead(S.stderrOutput + messageText + "\n");
  } finally {
    clearInterval(healthTimer);
  }

  // Plan usage-limit reading, taken while the query handle is still alive. The
  // stream's `rate_limit_event`s already populated whichever window they named;
  // this fills in the rest. Reporting is fire-and-forget — the turn's outcome is
  // already decided below and must not depend on it.
  startClaudeUsageReport({
    readUsage: () => readSdkPlanUsage(q),
    error: resultErrorMessage || queryErrorMessage || undefined,
  });

  const code =
    sawResult &&
    !resultIsError &&
    !timedOutForMaxRuntime &&
    !timedOutForNoOutput
      ? 0
      : 1;
  log(
    "runClaudeSdkAttempt finished in " +
      String(Date.now() - S.activeAttemptStartedAt) +
      "ms (code=" +
      code +
      ", sawResult=" +
      sawResult +
      ", resultIsError=" +
      resultIsError +
      ", timedOutForNoOutput=" +
      timedOutForNoOutput +
      ", timedOutForMaxRuntime=" +
      timedOutForMaxRuntime +
      ", outputBytes=" +
      attemptOutput.length +
      (queryErrorMessage ? ", queryError=" + queryErrorMessage : "") +
      ")",
  );
  return {
    code,
    terminatedBySignal: false,
    output: attemptOutput,
    timedOutForNoOutput,
    timedOutForMaxRuntime,
    timedOutForFirstEvent: false,
    timedOutForFirstAssistant: false,
    timedOutAfterFirstText: false,
    timedOutForZombie: false,
    toolStallErrorMessage: "",
  };
}
