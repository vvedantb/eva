import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { dirname } from "path";
import type {
  CanUseTool,
  HookCallback,
  Options,
  Query,
  SDKUserMessage,
  query,
} from "@anthropic-ai/claude-agent-sdk";
import {
  ALLOWED_TOOLS,
  CLAIM_MUTATION,
  CLAUDE_RUNTIME_CONFIG_DIR,
  ENTITY_ID_FIELD,
  MAX_TOTAL_RUNTIME_MS,
  NO_OUTPUT_CHECK_INTERVAL_MS,
  NO_OUTPUT_TIMEOUT_MS,
  SYSTEM_PROMPT,
  WORK_DIR,
  WORKSPACE_ROOT,
  claudeEffort,
  claudeThinkingDisabled,
  normalizedClaudeModel,
  settingsJson,
} from "../config.js";
import { evaMcpServers, hasRepoMcpFile } from "../evaMcp.js";
import { buildClaudeStartupStep } from "../session/claudeSession.js";
import { emitParsedStreamLine } from "../parse/streamRouter.js";
import {
  recordSdkAttemptFailure,
  recordSdkRetry,
  trimBufferHead,
} from "../runtime/buffers.js";
import { buildCanUseTool } from "../runtime/pendingQuestion.js";
import { lowMemoryNotice } from "../runtime/vmMemory.js";
import { callbackState as S } from "../runtime/state.js";
import {
  startClaudeUsageReport,
  type ClaudeUsageResponseLike,
} from "../runtime/usageLimits.js";
import type {
  JsonObject,
  ProviderAttemptResult,
  SessionMode,
} from "../types.js";
import { log, readTurnPrompt, tryParseJsonObject } from "../utils.js";
import { beginSdkAttempt, finishSdkAttempt } from "./attemptResult.js";
import { isZeroWorkTaskNotificationResult } from "./claudeResult.js";

const SDK_PACKAGE = "@anthropic-ai/claude-agent-sdk";
const SDK_VERSION = "0.3.282";

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

const NODE_GLOBAL_ROOT =
  dirname(dirname(process.execPath)) + "/lib/node_modules";

let cachedGlobalNpmRoots: string[] | null = null;

function globalNpmRoots(): string[] {
  if (cachedGlobalNpmRoots !== null) return cachedGlobalNpmRoots;
  const roots: string[] = [NODE_GLOBAL_ROOT];
  try {
    const npmRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    if (npmRoot) roots.push(npmRoot);
  } catch {
  }
  cachedGlobalNpmRoots = roots.filter(
    (root, index) => roots.indexOf(root) === index,
  );
  return cachedGlobalNpmRoots;
}

const SDK_LOCAL_PREFIX = "/home/eva/.eva-agent-sdk";

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
  let driftedVersion: string | null = null;
  const nodeRoot = NODE_GLOBAL_ROOT + "/" + pin.packageName;
  if (installedPackageVersion(nodeRoot) === pin.version) {
    return nodeRoot + pin.entryRelPath;
  }
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
  return tryParseJsonObject(serialized);
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

function binPackageVersion(
  binPath: string,
  packageName: string,
): string | null {
  return installedPackageVersion(
    dirname(dirname(binPath)) + "/lib/node_modules/" + packageName,
  );
}

/**
 * Locates the CLI binary a provider SDK should drive.
 *
 * The image's global install wins only while it is at the version this launch
 * provisioned (`<PROVIDER>_CLI_PINNED_VERSION`, set by launch.ts). Otherwise the
 * `<PROVIDER>_BIN_PATH` fallback that launch.ts installs is used. Models are
 * gated on the CLI's own version, so preferring the global unconditionally left
 * snapshots seeded with an older CLI failing every turn ("does not support this
 * model", or a process that exits before its first message and reads as "ended
 * without a reply"). Both roots are checked by manifest, like
 * resolvePinnedSdkEntry, so a stale fallback never wins either.
 *
 * The global check reads the manifest of the exact binary `command -v` returns
 * (see `binPackageVersion`), mirroring the install guard in launch.ts — the two
 * must agree on which copy counts, or launch skips the fallback install while
 * this falls back to a stale global.
 *
 * Shared by the Claude and Codex loaders: both are an SDK compiled into this
 * bundle spawning a separately installed binary, and both float that binary to
 * the registry's latest, so both need the same drift check.
 */
