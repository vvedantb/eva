import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { dirname } from "path";
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
  claudeThinkingDisabled,
  normalizedClaudeModel,
  settingsJson,
} from "../config.js";
import { evaMcpServers } from "../evaMcp.js";
import { buildClaudeStartupStep } from "../session/claudeSession.js";
import { emitParsedStreamLine } from "../parse/streamRouter.js";
import { updateThinkingStep } from "../parse/canonical.js";
import {
  appendToRawLogFile,
  recordSdkAttemptFailure,
  recordSdkRetry,
  trimBufferHead,
} from "../runtime/buffers.js";
import { buildCanUseTool } from "../runtime/pendingQuestion.js";
import { callbackState as S, resetAttemptState } from "../runtime/state.js";
import {
  startClaudeUsageReport,
  type ClaudeUsageResponseLike,
} from "../runtime/usageLimits.js";
import type {
  JsonObject,
  ProviderAttemptResult,
  SessionMode,
} from "../types.js";
import { log, tryParseJson } from "../utils.js";
import { buildStandardSdkAttemptResult } from "./attemptResult.js";
import { isZeroWorkTaskNotificationResult } from "./claudeResult.js";

const SDK_PACKAGE = "@anthropic-ai/claude-agent-sdk";
const SDK_VERSION = "0.3.258";

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
      const messageText =
        error instanceof Error ? error.message : String(error);
      log("usage limits: initialization wait failed — " + messageText);
    }
  }
  return await handle.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET();
}

/** Memoized: the warm daemon resolves pins repeatedly and `npm root -g` spawns a process. */
let cachedGlobalNpmRoots: string[] | null = null;

/**
 * Every directory a globally installed package may live in, preferred first.
 *
 * The seed installs the agent toolchain with `sudo npm install -g` (see
 * snapshotActions.ts), which lands in node's own prefix —
 * `/vercel/runtimes/node24/lib/node_modules` on a Vercel sandbox. This callback
 * runs as the unprivileged sandbox user, whose npm config points `npm root -g`
 * at a per-user prefix (`~/.global/npm/lib/node_modules`) holding only pnpm, so
 * probing `npm root -g` alone never saw the seeded toolchain: every fresh
 * sandbox npm-installed the Agent SDK again (~4.6s on the daemon boot critical
 * path) and reported the pinned global `claude` as version "unknown".
 *
 * Deriving the first root from `process.execPath` (node is `<prefix>/bin/node`)
 * is independent of whichever user's npm config is in effect. The `npm root -g`
 * answer stays as a second candidate for images that install elsewhere.
 */
function globalNpmRoots(): string[] {
  if (cachedGlobalNpmRoots !== null) return cachedGlobalNpmRoots;
  const roots: string[] = [
    dirname(dirname(process.execPath)) + "/lib/node_modules",
  ];
  try {
    const npmRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    if (npmRoot) roots.push(npmRoot);
  } catch {
    // No npm on PATH, or a broken npm config — the node-derived root still holds.
  }
  cachedGlobalNpmRoots = roots.filter(
    (root, index) => roots.indexOf(root) === index,
  );
  return cachedGlobalNpmRoots;
}

/** User-writable fallback install location (persists in home across resumes). */
const SDK_LOCAL_PREFIX = "/home/eva/.eva-agent-sdk";

