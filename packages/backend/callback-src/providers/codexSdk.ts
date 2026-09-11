import { Codex, type ThreadEvent, type ThreadOptions } from "@openai/codex-sdk";
import { existsSync, readFileSync } from "fs";
import {
  CODEX_BIN_PATH,
  CODEX_RUNTIME_HOME_DIR,
  MAX_TOTAL_RUNTIME_MS,
  NO_OUTPUT_CHECK_INTERVAL_MS,
  NO_OUTPUT_TIMEOUT_MS,
  NO_WRITES,
  SYSTEM_PROMPT,
  WORK_DIR,
  normalizedCodexModel,
} from "../config.js";
import { emitParsedStreamLine } from "../parse/streamRouter.js";
import { updateThinkingStep } from "../parse/canonical.js";
import {
  appendToRawLogFile,
  recordSdkAttemptFailure,
  trimBufferHead,
} from "../runtime/buffers.js";
import { callbackState as S, resetAttemptState } from "../runtime/state.js";
import type { ProviderAttemptResult, SessionMode } from "../types.js";
import { log } from "../utils.js";
import { buildStandardSdkAttemptResult } from "./attemptResult.js";

function readPromptText(): string {
  const prompt = readFileSync("/tmp/design-prompt.txt", "utf8");
  return SYSTEM_PROMPT ? SYSTEM_PROMPT + "\n\n" + prompt : prompt;
}

function codexEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  env.CODEX_HOME = CODEX_RUNTIME_HOME_DIR;
  return env;
}

/**
 * Codex's equivalent of Cursor's `disallowedTools` is its sandbox mode, which
 * gates writes at the filesystem rather than by tool name: `--sandbox read-only`
 * lets the agent run commands but refuses to modify the workspace. Paired with
 * the existing `approvalPolicy: "never"` a blocked write simply fails, rather
 * than stalling the turn on an approval nobody can answer.
 *
 * Deliberately NOT passing `networkAccessEnabled`. It looks like the way to keep
 * the master's log-reading shell working, but the SDK compiles it to
 * `--config sandbox_workspace_write.network_access=…`, which only configures the
 * *workspace-write* sandbox and is a no-op under `read-only`. Setting it would
 * read as a guarantee the flag does not provide.
 *
 * Known caveat: whether a read-only Codex sandbox permits outbound network from
 * shell commands is unverified, so `npx convex logs` may not work on this
 * provider even though it does on Cursor. Blocking writes is the requirement
 * here; if Codex ever becomes a real master provider, that needs testing on a
 * live sandbox. Writing sessions are untouched.
 */
export function buildCodexSdkThreadOptions(): ThreadOptions {
  return {
    model: normalizedCodexModel,
    sandboxMode: NO_WRITES ? "read-only" : "danger-full-access",
    workingDirectory: WORK_DIR,
    skipGitRepoCheck: true,
    approvalPolicy: "never",
  };
}

function agentMessageDelta(
  event: ThreadEvent,
  priorTextByItem: Map<string, string>,
): string {
  if (
    (event.type !== "item.updated" && event.type !== "item.completed") ||
    event.item.type !== "agent_message"
  ) {
    return "";
  }
  const previous = priorTextByItem.get(event.item.id) ?? "";
  const current = event.item.text;
  priorTextByItem.set(event.item.id, current);
  if (!current || current === previous) return "";
  return current.startsWith(previous)
    ? current.slice(previous.length)
    : current;
}