export function resolvePinnedCliBinary(cli: {
  packageName: string;
  binName: string;
  pinnedVersion: string | null;
  fallbackBinPath: string;
}): string {
  const pinned = cli.pinnedVersion;
  let globalBin = "";
  try {
    globalBin = execSync("command -v " + cli.binName, {
      encoding: "utf8",
    }).trim();
  } catch {
    globalBin = "";
  }
  if (globalBin) {
    const globalVersion = binPackageVersion(globalBin, cli.packageName);
    if (pinned === null || globalVersion === pinned) return globalBin;
    log(
      "cli version drift: global " +
        cli.binName +
        " is " +
        (globalVersion ?? "unknown") +
        ", need " +
        pinned +
        "; preferring the pinned fallback install",
    );
  }
  if (cli.fallbackBinPath && existsSync(cli.fallbackBinPath)) {
    const fallbackVersion = binPackageVersion(
      cli.fallbackBinPath,
      cli.packageName,
    );
    if (pinned === null || fallbackVersion === pinned) {
      return cli.fallbackBinPath;
    }
    log(
      "cli version drift: fallback " +
        cli.binName +
        " is " +
        (fallbackVersion ?? "unknown") +
        ", need " +
        pinned +
        "; no pinned binary available",
    );
    if (!globalBin) return cli.fallbackBinPath;
  }
  return globalBin || cli.binName;
}

function claudeExecutablePath(): string {
  return resolvePinnedCliBinary({
    packageName: CLAUDE_CODE_PACKAGE,
    binName: "claude",
    pinnedVersion: process.env.CLAUDE_CLI_PINNED_VERSION || null,
    fallbackBinPath: process.env.CLAUDE_BIN_PATH || "",
  });
}

export function buildSdkOptions(sessionMode: SessionMode): SdkOptions {
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

  const permissionOption: Pick<
    SdkOptions,
    "permissionMode" | "allowDangerouslySkipPermissions" | "canUseTool"
  > =
    tools === "agent"
      ? {
          permissionMode: "default",
          allowDangerouslySkipPermissions: false,
          canUseTool: buildCanUseTool(),
        }
      : {
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
        };

  const env: Record<string, string | undefined> = {
    ...process.env,
    CLAUDE_CONFIG_DIR: CLAUDE_RUNTIME_CONFIG_DIR,
    DISABLE_NON_ESSENTIAL_MODEL_CALLS: "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    DISABLE_TELEMETRY: "1",
    DISABLE_AUTOUPDATER: "1",
    DISABLE_ERROR_REPORTING: "1",
    ENABLE_TOOL_SEARCH: "true",
    CLAUDE_CODE_MCP_STARTUP_WAIT_MS: "0",
  };
  if (CLAIM_MUTATION || ENTITY_ID_FIELD === "chatId") {
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

  const thinkingOption: Pick<SdkOptions, "thinking"> = claudeThinkingDisabled
    ? {}
    : { thinking: { type: "adaptive", display: "summarized" } };

  return {
    cwd: WORK_DIR,
    ...(WORKSPACE_ROOT ? { additionalDirectories: [WORKSPACE_ROOT] } : {}),
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
    includePartialMessages: true,
    forwardSubagentText: true,
    ...allowedToolsOption,
    env,
    ...(sessionMode.mode === "session" && sessionMode.sessionId
      ? { sessionId: sessionMode.sessionId }
      : {}),
    ...(sessionMode.mode === "resume" && sessionMode.sessionId
      ? { resume: sessionMode.sessionId }
      : {}),
    extraArgs,
    ...(hasRepoMcpFile ? { strictMcpConfig: true } : {}),
    ...(Object.keys(evaMcpServers).length > 0
      ? { mcpServers: evaMcpServers }
      : {}),
    ...effortOption,
    ...thinkingOption,
    hooks: { PreToolUse: [{ matcher: "Bash", hooks: [warnOnLowMemory] }] },
  };
}

const warnOnLowMemory: HookCallback = async () => {
  const notice = lowMemoryNotice();
  return notice === null
    ? {}
    : {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          additionalContext: notice,
        },
      };
};

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
  beginSdkAttempt("runClaudeSdkAttempt", sessionMode, buildClaudeStartupStep);

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
    prompt: readTurnPrompt(),
    options: buildSdkOptions(effectiveMode),
  });

  const interrupt = async (): Promise<void> => {
    try {
      if (q.interrupt) await q.interrupt();
    } catch {
    }
  };
  const healthTimer = setInterval(() => {
    const now = Date.now();
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
    if (S.inFlightToolUses > 0) {
      lastMessageAt = now;
    }
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
          prompt: readTurnPrompt(),
          options: buildSdkOptions(effectiveMode),
        });
        await consumeQuery();
      }
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : String(error);
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
          prompt: readTurnPrompt(),
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

  startClaudeUsageReport({
    readUsage: () => readSdkPlanUsage(q),
    error: resultErrorMessage || queryErrorMessage || undefined,
  });

  return finishSdkAttempt({
    name: "runClaudeSdkAttempt",
    sawResult,
    resultIsError,
    timedOutForNoOutput,
    timedOutForMaxRuntime,
    output: attemptOutput,
    errorLabel: "queryError",
    errorMessage: queryErrorMessage,
  });
}