/** Version recorded in `packageRoot`'s manifest, or null when unreadable. */
function installedPackageVersion(packageRoot: string): string | null {
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
 * Absolute entry path for an agent SDK pinned to `version`, preferring a global
 * install from the seed (see `globalNpmRoots` for why more than one root is
 * searched) and falling back to a one-time user-local prefix install under the
 * eva home (the callback runs as an unprivileged user, so a global `npm i -g`
 * fails with EACCES on the root-owned npm root).
 *
 * Every root is version-checked rather than merely tested for existence. The
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
  const localRoot = SDK_LOCAL_PREFIX + "/node_modules/" + pin.packageName;
  // First root holding the exact pin wins; a drifted root is only reported once
  // the search has failed everywhere, so a stale copy in one root stays quiet
  // while another root serves the pin.
  let driftedVersion: string | null = null;
  for (const root of globalNpmRoots()) {
    const globalRoot = root + "/" + pin.packageName;
    const globalVersion = installedPackageVersion(globalRoot);
    if (globalVersion === pin.version) return globalRoot + pin.entryRelPath;
    if (globalVersion !== null && driftedVersion === null) {
      driftedVersion = globalVersion;
    }
  }
  if (driftedVersion !== null) {
    log(
      "sdk version drift: global " +
        pin.packageName +
        " is " +
        driftedVersion +
        ", need " +
        pin.version +
        "; falling back to the pinned user-local copy",
    );
  }
  if (installedPackageVersion(localRoot) !== pin.version) {
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

/**
 * Narrows a serialized SDK message back into the JsonObject every parser
 * downstream takes.
 *
 * The SDK's message types are not structurally JSON — `SDKAssistantMessage`
 * carries an `@anthropic-ai/sdk` interface, so the union has no index
 * signature — while `claudeParseLine` and the daemon's helpers read arbitrary
 * keys off a JsonObject. Both callers already serialize each message for the
 * raw log, so the round trip is the boundary rather than extra work.
 */
export function sdkMessageJson(serialized: string): JsonObject | null {
  const parsed = tryParseJson(serialized);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  return parsed;
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

const CLAUDE_CODE_PACKAGE = "@anthropic-ai/claude-code";

/**
 * Version of the globally installed CLI package, from the first candidate root
 * that carries it at all (see `globalNpmRoots`), or null when no root has it.
 */
function globalClaudeCliVersion(): string | null {
  for (const root of globalNpmRoots()) {
    const version = installedPackageVersion(root + "/" + CLAUDE_CODE_PACKAGE);
    if (version !== null) return version;
  }
  return null;
}

/**
 * Locates the claude CLI binary the SDK should drive.
 *
 * The image's global install wins only while it is at the pinned version
 * (CLAUDE_CLI_PINNED_VERSION, set by launch.ts from claudeCliVersion.ts).
 * Otherwise the CLAUDE_BIN_PATH fallback that launch.ts provisions at the pin
 * is used. Models are gated on the CLI's own version, so preferring the global
 * unconditionally left snapshots seeded with an older CLI failing every turn
 * ("does not support this model", or a process that exits before its first
 * message and reads as "ended without a reply"). Both roots are checked by
 * manifest, like resolvePinnedSdkEntry, so a stale fallback never wins either.
 *
 * The global check reads the manifest from every candidate root rather than
 * `npm root -g` alone, because the seed's `sudo npm install -g` writes to node's
 * prefix while this process runs as an unprivileged user with a per-user npm
 * prefix — every fresh sandbox used to log the seeded, correctly pinned CLI as
 * "cli version drift: global claude is unknown".
 */
function claudeExecutablePath(): string {
  const pinned = process.env.CLAUDE_CLI_PINNED_VERSION || null;
  const fallback = process.env.CLAUDE_BIN_PATH || "";
  let globalBin = "";
  try {
    globalBin = execSync("command -v claude", { encoding: "utf8" }).trim();
  } catch {
    globalBin = "";
  }
  if (globalBin) {
    const globalVersion = globalClaudeCliVersion();
    if (pinned === null || globalVersion === pinned) return globalBin;
    log(
      "cli version drift: global claude is " +
        (globalVersion ?? "unknown") +
        ", need " +
        pinned +
        "; preferring the pinned fallback install",
    );
  }
  if (fallback && existsSync(fallback)) {
    // `<prefix>/bin/claude` → `<prefix>/lib/node_modules/<package>`.
    const fallbackRoot =
      dirname(dirname(fallback)) + "/lib/node_modules/" + CLAUDE_CODE_PACKAGE;
    const fallbackVersion = installedPackageVersion(fallbackRoot);
    if (pinned === null || fallbackVersion === pinned) return fallback;
    log(
      "cli version drift: fallback claude is " +
        (fallbackVersion ?? "unknown") +
        ", need " +
        pinned +
        "; no pinned binary available",
    );
    if (!globalBin) return fallback;
  }
  return globalBin || "claude";
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
  if (CLAIM_MUTATION || ENTITY_ID_FIELD === "sessionId") {
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

  // Current models (Fable 5, Opus 5/4.8/4.7, Sonnet 5) default thinking
  // display to "omitted": the API still thinks, but `thinking_delta` events
  // stream empty text, so claudeParseLine's reasoning step never fills and
  // the UI shows a long pause where Cursor/Codex show reasoning. Ask for
  // API-side summaries explicitly. Thinking-off keeps the settings.json
  // `alwaysThinkingEnabled: false` path — Fable 5 rejects an explicit
  // `{ type: "disabled" }` with a 400, so never send that here.
  const thinkingOption: Pick<SdkOptions, "thinking"> = claudeThinkingDisabled
    ? {}
    : { thinking: { type: "adaptive", display: "summarized" } };

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
    ...thinkingOption,
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
      const line = JSON.stringify(message) + "\n";
      const json = sdkMessageJson(line);
      if (json !== null && isZeroWorkTaskNotificationResult(json)) {
        sawZeroWorkTaskNotification = true;
        log("runClaudeSdkAttempt: ignored zero-work task notification result");
        continue;
      }
      emitParsedStreamLine(line);
      attemptOutput = trimBufferHead(attemptOutput + line);
      if (message.type === "result") {
        sawResult = true;
        resultIsError = message.is_error === true;
        if (resultIsError) {
          // Only the "success" subtype carries `result` — it holds the error
          // text when a turn ended on an API error. The error subtypes report
          // through `errors` instead.
          resultErrorMessage =
            message.subtype === "success"
              ? message.result
              : message.errors.join("\n");
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
        recordSdkRetry(messageText);
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
    recordSdkAttemptFailure(messageText);
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
  return buildStandardSdkAttemptResult({
    code,
    output: attemptOutput,
    timedOutForNoOutput,
    timedOutForMaxRuntime,
  });
}