/** Runs one non-interactive Codex turn through the official TypeScript SDK. */
export async function runCodexSdkAttempt(
  sessionMode: SessionMode,
): Promise<ProviderAttemptResult> {
  resetAttemptState();
  S.activeAttemptStartedAt = Date.now();
  updateThinkingStep(
    "Starting Codex SDK...",
    sessionMode.mode === "resume"
      ? "Restoring saved context..."
      : "Creating Codex thread...",
  );
  log(
    "runCodexSdkAttempt started (mode=" +
      sessionMode.mode +
      ", sessionId=" +
      (sessionMode.sessionId || "none") +
      ")",
  );

  let attemptOutput = "";
  let lastEventAt = Date.now();
  let timedOutForNoOutput = false;
  let timedOutForMaxRuntime = false;
  let sawCompletedTurn = false;
  let turnFailed = false;
  let attemptErrorMessage = "";
  const abortController = new AbortController();
  const agentTextByItem = new Map<string, string>();

  const codex = new Codex({
    codexPathOverride: existsSync(CODEX_BIN_PATH) ? CODEX_BIN_PATH : "codex",
    env: codexEnvironment(),
  });
  const threadOptions = buildCodexSdkThreadOptions();
  const thread =
    sessionMode.mode === "resume" && sessionMode.sessionId
      ? codex.resumeThread(sessionMode.sessionId, threadOptions)
      : codex.startThread(threadOptions);

  const healthTimer = setInterval(() => {
    const now = Date.now();
    if (S.fatalHeartbeatErrorMessage) {
      attemptErrorMessage = S.fatalHeartbeatErrorMessage;
      abortController.abort();
      return;
    }
    if (now - S.activeAttemptStartedAt > MAX_TOTAL_RUNTIME_MS) {
      timedOutForMaxRuntime = true;
      log("runCodexSdkAttempt: max runtime exceeded — aborting turn");
      abortController.abort();
      return;
    }
    // The SDK emits nothing between a tool call and its result, so a long
    // silent tool is indistinguishable from a hang by event silence alone:
    // while a tool is in flight only the hard runtime cap applies, and the
    // silence clock restarts once the tool result lands.
    if (S.inFlightToolUses > 0) {
      lastEventAt = now;
    }
    if (!sawCompletedTurn && now - lastEventAt > NO_OUTPUT_TIMEOUT_MS * 5) {
      timedOutForNoOutput = true;
      log("runCodexSdkAttempt: no SDK events — aborting turn");
      abortController.abort();
    }
  }, NO_OUTPUT_CHECK_INTERVAL_MS);

  const emitLine = (line: string): void => {
    emitParsedStreamLine(line);
    attemptOutput = trimBufferHead(attemptOutput + line);
  };

  try {
    const streamed = await thread.runStreamed(readPromptText(), {
      signal: abortController.signal,
    });
    for await (const event of streamed.events) {
      lastEventAt = Date.now();
      const delta = agentMessageDelta(event, agentTextByItem);
      if (delta) {
        emitLine(
          JSON.stringify({ type: "item.agent_message.delta", delta }) + "\n",
        );
        if (S.firstTextBlockAt === 0) S.firstTextBlockAt = Date.now();
      }
      emitLine(JSON.stringify(event) + "\n");
      if (event.type === "turn.completed") sawCompletedTurn = true;
      if (event.type === "turn.failed") {
        turnFailed = true;
        attemptErrorMessage = event.error.message;
      }
      if (event.type === "error") {
        turnFailed = true;
        attemptErrorMessage = event.message;
      }
      if (timedOutForMaxRuntime || timedOutForNoOutput) break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!abortController.signal.aborted || !attemptErrorMessage) {
      attemptErrorMessage = message;
    }
    log("runCodexSdkAttempt: turn failed — " + message);
  } finally {
    clearInterval(healthTimer);
  }

  if (attemptErrorMessage) {
    recordSdkAttemptFailure(attemptErrorMessage);
  }

  const code =
    sawCompletedTurn &&
    !turnFailed &&
    !attemptErrorMessage &&
    !timedOutForMaxRuntime &&
    !timedOutForNoOutput
      ? 0
      : 1;
  log(
    "runCodexSdkAttempt finished in " +
      String(Date.now() - S.activeAttemptStartedAt) +
      "ms (code=" +
      code +
      ", sawCompletedTurn=" +
      sawCompletedTurn +
      ", turnFailed=" +
      turnFailed +
      ", timedOutForNoOutput=" +
      timedOutForNoOutput +
      ", timedOutForMaxRuntime=" +
      timedOutForMaxRuntime +
      ", outputBytes=" +
      attemptOutput.length +
      (attemptErrorMessage ? ", error=" + attemptErrorMessage : "") +
      ")",
  );

  return buildStandardSdkAttemptResult({
    code,
    output: attemptOutput,
    timedOutForNoOutput,
    timedOutForMaxRuntime,
  });
}
