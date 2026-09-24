"use node";

export const CALLBACK_SCRIPT = `// callback-src/index.ts
import {
  existsSync as existsSync9,
  mkdirSync as mkdirSync8,
  readdirSync as readdirSync4,
  unlinkSync as unlinkSync3,
  writeFileSync as writeFileSync11
} from "fs";

// callback-src/config.ts
import { existsSync } from "fs";
var CONVEX_URL = process.env.CONVEX_URL;
var CONVEX_SITE_URL = process.env.CONVEX_SITE_URL || CONVEX_URL;
var CONVEX_TOKEN = process.env.CONVEX_TOKEN;
var STREAMING_HMAC = process.env.STREAMING_HMAC || "";
var ENTITY_ID = process.env.ENTITY_ID;
var STREAMING_ENTITY_ID = process.env.STREAMING_ENTITY_ID || ENTITY_ID;
var RUN_ID = process.env.RUN_ID || null;
var TURN_ID = process.env.TURN_ID || null;
var ENTITY_ID_FIELD = process.env.ENTITY_ID_FIELD;
var TASK_PROOF_CAPTURE_ENABLED = process.env.TASK_PROOF_CAPTURE_ENABLED !== "false";
var ROOT_DIRECTORY = process.env.ROOT_DIRECTORY || "";
var COMPLETION_MUTATION = process.env.COMPLETION_MUTATION;
var CLAIM_MUTATION = process.env.CLAIM_MUTATION;
var OPEN_SYNTHETIC_TURN_MUTATION = process.env.OPEN_SYNTHETIC_TURN_MUTATION;
var COMPLETE_SYNTHETIC_TURN_MUTATION = process.env.COMPLETE_SYNTHETIC_TURN_MUTATION;
var UPDATE_BACKGROUND_AGENTS_MUTATION = process.env.UPDATE_BACKGROUND_AGENTS_MUTATION;
function isProofCompletionMutation(mutation = COMPLETION_MUTATION) {
  return (mutation ?? "").includes("handleProofCompletion");
}
var REQUIRE_TASK_COMMIT = process.env.REQUIRE_TASK_COMMIT === "true";
var PROVIDER = process.env.AI_PROVIDER || "claude";
var MODEL = process.env.AI_MODEL || process.env.CLAUDE_MODEL || "claude:sonnet";
var ALLOWED_TOOLS = process.env.ALLOWED_TOOLS || "Read,Glob,Grep";
var BLOCKING_QUESTIONS_ENABLED = process.env.ENTITY_ID_FIELD === "sessionId";
var CALLBACK_SCRIPT_FP = process.env.CALLBACK_SCRIPT_FP || "";
var DAEMON_OPTS_SIG = process.env.EVA_DAEMON_OPTS || "";
var SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "";
var WORK_DIR = existsSync("/tmp/repo") ? "/tmp/repo" : existsSync("/workspace/repo") ? "/workspace/repo" : "/tmp/repo";
var NO_OUTPUT_TIMEOUT_MS = Number(
  process.env.CLAUDE_NO_OUTPUT_TIMEOUT_MS || "60000"
);
var STREAM_SILENCE_TIMEOUT_MS = Number(
  process.env.CLAUDE_STREAM_SILENCE_TIMEOUT_MS || String(10 * 60 * 1e3)
);
var FIRST_EVENT_TIMEOUT_MS = Number(
  process.env.CLAUDE_FIRST_EVENT_TIMEOUT_MS || "90000"
);
var POST_TEXT_STALL_TIMEOUT_MS = Number(
  process.env.CLAUDE_POST_TEXT_STALL_TIMEOUT_MS || "90000"
);
var FIRST_ASSISTANT_EVENT_TIMEOUT_MS = Number(
  process.env.CLAUDE_FIRST_ASSISTANT_EVENT_TIMEOUT_MS || "120000"
);
var NO_OUTPUT_CHECK_INTERVAL_MS = 5e3;
var MAX_TOTAL_RUNTIME_MS = Number(
  process.env.CLAUDE_MAX_TOTAL_RUNTIME_MS || "5400000"
);
var SCRIPT_STARTED_AT = Date.now();
var CALLBACK_HTTP_TIMEOUT_MS = Number(
  process.env.CALLBACK_HTTP_TIMEOUT_MS || "18000"
);
var CALLBACK_HTTP_MAX_RETRIES = Number(
  process.env.CALLBACK_HTTP_MAX_RETRIES || "4"
);
var CALLBACK_HTTP_RETRY_BASE_MS = 1e3;
var STREAMING_HEARTBEAT_MAX_RETRIES = Number(
  process.env.CALLBACK_STREAMING_HEARTBEAT_MAX_RETRIES || "4"
);
var HEARTBEAT_FATAL_BURST = Number(
  process.env.CALLBACK_HEARTBEAT_FATAL_BURST || "10"
);
var HEARTBEAT_FATAL_SLOW_COUNT = Number(
  process.env.CALLBACK_HEARTBEAT_FATAL_SLOW_COUNT || "8"
);
var HEARTBEAT_FATAL_SLOW_WINDOW_MS = Number(
  process.env.CALLBACK_HEARTBEAT_FATAL_SLOW_WINDOW_MS || "180000"
);
var HEARTBEAT_ABSOLUTE_MAX_FAILURES = Number(
  process.env.CALLBACK_HEARTBEAT_ABSOLUTE_MAX_FAILURES || "28"
);
var OUTPUT_BUFFER_MAX_BYTES = Number(
  process.env.CALLBACK_OUTPUT_BUFFER_MAX_BYTES || "2000000"
);
var PID_FILE = process.env.RUNNER_PID_FILE || "/tmp/run-design.pid";
var READY_FILE = process.env.RUNNER_READY_FILE || "/tmp/run-design.ready";
var DONE_FILE = process.env.RUNNER_DONE_FILE || "/tmp/run-design.done";
var LAUNCH_ID = process.env.RUNNER_LAUNCH_ID || "";
var RAW_LOG_FILE = "/tmp/run-design.raw.jsonl";
var CLAUDE_BASE_CONFIG_DIR = process.env.CLAUDE_BASE_CONFIG_DIR || "/home/eva/.claude";
var CLAUDE_RUNTIME_CONFIG_DIR = process.env.CLAUDE_RUNTIME_CONFIG_DIR || "/tmp/claude-config";
var CLAUDE_PERSIST_DIR = process.env.CLAUDE_PERSIST_DIR || "/home/eva/.claude-persist";
var CODEX_RUNTIME_HOME_DIR = process.env.CODEX_RUNTIME_HOME_DIR || "/tmp/codex-home";
var CODEX_PERSIST_DIR = process.env.CODEX_PERSIST_DIR || "/home/eva/.codex-persist";
var CODEX_BIN_PATH = process.env.CODEX_BIN_PATH || "/tmp/codex-cli/bin/codex";
var CODEX_STATE_FILE = "session-state.json";
var CODEX_LOCAL_STATE_FILE = CODEX_RUNTIME_HOME_DIR + "/" + CODEX_STATE_FILE;
var CODEX_PERSIST_STATE_FILE = CODEX_PERSIST_DIR + "/" + CODEX_STATE_FILE;
var CODEX_AUTH_FILE = CODEX_RUNTIME_HOME_DIR + "/auth.json";
var CODEX_PERSIST_AUTH_FILE = CODEX_PERSIST_DIR + "/auth.json";
var CODEX_AUTH_JSON = process.env.CODEX_AUTH_JSON || "";
var CODEX_AUTH_JSON_BASE64 = process.env.CODEX_AUTH_JSON_BASE64 || "";
var CODEX_CONFIG_TOML = process.env.CODEX_CONFIG_TOML || "";
var CODEX_CONFIG_TOML_BASE64 = process.env.CODEX_CONFIG_TOML_BASE64 || "";
var OPENCODE_RUNTIME_HOME_DIR = process.env.OPENCODE_RUNTIME_HOME_DIR || "/tmp/opencode-home";
var OPENCODE_PERSIST_DIR = process.env.OPENCODE_PERSIST_DIR || "/home/eva/.opencode-persist";
var OPENCODE_BIN_PATH = process.env.EVA_OPENCODE_BIN_PATH || "/tmp/opencode-cli/bin/opencode";
var OPENCODE_STATE_FILE = "session-state.json";
var OPENCODE_LOCAL_STATE_FILE = OPENCODE_RUNTIME_HOME_DIR + "/" + OPENCODE_STATE_FILE;
var OPENCODE_PERSIST_STATE_FILE = OPENCODE_PERSIST_DIR + "/" + OPENCODE_STATE_FILE;
var OPENCODE_CONFIG_JSON = process.env.OPENCODE_CONFIG_JSON || "";
var OPENCODE_CONFIG_JSON_BASE64 = process.env.OPENCODE_CONFIG_JSON_BASE64 || "";
var OPENCODE_AUTH_DIR = "/home/eva/.local/share/opencode";
var OPENCODE_AUTH_FILE = OPENCODE_AUTH_DIR + "/auth.json";
var OPENCODE_PERSIST_AUTH_FILE = OPENCODE_PERSIST_DIR + "/auth.json";
var OPENCODE_AUTH_JSON = process.env.OPENCODE_AUTH_JSON || "";
var OPENCODE_AUTH_JSON_BASE64 = process.env.OPENCODE_AUTH_JSON_BASE64 || "";
var CURSOR_RUNTIME_HOME_DIR = process.env.CURSOR_RUNTIME_HOME_DIR || "/tmp/cursor-home";
var CURSOR_PERSIST_DIR = process.env.CURSOR_PERSIST_DIR || "/home/eva/.cursor-persist";
var CURSOR_STATE_FILE = "session-state.json";
var CURSOR_LOCAL_STATE_FILE = CURSOR_RUNTIME_HOME_DIR + "/" + CURSOR_STATE_FILE;
var CURSOR_PERSIST_STATE_FILE = CURSOR_PERSIST_DIR + "/" + CURSOR_STATE_FILE;
var CURSOR_SDK_STORE_DIR = CURSOR_PERSIST_DIR + "/sdk";
var CLAUDE_SESSION_PROJECT_DIR = WORK_DIR.replace(/\\//g, "-");
var CLAUDE_LOCAL_PROJECT_DIR = CLAUDE_RUNTIME_CONFIG_DIR + "/projects/" + CLAUDE_SESSION_PROJECT_DIR;
var CLAUDE_PERSIST_PROJECT_DIR = CLAUDE_PERSIST_DIR + "/projects/" + CLAUDE_SESSION_PROJECT_DIR;
var CLAUDE_STATE_FILE_NAME = "session-state.json";
var CLAUDE_LOCAL_STATE_FILE = CLAUDE_RUNTIME_CONFIG_DIR + "/" + CLAUDE_STATE_FILE_NAME;
var CLAUDE_PERSIST_STATE_FILE = CLAUDE_PERSIST_DIR + "/" + CLAUDE_STATE_FILE_NAME;
var CLAUDE_SYNC_TIMEOUT_MS = Number(
  process.env.CLAUDE_SYNC_TIMEOUT_MS || "10000"
);
var CLAUDE_SYNC_PER_FILE_TIMEOUT_SECONDS = Number(
  process.env.CLAUDE_SYNC_PER_FILE_TIMEOUT_SECONDS || "5"
);
var GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
if (GH_TOKEN) {
  process.env.GH_TOKEN = GH_TOKEN;
  process.env.GITHUB_TOKEN = GH_TOKEN;
}
process.env.GH_PROMPT_DISABLED = "1";
process.env.GH_NO_UPDATE_NOTIFIER = "1";
var REPO_ID = process.env.REPO_ID;
var REASONING_EFFORT = process.env.AI_REASONING_EFFORT || "";
var AI_THINKING_ENABLED = process.env.AI_THINKING_ENABLED || "";
var AI_CONTEXT_1M = process.env.AI_CONTEXT_1M || "";
var CLAUDE_EFFORT_LEVELS = /* @__PURE__ */ new Set(["low", "medium", "high", "xhigh", "max"]);
var claudeEffort = PROVIDER === "claude" && CLAUDE_EFFORT_LEVELS.has(REASONING_EFFORT) ? REASONING_EFFORT : "";
var CODEX_REASONING_EFFORT = {
  // GPT-5.5 uses none/low/medium/high/xhigh; "minimal" kept for older CLIs.
  off: "none",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "xhigh"
};
var codexReasoningEffort = PROVIDER === "codex" ? CODEX_REASONING_EFFORT[REASONING_EFFORT] ?? "" : "";
function buildSettingsJson() {
  const settings = {
    attribution: { commit: "", pr: "" }
  };
  const thinkingDisabled = AI_THINKING_ENABLED === "0" || PROVIDER === "claude" && REASONING_EFFORT === "off";
  if (thinkingDisabled) {
    settings.alwaysThinkingEnabled = false;
  }
  return JSON.stringify(settings);
}
var settingsJson = buildSettingsJson();
var hasMcpConfig = existsSync("/tmp/eva-mcp.json");
var claudeModelBase = MODEL.startsWith("claude:") ? MODEL.slice("claude:".length) : MODEL;
var normalizedClaudeModel = PROVIDER === "claude" && AI_CONTEXT_1M === "1" ? \`\${claudeModelBase}[1m]\` : claudeModelBase;
var normalizedCodexModel = MODEL.startsWith("codex:") ? MODEL.slice("codex:".length) : MODEL;
var normalizedOpencodeModel = MODEL.startsWith("opencode:") ? MODEL.slice("opencode:".length) : MODEL;
var CURSOR_REASONING_LEVELS = ["low", "medium", "high"];
function splitCursorModel(raw) {
  const unprefixed = raw.startsWith("cursor-grok-") ? raw.slice("cursor-".length) : raw;
  for (const level of CURSOR_REASONING_LEVELS) {
    const suffix = "-" + level;
    if (unprefixed.endsWith(suffix)) {
      return { base: unprefixed.slice(0, -suffix.length), level };
    }
  }
  return { base: unprefixed, level: "" };
}
var cursorModelRaw = MODEL.startsWith("cursor:") ? MODEL.slice("cursor:".length) : MODEL;
var cursorModelParts = splitCursorModel(cursorModelRaw);
var normalizedCursorModel = cursorModelParts.base;
var CURSOR_REASONING_EFFORT = {
  off: "",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "high",
  max: "high"
};
var cursorReasoningLevel = PROVIDER === "cursor" && REASONING_EFFORT in CURSOR_REASONING_EFFORT ? CURSOR_REASONING_EFFORT[REASONING_EFFORT] : cursorModelParts.level;
var codexCommand = existsSync(CODEX_BIN_PATH) ? JSON.stringify(CODEX_BIN_PATH) : "codex";
var opencodeCommand = existsSync(OPENCODE_BIN_PATH) ? JSON.stringify(OPENCODE_BIN_PATH) : "opencode";
var codexPromptCmd = SYSTEM_PROMPT ? "(printf %s\\\\n\\\\n " + JSON.stringify(SYSTEM_PROMPT) + "; cat /tmp/design-prompt.txt)" : "cat /tmp/design-prompt.txt";
var opencodePromptCmd = codexPromptCmd;
var codexExecBaseCmd = codexCommand + " exec --skip-git-repo-check --full-auto --json --model " + JSON.stringify(normalizedCodexModel);
var opencodeExecBaseCmd = opencodeCommand + " run --format json --model " + JSON.stringify(normalizedOpencodeModel);
var TOOL_STEP_TYPES = /* @__PURE__ */ new Set([
  "read",
  "search_files",
  "search_code",
  "write",
  "edit",
  "bash",
  "tool",
  "web_fetch",
  "web_search",
  "notebook",
  "subtask",
  "question",
  "todos"
]);
var CODEX_PRICING_PER_MILLION = {
  // OpenAI API list prices (per 1M tokens).
  "gpt-5.5": { input: 5, cached: 0.5, output: 30 },
  // Legacy — kept so in-flight sandboxes still cost-account correctly.
  "gpt-5.5-pro": { input: 30, cached: 30, output: 180 },
  "gpt-5.4": { input: 1.25, cached: 0.125, output: 10 },
  "gpt-5.4-mini": { input: 0.25, cached: 0.025, output: 2 },
  "gpt-5.3-codex": { input: 1.25, cached: 0.125, output: 10 },
  "gpt-5.2-codex": { input: 1.25, cached: 0.125, output: 10 },
  "gpt-5-codex": { input: 1.25, cached: 0.125, output: 10 }
};
var completedLabels = {
  "Preparing Claude session...": "Prepared Claude session",
  "Preparing Codex session...": "Prepared Codex session",
  "Preparing Opencode session...": "Prepared Opencode session",
  "Preparing Cursor session...": "Prepared Cursor session",
  "Starting Claude CLI...": "Started Claude CLI",
  "Starting Codex CLI...": "Started Codex CLI",
  "Starting Opencode CLI...": "Started Opencode CLI",
  "Starting Cursor CLI...": "Started Cursor CLI",
  "Restoring Claude session...": "Restored Claude session",
  "Thinking...": "Thought",
  "Generating response...": "Generated response",
  "Streaming response...": "Streamed response",
  "Finalizing response...": "Finalized response",
  "Reading file...": "Read file",
  "Searching files...": "Searched files",
  "Searching code...": "Searched code",
  "Creating file...": "Created file",
  "Editing file...": "Edited file",
  "Running command...": "Ran command",
  "Running in background...": "Started background process",
  "Stopping background process...": "Stopped background process",
  "Using Skill...": "Used Skill",
  "Fetching URL...": "Fetched URL",
  "Searching web...": "Searched web",
  "Editing notebook...": "Edited notebook",
  "Running agent...": "Ran agent",
  "Updating tasks...": "Updated tasks",
  "Reading tasks...": "Read tasks",
  "Asking a question...": "Asked a question"
};

// callback-src/providers/claudeSdkDaemon.ts
import { unlinkSync as unlinkSync2, writeFileSync as writeFileSync9, readFileSync as readFileSync6 } from "fs";

// callback-src/providers/daemonPaths.ts
var LEGACY_DAEMON_PID = "/tmp/eva-daemon.pid";
var LEGACY_DAEMON_ENTITY = "/tmp/eva-daemon.entity";
var LEGACY_DAEMON_OPTS = "/tmp/eva-daemon.opts";
function resolveDaemonPaths(entityIdField = ENTITY_ID_FIELD, entityId = ENTITY_ID) {
  const field = entityIdField ?? "sessionId";
  const id = entityId ?? "";
  const suffix = \`\${field}-\${id}\`;
  return {
    pid: \`/tmp/eva-daemon.\${suffix}.pid\`,
    entity: \`/tmp/eva-daemon.\${suffix}.entity\`,
    opts: \`/tmp/eva-daemon.\${suffix}.opts\`
  };
}
function resolveLegacySessionDaemonPaths() {
  return {
    pid: LEGACY_DAEMON_PID,
    entity: LEGACY_DAEMON_ENTITY,
    opts: LEGACY_DAEMON_OPTS
  };
}

// callback-src/utils.ts
import { spawnSync } from "child_process";
import {
  cpSync,
  existsSync as existsSync2,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from "fs";

// callback-src/runtime/state.ts
function parsePriorStep(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const label = value.label;
  const type = value.type;
  if (typeof label !== "string" || typeof type !== "string") {
    return null;
  }
  if (type === "thinking" || type === "reasoning" || type === "response") {
    return null;
  }
  const detail = value.detail;
  const path = value.path;
  const step = {
    type,
    label,
    detail: typeof detail === "string" ? detail : void 0,
    path: typeof path === "string" ? path : void 0,
    status: "complete"
  };
  if (typeof value.toolUseId === "string" && value.toolUseId.trim()) {
    step.toolUseId = value.toolUseId.trim();
  }
  if (typeof value.parentToolUseId === "string" && value.parentToolUseId.trim()) {
    step.parentToolUseId = value.parentToolUseId.trim();
  }
  if (typeof value.command === "string" && value.command) {
    step.command = value.command;
  }
  if (typeof value.contentPreview === "string" && value.contentPreview) {
    step.contentPreview = value.contentPreview;
  }
  if (value.isError === true) {
    step.isError = true;
  }
  if (typeof value.durationMs === "number" && Number.isFinite(value.durationMs)) {
    step.durationMs = value.durationMs;
  }
  if (value.output && typeof value.output === "object" && !Array.isArray(value.output) && typeof value.output.text === "string") {
    step.output = {
      text: value.output.text,
      exitCode: typeof value.output.exitCode === "number" ? value.output.exitCode : void 0,
      truncated: value.output.truncated === true ? true : void 0
    };
  }
  if (Array.isArray(value.edits)) {
    const edits = [];
    for (const edit of value.edits) {
      if (!edit || typeof edit !== "object" || Array.isArray(edit)) continue;
      if (typeof edit.oldText !== "string" || typeof edit.newText !== "string") {
        continue;
      }
      edits.push({ oldText: edit.oldText, newText: edit.newText });
    }
    if (edits.length > 0) {
      step.edits = edits;
    }
  }
  if (Array.isArray(value.files)) {
    const files = [];
    for (const file of value.files) {
      if (typeof file === "string" && file.trim()) {
        files.push(file.trim());
      }
    }
    if (files.length > 0) {
      step.files = files;
    }
  }
  if (Array.isArray(value.todos)) {
    const todos = [];
    for (const item of value.todos) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      if (typeof item.content !== "string" || !item.content) continue;
      const status = item.status === "in_progress" || item.status === "completed" ? item.status : "pending";
      todos.push({ content: item.content, status });
    }
    if (todos.length > 0) {
      step.todos = todos;
    }
  }
  return step;
}
var callbackState = {
  accumulatedSteps: [],
  pendingQuestionData: "",
  lastStepType: "",
  rawOutput: "",
  rawLogStream: null,
  rawLogStreamFailed: false,
  rawLogBytesWritten: 0,
  lastProcessed: 0,
  lastStreamingSentAt: Date.now(),
  lastSentPayload: "",
  lastSentContent: "",
  parsedStreamEventCount: 0,
  realtimeOutputBuffer: "",
  activeClaudeSessionId: process.env.CLAUDE_SESSION_ID || "",
  activeCodexThreadId: "",
  activeOpencodeSessionId: "",
  opencodeFinalMessageId: "",
  activeCursorSessionId: "",
  resultEventSeen: false,
  activeClaudeSessionMode: "none",
  waitingForFirstAssistantEvent: false,
  claudeInitAt: 0,
  activeAttemptStartedAt: 0,
  firstAssistantEventAt: 0,
  firstTextBlockAt: 0,
  currentStreamedContent: "",
  streamedAssistantTextThisMessage: false,
  pendingParagraphBreak: false,
  activeAttemptChild: null,
  fatalHeartbeatErrorMessage: "",
  consecutiveHeartbeatFailures: 0,
  heartbeatFailureStreakStartedAt: 0,
  inFlightToolUses: 0,
  codexToolItemIds: /* @__PURE__ */ new Set(),
  cursorKnownToolIds: /* @__PURE__ */ new Set(),
  cursorTerminalToolIds: /* @__PURE__ */ new Set(),
  todoState: [],
  awaitingQuestionAnswer: false,
  doneFileWritten: false,
  flushInProgress: false,
  pingInProgress: false,
  pingStartedAt: 0,
  callbackReady: false,
  streamingLoopsStopped: false,
  stderrOutput: ""
};
try {
  const priorRaw = process.env.PRIOR_STEPS;
  if (priorRaw) {
    const prior = JSON.parse(priorRaw);
    if (Array.isArray(prior)) {
      for (const s of prior) {
        const step = parsePriorStep(s);
        if (step) callbackState.accumulatedSteps.push(step);
      }
    }
  }
} catch {
}
function shiftLastProcessed(trimAmount) {
  callbackState.lastProcessed = Math.max(
    0,
    callbackState.lastProcessed - trimAmount
  );
}
function appendRawOutputChunk(text) {
  callbackState.rawOutput += text;
}
function trimRawOutputHead(maxBytes) {
  if (callbackState.rawOutput.length <= maxBytes) return 0;
  const trimAmount = callbackState.rawOutput.length - maxBytes;
  callbackState.rawOutput = callbackState.rawOutput.slice(trimAmount);
  return trimAmount;
}
function incrementRawLogBytesWritten(n) {
  callbackState.rawLogBytesWritten += n;
}
function setRawLogStreamFailed(value) {
  callbackState.rawLogStreamFailed = value;
}
function assignRawLogStream(stream) {
  callbackState.rawLogStream = stream;
}

// callback-src/utils.ts
function narrowJsonValue(value) {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    const items = [];
    for (const item of value) {
      if (typeof item !== "object" && typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean" && item !== null) {
        return null;
      }
      const narrowed = narrowJsonValue(item);
      if (narrowed === null && item !== null) return null;
      items.push(narrowed);
    }
    return items;
  }
  const obj = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "object" && typeof entry !== "string" && typeof entry !== "number" && typeof entry !== "boolean" && entry !== null) {
      return null;
    }
    const narrowed = narrowJsonValue(entry);
    if (narrowed === null && entry !== null) return null;
    obj[key] = narrowed;
  }
  return obj;
}
function log(msg) {
  const line = "[callback " + (/* @__PURE__ */ new Date()).toISOString() + "] " + msg + "\\n";
  console.error(line.trim());
  try {
    writeFileSync("/tmp/callback-debug.log", line, { flag: "a" });
  } catch {
  }
}
function tryParseJson(text) {
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed === "string" || typeof parsed === "number" || typeof parsed === "boolean" || typeof parsed === "object") {
      return narrowJsonValue(parsed);
    }
    return null;
  } catch {
    return null;
  }
}
async function readResponseJson(res) {
  const parsed = await res.json();
  if (parsed === null || typeof parsed === "string" || typeof parsed === "number" || typeof parsed === "boolean" || typeof parsed === "object") {
    return narrowJsonValue(parsed);
  }
  return null;
}
function shortenPath(p) {
  const parts = p.replace(/\\\\/g, "/").split("/");
  if (parts.length <= 4) return parts.join("/");
  return ".../" + parts.slice(-3).join("/");
}
function copyFileIfPresent(sourcePath, targetPath, label) {
  const copyScript = "if [ -f " + JSON.stringify(sourcePath) + " ]; then timeout " + String(CLAUDE_SYNC_PER_FILE_TIMEOUT_SECONDS) + " cp -f " + JSON.stringify(sourcePath) + " " + JSON.stringify(targetPath) + " || true; fi";
  runTimedBashSync(copyScript, label);
}
function decodeBase64(value) {
  return Buffer.from(value, "base64").toString("utf8");
}
function runTimedBashSync(script, label) {
  const result = spawnSync("bash", ["-lc", script], {
    encoding: "utf8",
    env: { ...process.env },
    timeout: CLAUDE_SYNC_TIMEOUT_MS
  });
  const timedOut = result.signal === "SIGTERM" || result.signal === "SIGKILL";
  if (result.error || timedOut || result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    const stdout = (result.stdout || "").trim();
    log(
      label + " failed (status=" + String(result.status) + ", signal=" + String(result.signal || "none") + "): " + (result.error ? String(result.error) : stderr || stdout || "unknown error")
    );
    return false;
  }
  return true;
}
function readGitHeadSha() {
  const result = spawnSync("git", ["-C", WORK_DIR, "rev-parse", "HEAD"], {
    encoding: "utf8",
    timeout: CLAUDE_SYNC_TIMEOUT_MS
  });
  if (result.status !== 0) {
    return "";
  }
  return (result.stdout || "").trim();
}
function hasNewTaskCommitSince(baselineHead) {
  if (!baselineHead) {
    return false;
  }
  const currentHead = readGitHeadSha();
  if (!currentHead || currentHead === baselineHead) {
    return false;
  }
  const countResult = spawnSync(
    "git",
    ["-C", WORK_DIR, "rev-list", "--count", baselineHead + ".." + currentHead],
    { encoding: "utf8", timeout: CLAUDE_SYNC_TIMEOUT_MS }
  );
  if (countResult.status !== 0) {
    return true;
  }
  const count = Number((countResult.stdout || "").trim());
  return Number.isFinite(count) && count > 0;
}
function copyBaseClaudeConfig() {
  const startedAt = Date.now();
  if (!existsSync2(CLAUDE_BASE_CONFIG_DIR)) {
    log("copyBaseClaudeConfig skipped: base config dir missing");
    return;
  }
  mkdirSync(CLAUDE_RUNTIME_CONFIG_DIR, { recursive: true });
  for (const entry of readdirSync(CLAUDE_BASE_CONFIG_DIR, {
    withFileTypes: true
  })) {
    if (entry.name === "projects") {
      continue;
    }
    const sourcePath = CLAUDE_BASE_CONFIG_DIR + "/" + entry.name;
    const targetPath = CLAUDE_RUNTIME_CONFIG_DIR + "/" + entry.name;
    try {
      cpSync(sourcePath, targetPath, { force: true, recursive: true });
    } catch (error) {
      log("copyBaseClaudeConfig skipped " + entry.name + ": " + String(error));
    }
  }
  log(
    "copyBaseClaudeConfig finished in " + String(Date.now() - startedAt) + "ms"
  );
}
function logTranscriptStats(sessionId, label) {
  if (!sessionId) {
    log(label + ": no session id");
    return;
  }
  const transcriptPath = buildClaudeTranscriptPath(
    CLAUDE_LOCAL_PROJECT_DIR,
    sessionId
  );
  if (!existsSync2(transcriptPath)) {
    log(label + ": transcript missing (" + transcriptPath + ")");
    return;
  }
  try {
    const content = readFileSync(transcriptPath, "utf8");
    const lineCount = content.length === 0 ? 0 : content.split("\\n").length;
    const byteSize = statSync(transcriptPath).size;
    log(
      label + ": sessionId=" + sessionId + " bytes=" + String(byteSize) + " lines=" + String(lineCount)
    );
  } catch (error) {
    log(label + ": failed to inspect transcript: " + String(error));
  }
}
function buildClaudeTranscriptPath(projectDir, sessionId) {
  return projectDir + "/" + sessionId + ".jsonl";
}
function attemptElapsedMs() {
  return callbackState.activeAttemptStartedAt > 0 ? Date.now() - callbackState.activeAttemptStartedAt : 0;
}
function elapsedAttemptMs() {
  return attemptElapsedMs();
}

// callback-src/runtime/turnLease.ts
var TERMINAL_REASONS = [
  "unknown_turn",
  "closed",
  "superseded",
  "timeout",
  "cancelled"
];
var currentTurnId = TURN_ID;
var terminalReason = null;
function getCurrentTurnId() {
  return currentTurnId;
}
function setCurrentTurnId(turnId) {
  if (currentTurnId === turnId) return;
  currentTurnId = turnId;
  terminalReason = null;
}
function getLeaseTerminalReason() {
  return terminalReason;
}
function isTerminalReason(value) {
  return TERMINAL_REASONS.some((reason) => reason === value);
}
function parseLeaseTerminalReason(body) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const lease = body.lease;
  if (typeof lease !== "object" || lease === null || Array.isArray(lease)) {
    return null;
  }
  if (lease.status !== "terminal") return null;
  const reason = lease.reason;
  if (typeof reason !== "string" || !isTerminalReason(reason)) {
    return "closed";
  }
  return reason;
}
function noteHeartbeatResponse(body) {
  if (terminalReason !== null) return true;
  let parsed;
  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body);
    } catch {
      return false;
    }
  } else {
    parsed = body;
  }
  const reason = parseLeaseTerminalReason(parsed);
  if (reason === null) return false;
  terminalReason = reason;
  log(
    "turn lease terminal (" + reason + ") for turnId=" + String(currentTurnId) + " \\u2014 this runner no longer owns the turn"
  );
  return true;
}

// callback-src/http/convexClient.ts
async function fetchWithTimeout(url, options, timeoutMs = CALLBACK_HTTP_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}
function buildRetryDelayMs(attempt) {
  const exponential = Math.pow(2, attempt - 1) * CALLBACK_HTTP_RETRY_BASE_MS;
  const jitter = Math.floor(Math.random() * 500);
  return exponential + jitter;
}
async function callConvex(type, path, args) {
  const endpoint = type === "mutation" ? "/api/mutation" : "/api/action";
  const headers = {
    "Content-Type": "application/json"
  };
  if (CONVEX_TOKEN) headers["Authorization"] = "Bearer " + CONVEX_TOKEN;
  const res = await fetchWithTimeout(CONVEX_URL + endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ path, args, format: "json" })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      "Convex " + type + " " + path + " failed: " + res.status + " " + text
    );
  }
  return await readResponseJson(res) ?? null;
}
async function callConvexWithRetry(type, path, args, maxRetries = CALLBACK_HTTP_MAX_RETRIES) {
  let attempt = 0;
  while (true) {
    try {
      return await callConvex(type, path, args);
    } catch (e) {
      attempt++;
      if (attempt > maxRetries) throw e;
      const delayMs = buildRetryDelayMs(attempt);
      console.error(
        "callConvex(" + type + ") attempt " + attempt + " failed, retrying in " + delayMs + "ms:",
        String(e)
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
async function postStreamingHeartbeat(siteUrl, body, label) {
  const turnId = getCurrentTurnId();
  if (turnId) body.set("turnId", turnId);
  const res = await fetchWithTimeout(siteUrl + "/api/streaming/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!res.ok) {
    const text2 = await res.text();
    throw new Error(label + " failed: " + res.status + " " + text2);
  }
  const text = await res.text();
  noteHeartbeatResponse(text);
  return text;
}
async function callStreamingHeartbeatTouchOnce(entityId) {
  if (!CONVEX_SITE_URL || !STREAMING_HMAC) {
    throw new Error(
      "Streaming heartbeat touch needs CONVEX_SITE_URL and the streaming HMAC"
    );
  }
  const body = new URLSearchParams();
  body.set("entityId", entityId);
  body.set("hmac", STREAMING_HMAC);
  body.set("touchOnly", "1");
  return await postStreamingHeartbeat(
    CONVEX_SITE_URL,
    body,
    "Streaming heartbeat touch"
  );
}
async function callStreamingHeartbeatOnce(entityId, currentActivity, currentContent, pendingQuestion) {
  if (CONVEX_SITE_URL && STREAMING_HMAC) {
    const body = new URLSearchParams();
    body.set("entityId", entityId);
    body.set("hmac", STREAMING_HMAC);
    body.set("currentActivity", currentActivity);
    body.set("currentContent", currentContent || "");
    if (pendingQuestion) {
      body.set("pendingQuestion", pendingQuestion);
    }
    return await postStreamingHeartbeat(
      CONVEX_SITE_URL,
      body,
      "Streaming heartbeat"
    );
  }
  const args = {
    entityId,
    currentActivity,
    currentContent
  };
  if (pendingQuestion) {
    args.pendingQuestion = pendingQuestion;
  }
  return await callConvex("mutation", "streaming:set", args);
}
async function callStreamingHeartbeat(entityId, currentActivity, currentContent, pendingQuestion) {
  let attempt = 0;
  while (true) {
    try {
      return await callStreamingHeartbeatOnce(
        entityId,
        currentActivity,
        currentContent,
        pendingQuestion
      );
    } catch (e) {
      attempt++;
      if (attempt > STREAMING_HEARTBEAT_MAX_RETRIES) throw e;
      const delayMs = buildRetryDelayMs(attempt);
      console.error(
        "streaming heartbeat attempt " + attempt + " failed, retrying in " + delayMs + "ms:",
        String(e)
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
async function callStreamingHeartbeatTouch(entityId) {
  let attempt = 0;
  while (true) {
    try {
      return await callStreamingHeartbeatTouchOnce(entityId);
    } catch (e) {
      attempt++;
      if (attempt > STREAMING_HEARTBEAT_MAX_RETRIES) throw e;
      const delayMs = buildRetryDelayMs(attempt);
      console.error(
        "streaming heartbeat touch attempt " + attempt + " failed, retrying in " + delayMs + "ms:",
        String(e)
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

// callback-src/parse/stepBudget.ts
var STEP_FIELD_CAPS = {
  command: 600,
  output: 1200,
  editSide: 1e3,
  editsMax: 4,
  filesMax: 10,
  contentPreview: 1e3,
  /** Soft ceiling for the whole steps JSON payload (under Convex 1 MiB). */
  jsonBytes: 600 * 1024
};
function headCap(text, max) {
  if (text.length <= max) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, max), truncated: true };
}
function tailCap(text, max) {
  if (text.length <= max) {
    return { text, truncated: false };
  }
  return { text: text.slice(text.length - max), truncated: true };
}
var HEAVY_FIELDS = ["output", "edits", "files", "contentPreview"];
function stripHeavyField(step, field) {
  if (field === "output" && step.output !== void 0) {
    delete step.output;
    return true;
  }
  if (field === "edits" && step.edits !== void 0) {
    delete step.edits;
    return true;
  }
  if (field === "files" && step.files !== void 0) {
    delete step.files;
    return true;
  }
  if (field === "contentPreview" && step.contentPreview !== void 0) {
    delete step.contentPreview;
    return true;
  }
  return false;
}
function enforceStepBudget(steps) {
  let encoded = JSON.stringify(steps);
  if (encoded.length <= STEP_FIELD_CAPS.jsonBytes) {
    return steps;
  }
  for (const field of HEAVY_FIELDS) {
    for (const step of steps) {
      if (encoded.length <= STEP_FIELD_CAPS.jsonBytes) {
        return steps;
      }
      if (stripHeavyField(step, field)) {
        encoded = JSON.stringify(steps);
      }
    }
  }
  return steps;
}
function serializeSteps(steps) {
  return JSON.stringify(enforceStepBudget(steps));
}

// callback-src/parse/toolResultCapture.ts
function capCommand(command) {
  return headCap(command, STEP_FIELD_CAPS.command).text;
}
function capContentPreview(content) {
  return headCap(content, STEP_FIELD_CAPS.contentPreview).text;
}
function buildStepOutput(text, exitCode) {
  const trimmed = text.trim();
  if (!trimmed && exitCode === void 0) {
    return void 0;
  }
  const capped = tailCap(trimmed, STEP_FIELD_CAPS.output);
  return {
    text: capped.text,
    exitCode,
    truncated: capped.truncated ? true : void 0
  };
}
function extractClaudeEdits(input) {
  const edits = [];
  const pushEdit = (oldText, newText) => {
    if (edits.length >= STEP_FIELD_CAPS.editsMax) return;
    edits.push({
      oldText: headCap(oldText, STEP_FIELD_CAPS.editSide).text,
      newText: headCap(newText, STEP_FIELD_CAPS.editSide).text
    });
  };
  if (typeof input.old_string === "string" && typeof input.new_string === "string") {
    pushEdit(input.old_string, input.new_string);
  }
  if (Array.isArray(input.edits)) {
    for (const item of input.edits) {
      if (edits.length >= STEP_FIELD_CAPS.editsMax) break;
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const oldText = typeof item.old_string === "string" ? item.old_string : typeof item.oldText === "string" ? item.oldText : typeof item.old_text === "string" ? item.old_text : "";
      const newText = typeof item.new_string === "string" ? item.new_string : typeof item.newText === "string" ? item.newText : typeof item.new_text === "string" ? item.new_text : "";
      if (oldText || newText) {
        pushEdit(oldText, newText);
      }
    }
  }
  return edits.length > 0 ? edits : void 0;
}
function readStringField(obj, keys) {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "";
}
function readNumberField(obj, keys) {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return void 0;
}
function pickToolCallId(obj) {
  const id = readStringField(obj, [
    "call_id",
    "callId",
    "tool_use_id",
    "toolUseId",
    "tool_call_id",
    "toolCallId",
    "id"
  ]);
  return id.trim() ? id.trim() : void 0;
}
function probeToolCompleteResult(source) {
  if (source === null || source === void 0) {
    return void 0;
  }
  if (typeof source === "string") {
    const output2 = buildStepOutput(source);
    return output2 ? { output: output2 } : void 0;
  }
  if (typeof source !== "object" || Array.isArray(source)) {
    return void 0;
  }
  const obj = source;
  const nestedResult = obj.result && typeof obj.result === "object" && !Array.isArray(obj.result) ? obj.result : null;
  const textCandidates = [];
  const pushText = (value) => {
    if (typeof value === "string" && value.trim()) {
      textCandidates.push(value);
    }
  };
  pushText(obj.aggregated_output);
  pushText(obj.output);
  pushText(obj.stdout);
  pushText(obj.stderr);
  pushText(obj.content);
  if (nestedResult) {
    pushText(nestedResult.output);
    pushText(nestedResult.stdout);
    pushText(nestedResult.stderr);
    pushText(nestedResult.content);
  }
  if (typeof obj.result === "string") {
    textCandidates.push(obj.result);
  }
  const exitCode = readNumberField(obj, ["exit_code", "exitCode", "exit"]) ?? (nestedResult ? readNumberField(nestedResult, ["exit_code", "exitCode", "exit"]) : void 0);
  const combined = textCandidates.join("\\n").trim();
  const output = buildStepOutput(combined, exitCode);
  const isError = obj.is_error === true || obj.isError === true || typeof obj.error === "string" && obj.error.trim().length > 0 || exitCode !== void 0 && exitCode !== 0;
  const files = extractFilePaths(obj);
  if (!output && !isError && files.length === 0) {
    return void 0;
  }
  return {
    output,
    isError: isError ? true : void 0,
    files: files.length > 0 ? files : void 0
  };
}
function extractFilePaths(obj) {
  const paths = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (path) => {
    const trimmed = path.trim();
    if (!trimmed || seen.has(trimmed)) return;
    if (paths.length >= STEP_FIELD_CAPS.filesMax) return;
    seen.add(trimmed);
    paths.push(trimmed);
  };
  if (Array.isArray(obj.files)) {
    for (const item of obj.files) {
      if (typeof item === "string") add(item);
    }
  }
  if (Array.isArray(obj.changes)) {
    for (const change of obj.changes) {
      if (!change || typeof change !== "object" || Array.isArray(change)) {
        continue;
      }
      if (typeof change.path === "string") add(change.path);
      if (typeof change.file_path === "string") add(change.file_path);
    }
  }
  return paths;
}
function probeCodexItemResult(item, failed) {
  const probed = probeToolCompleteResult(item);
  const files = extractFilePaths(item);
  const exitCode = readNumberField(item, ["exit_code", "exitCode"]);
  const isError = failed || exitCode !== void 0 && exitCode !== 0 || probed?.isError === true;
  if (!probed && files.length === 0 && !isError) {
    return void 0;
  }
  return {
    output: probed?.output,
    isError: isError ? true : void 0,
    files: files.length > 0 ? files : probed?.files
  };
}
function probeOpencodeStateResult(state) {
  const status = typeof state.status === "string" ? state.status : "";
  const outputText = typeof state.output === "string" ? state.output : typeof state.error === "string" ? state.error : "";
  const metadata = state.metadata && typeof state.metadata === "object" && !Array.isArray(state.metadata) ? state.metadata : null;
  const exitCode = metadata ? readNumberField(metadata, ["exit", "exit_code", "exitCode"]) : void 0;
  const time = state.time && typeof state.time === "object" && !Array.isArray(state.time) ? state.time : null;
  let durationMs;
  if (time && typeof time.start === "number" && typeof time.end === "number" && time.end >= time.start) {
    durationMs = time.end - time.start;
  }
  const isError = status === "error" || typeof state.error === "string" && state.error.trim().length > 0 || exitCode !== void 0 && exitCode !== 0;
  const output = buildStepOutput(outputText, exitCode);
  if (!output && !isError && durationMs === void 0) {
    return void 0;
  }
  return {
    output,
    isError: isError ? true : void 0,
    durationMs
  };
}

// callback-src/parse/toolSteps.ts
function opencodeToolToStep(part) {
  const tool = typeof part.tool === "string" ? part.tool : "tool";
  const stateObj = part.state && typeof part.state === "object" && !Array.isArray(part.state) ? part.state : null;
  const input = stateObj && "input" in stateObj && stateObj.input && typeof stateObj.input === "object" && !Array.isArray(stateObj.input) ? stateObj.input : {};
  const rawPath = typeof input.filePath === "string" ? input.filePath : typeof input.file_path === "string" ? input.file_path : typeof input.path === "string" ? input.path : "";
  const path = rawPath ? shortenPath(rawPath) : "";
  const toolUseId = pickToolCallId(part) ?? (typeof part.callID === "string" && part.callID.trim() ? part.callID.trim() : void 0);
  let step;
  switch (tool) {
    case "read":
      step = {
        type: "read",
        label: "Reading file...",
        detail: path || void 0,
        path: rawPath || void 0,
        status: "active"
      };
      break;
    case "glob":
      step = {
        type: "search_files",
        label: "Searching files...",
        detail: typeof input.pattern === "string" ? input.pattern : void 0,
        status: "active"
      };
      break;
    case "grep":
      step = {
        type: "search_code",
        label: "Searching code...",
        detail: typeof input.pattern === "string" ? input.pattern : void 0,
        status: "active"
      };
      break;
    case "write": {
      const content = typeof input.content === "string" ? input.content : void 0;
      step = {
        type: "write",
        label: "Creating file...",
        detail: path || void 0,
        path: rawPath || void 0,
        contentPreview: content ? capContentPreview(content) : void 0,
        status: "active"
      };
      break;
    }
    case "edit":
      step = {
        type: "edit",
        label: "Editing file...",
        detail: path || void 0,
        path: rawPath || void 0,
        edits: extractClaudeEdits(input),
        status: "active"
      };
      break;
    case "bash": {
      const rawCommand = typeof input.command === "string" ? input.command : "";
      step = {
        type: "bash",
        label: "Running command...",
        detail: rawCommand ? rawCommand.slice(0, 300) : void 0,
        command: rawCommand ? capCommand(rawCommand) : void 0,
        status: "active"
      };
      break;
    }
    case "webfetch":
      step = {
        type: "web_fetch",
        label: "Fetching URL...",
        detail: typeof input.url === "string" ? input.url : void 0,
        status: "active"
      };
      break;
    case "websearch":
      step = {
        type: "web_search",
        label: "Searching web...",
        detail: typeof input.query === "string" ? input.query : void 0,
        status: "active"
      };
      break;
    case "task":
      step = {
        type: "subtask",
        label: "Running agent...",
        detail: typeof input.description === "string" ? input.description : void 0,
        status: "active"
      };
      break;
    case "todowrite":
    case "todoread":
      step = { type: "tool", label: "Updating tasks...", status: "active" };
      break;
    default:
      step = {
        type: "tool",
        label: "Using " + tool + "...",
        status: "active"
      };
      break;
  }
  if (toolUseId) {
    step.toolUseId = toolUseId;
  }
  return step;
}
function cursorSdkToolToStep(name, args) {
  const pickString = (keys) => {
    for (const key of keys) {
      const value = args[key];
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }
    return "";
  };
  const rawPath = pickString([
    "path",
    "file_path",
    "filePath",
    "target_file",
    "targetFile",
    "relativePath",
    "relative_path"
  ]);
  const path = rawPath ? shortenPath(rawPath) : "";
  const command = pickString(["command", "cmd"]);
  const query = pickString([
    "query",
    "pattern",
    "url",
    "glob_pattern",
    "globPattern"
  ]);
  switch (name) {
    case "read":
      return {
        type: "read",
        label: "Reading file...",
        detail: path || void 0,
        path: rawPath || void 0,
        status: "active"
      };
    case "write": {
      const fileText = pickString([
        "fileText",
        "file_text",
        "content",
        "contents"
      ]);
      return {
        type: "write",
        label: "Creating file...",
        detail: path || void 0,
        path: rawPath || void 0,
        contentPreview: fileText ? capContentPreview(fileText) : void 0,
        status: "active"
      };
    }
    case "edit":
      return {
        type: "edit",
        label: "Editing file...",
        detail: path || void 0,
        path: rawPath || void 0,
        edits: extractClaudeEdits(args),
        status: "active"
      };
    case "delete":
      return {
        type: "edit",
        label: "Deleting file...",
        detail: path || void 0,
        path: rawPath || void 0,
        status: "active"
      };
    case "glob":
      return {
        type: "search_files",
        label: "Searching files...",
        detail: query || path || void 0,
        status: "active"
      };
    case "ls":
      return {
        type: "search_files",
        label: "Searching files...",
        detail: path || void 0,
        status: "active"
      };
    case "grep":
    case "semSearch":
      return {
        type: "search_code",
        label: "Searching code...",
        detail: query || path || void 0,
        status: "active"
      };
    case "shell":
      return {
        type: "bash",
        label: "Running command...",
        detail: command ? command.slice(0, 300) : void 0,
        command: command ? capCommand(command) : void 0,
        status: "active"
      };
    case "task":
      return {
        type: "subtask",
        label: "Running agent...",
        detail: pickString(["description", "prompt"]) || void 0,
        status: "active"
      };
    case "createPlan":
    case "updateTodos":
      return { type: "tool", label: "Updating tasks...", status: "active" };
    case "mcp": {
      const server = pickString([
        "server",
        "serverName",
        "server_name",
        "toolName",
        "tool_name"
      ]);
      return {
        type: "tool",
        label: server ? "Using MCP " + server + "..." : "Using MCP tool...",
        status: "active"
      };
    }
  }
  const tool = name.toLowerCase();
  if (tool.includes("read")) {
    return {
      type: "read",
      label: "Reading file...",
      detail: path || void 0,
      path: rawPath || void 0,
      status: "active"
    };
  }
  if (tool.includes("write") || tool.includes("create")) {
    return {
      type: "write",
      label: "Creating file...",
      detail: path || void 0,
      path: rawPath || void 0,
      status: "active"
    };
  }
  if (tool.includes("edit") || tool.includes("patch") || tool.includes("apply") || tool.includes("replace")) {
    return {
      type: "edit",
      label: "Editing file...",
      detail: path || void 0,
      path: rawPath || void 0,
      status: "active",
      edits: extractClaudeEdits(args)
    };
  }
  if (tool.includes("delete") || tool.includes("remove")) {
    return {
      type: "edit",
      label: "Deleting file...",
      detail: path || void 0,
      path: rawPath || void 0,
      status: "active"
    };
  }
  if (tool.includes("glob") || tool.includes("list")) {
    return {
      type: "search_files",
      label: "Searching files...",
      detail: query || path || void 0,
      status: "active"
    };
  }
  if (tool.includes("grep") || tool.includes("search")) {
    return {
      type: tool.includes("file") ? "search_files" : "search_code",
      label: tool.includes("file") ? "Searching files..." : "Searching code...",
      detail: query || path || void 0,
      status: "active"
    };
  }
  if (tool.includes("bash") || tool.includes("shell") || tool.includes("exec") || tool.includes("command") || tool.includes("terminal")) {
    return {
      type: "bash",
      label: "Running command...",
      detail: command ? command.slice(0, 300) : void 0,
      command: command ? capCommand(command) : void 0,
      status: "active"
    };
  }
  if (tool.includes("webfetch") || tool.includes("web_fetch") || tool.includes("fetch") && !tool.includes("search")) {
    return {
      type: "web_fetch",
      label: "Fetching URL...",
      detail: query || void 0,
      status: "active"
    };
  }
  if (tool.includes("websearch") || tool.includes("web_search")) {
    return {
      type: "web_search",
      label: "Searching web...",
      detail: query || void 0,
      status: "active"
    };
  }
  if (tool.includes("todo") || tool.includes("plan")) {
    return { type: "tool", label: "Updating tasks...", status: "active" };
  }
  if (tool.includes("mcp")) {
    const server = pickString([
      "server",
      "serverName",
      "server_name",
      "toolName",
      "tool_name"
    ]);
    return {
      type: "tool",
      label: server ? "Using MCP " + server + "..." : "Using MCP tool...",
      status: "active"
    };
  }
  return {
    type: "tool",
    label: "Using " + (name || "tool") + "...",
    status: "active"
  };
}
function toolCallToStep(name, input) {
  const rawPath = typeof input.file_path === "string" ? String(input.file_path) : "";
  const path = rawPath ? shortenPath(rawPath) : "";
  switch (name) {
    case "Read":
      return {
        type: "read",
        label: "Reading file...",
        detail: path || void 0,
        path: rawPath || void 0,
        status: "active"
      };
    case "Glob":
      return {
        type: "search_files",
        label: "Searching files...",
        detail: typeof input.pattern === "string" ? String(input.pattern) : void 0,
        status: "active"
      };
    case "Grep":
      return {
        type: "search_code",
        label: "Searching code...",
        detail: typeof input.pattern === "string" ? String(input.pattern) : void 0,
        status: "active"
      };
    case "Write": {
      const content = typeof input.content === "string" ? input.content : void 0;
      return {
        type: "write",
        label: "Creating file...",
        detail: path || void 0,
        path: rawPath || void 0,
        contentPreview: content ? capContentPreview(content) : void 0,
        status: "active"
      };
    }
    case "Edit": {
      const edits = extractClaudeEdits(input);
      return {
        type: "edit",
        label: "Editing file...",
        detail: path || void 0,
        path: rawPath || void 0,
        edits,
        status: "active"
      };
    }
    case "Bash":
    case "bash": {
      const rawCommand = typeof input.command === "string" ? String(input.command) : "";
      return {
        type: "bash",
        label: input.run_in_background === true ? "Running in background..." : "Running command...",
        detail: rawCommand ? rawCommand.slice(0, 300) : void 0,
        command: rawCommand ? capCommand(rawCommand) : void 0,
        status: "active"
      };
    }
    case "KillShell":
      return {
        type: "bash",
        label: "Stopping background process...",
        detail: typeof input.shell_id === "string" ? String(input.shell_id) : typeof input.shellId === "string" ? String(input.shellId) : void 0,
        status: "active"
      };
    case "Skill":
      return {
        type: "tool",
        label: "Using Skill...",
        detail: typeof input.skill === "string" ? String(input.skill) : void 0,
        status: "active"
      };
    case "WebFetch":
      return {
        type: "web_fetch",
        label: "Fetching URL...",
        detail: typeof input.url === "string" ? String(input.url) : void 0,
        status: "active"
      };
    case "WebSearch":
      return {
        type: "web_search",
        label: "Searching web...",
        detail: typeof input.query === "string" ? String(input.query) : void 0,
        status: "active"
      };
    case "NotebookEdit":
      return {
        type: "notebook",
        label: "Editing notebook...",
        detail: typeof input.notebook_path === "string" ? shortenPath(String(input.notebook_path)) : void 0,
        path: typeof input.notebook_path === "string" ? String(input.notebook_path) : void 0,
        status: "active"
      };
    // Subagent spawn. Named \`Agent\` since claude-code v2.1.63; older CLIs emit
    // \`Task\`. Match both so subagent runs are always recognised (a bare \`Task\`
    // previously fell through to the generic "Using Task..." row).
    case "Agent":
    case "Task":
      return {
        type: "subtask",
        label: "Running agent...",
        detail: typeof input.description === "string" ? String(input.description) : typeof input.subagent_type === "string" ? String(input.subagent_type) : void 0,
        status: "active"
      };
    case "TodoWrite":
      return { type: "tool", label: "Updating tasks...", status: "active" };
    case "TodoRead":
      return { type: "tool", label: "Reading tasks...", status: "active" };
    case "AskUserQuestion":
      return {
        type: "question",
        label: "Asking a question...",
        status: "active"
      };
    default:
      return {
        type: "tool",
        label: "Using " + name + "...",
        status: "active"
      };
  }
}
function getCodexFieldValue(item, keys) {
  const sources = [item];
  if (item.input && typeof item.input === "object" && !Array.isArray(item.input)) {
    sources.push(item.input);
  }
  for (const source of sources) {
    for (const key of keys) {
      if (typeof source[key] === "string" && source[key].trim()) {
        return source[key].trim();
      }
    }
  }
  return "";
}
function getCodexThreadId(event) {
  if (typeof event.thread_id === "string" && event.thread_id.trim()) {
    return event.thread_id.trim();
  }
  if (event.thread && typeof event.thread === "object" && !Array.isArray(event.thread) && typeof event.thread.id === "string" && event.thread.id.trim()) {
    return event.thread.id.trim();
  }
  return "";
}
function getCodexAgentMessageText(item) {
  if (item.type !== "agent_message") {
    return "";
  }
  if (typeof item.text === "string" && item.text) {
    return item.text;
  }
  if (!Array.isArray(item.content)) {
    return "";
  }
  const parts = [];
  for (const block of item.content) {
    if (!block || typeof block !== "object" || Array.isArray(block)) continue;
    if (typeof block.text === "string" && block.text) {
      parts.push(block.text);
      continue;
    }
    if (typeof block.content === "string" && block.content) {
      parts.push(block.content);
    }
  }
  return parts.join("");
}
function codexItemToStep(item) {
  const itemType = item && typeof item.type === "string" && item.type.trim() ? item.type.trim() : "tool";
  const normalizedType = itemType.toLowerCase();
  const pathValue = getCodexFieldValue(item, [
    "file_path",
    "path",
    "target_file",
    "target_path",
    "notebook_path"
  ]);
  const queryValue = getCodexFieldValue(item, ["query", "pattern", "url"]);
  const commandValue = getCodexFieldValue(item, ["command", "cmd"]);
  const descriptionValue = getCodexFieldValue(item, [
    "description",
    "name",
    "tool",
    "skill"
  ]);
  const normalizedDescription = descriptionValue.toLowerCase();
  const pathDetail = pathValue ? shortenPath(String(pathValue)) : "";
  const itemId = typeof item.id === "string" && item.id.trim() ? item.id.trim() : void 0;
  const withId = (step) => {
    if (itemId) step.toolUseId = itemId;
    return step;
  };
  if (normalizedType.includes("file_change") || normalizedType === "filechange") {
    const files = extractFilePaths(item);
    return withId({
      type: "edit",
      label: "Editing file...",
      detail: files[0] ? shortenPath(files[0]) : pathDetail || void 0,
      path: files[0] || pathValue || void 0,
      files: files.length > 0 ? files : void 0,
      status: "active"
    });
  }
  if (normalizedType === "mcp_tool_call") {
    if (normalizedDescription.includes("fetch_file")) {
      return withId({
        type: "read",
        label: "Reading file...",
        detail: descriptionValue || void 0,
        status: "active"
      });
    }
    if (normalizedDescription.includes("search") || normalizedDescription.includes("list_repositories") || normalizedDescription.includes("list_mcp_resources")) {
      return withId({
        type: "search_code",
        label: "Searching code...",
        detail: descriptionValue || void 0,
        status: "active"
      });
    }
    return withId({
      type: "tool",
      label: "Using MCP...",
      detail: descriptionValue || void 0,
      status: "active"
    });
  }
  if (normalizedType.includes("web")) {
    return withId({
      type: normalizedType.includes("search") ? "web_search" : "web_fetch",
      label: normalizedType.includes("search") ? "Searching web..." : "Fetching URL...",
      detail: queryValue || pathDetail || void 0,
      status: "active"
    });
  }
  if (normalizedType.includes("read")) {
    return withId({
      type: "read",
      label: "Reading file...",
      detail: pathDetail || void 0,
      path: pathValue || void 0,
      status: "active"
    });
  }
  if (normalizedType.includes("grep") || normalizedType.includes("search")) {
    return withId({
      type: normalizedType.includes("file") ? "search_files" : "search_code",
      label: normalizedType.includes("file") ? "Searching files..." : "Searching code...",
      detail: queryValue || pathDetail || void 0,
      status: "active"
    });
  }
  if (normalizedType.includes("glob") || normalizedType.includes("list")) {
    return withId({
      type: "search_files",
      label: "Searching files...",
      detail: queryValue || pathDetail || void 0,
      status: "active"
    });
  }
  if (normalizedType.includes("write") || normalizedType.includes("create")) {
    return withId({
      type: "write",
      label: "Creating file...",
      detail: pathDetail || void 0,
      path: pathValue || void 0,
      status: "active"
    });
  }
  if (normalizedType.includes("edit") || normalizedType.includes("patch") || normalizedType.includes("apply")) {
    return withId({
      type: "edit",
      label: "Editing file...",
      detail: pathDetail || void 0,
      path: pathValue || void 0,
      status: "active"
    });
  }
  if (normalizedType.includes("command") || normalizedType.includes("shell") || normalizedType.includes("bash") || normalizedType.includes("exec")) {
    return withId({
      type: "bash",
      label: "Running command...",
      detail: commandValue || descriptionValue || void 0,
      command: commandValue ? capCommand(commandValue) : void 0,
      status: "active"
    });
  }
  if (normalizedType.includes("agent")) {
    return withId({
      type: "subtask",
      label: "Running agent...",
      detail: descriptionValue || void 0,
      status: "active"
    });
  }
  return withId({
    type: "tool",
    label: "Using " + itemType + "...",
    detail: descriptionValue || pathDetail || queryValue || void 0,
    status: "active"
  });
}

// callback-src/runtime/proofMedia.ts
var PROOF_NO_MEDIA_MESSAGE = "Eva decided not to capture.";
function proofMediaCandidateRoots(workDir, rootDirectory) {
  const roots = [workDir];
  const trimmed = rootDirectory?.trim() ?? "";
  if (trimmed.length > 0 && trimmed !== "." && !trimmed.startsWith("/") && !trimmed.includes("..")) {
    const appRoot = \`\${workDir}/\${trimmed.replace(/\\/+\$/, "")}\`;
    if (appRoot !== workDir) {
      roots.push(appRoot);
    }
  }
  return roots;
}
function proofMediaSearchDirs(workDir, rootDirectory) {
  const roots = proofMediaCandidateRoots(workDir, rootDirectory);
  return {
    recordings: roots.map((root) => \`\${root}/recordings\`),
    screenshots: roots.map((root) => \`\${root}/screenshots\`)
  };
}

// callback-src/runtime/completion.ts
import {
  existsSync as existsSync3,
  readFileSync as readFileSync2,
  readdirSync as readdirSync2,
  unlinkSync,
  writeFileSync as writeFileSync2
} from "fs";
import { createHash } from "crypto";
function parseJsonObject(line) {
  const parsed = tryParseJson(line);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  return parsed;
}
function writeDoneFile(status, extras) {
  if (callbackState.doneFileWritten) return;
  callbackState.doneFileWritten = true;
  try {
    const payload = {
      endedAt: Date.now(),
      startedAt: SCRIPT_STARTED_AT,
      durationMs: Date.now() - SCRIPT_STARTED_AT,
      status,
      provider: PROVIDER,
      entityId: ENTITY_ID || null,
      runId: RUN_ID || null,
      resultEventSeen: callbackState.resultEventSeen,
      accumulatedStepCount: callbackState.accumulatedSteps.length,
      parsedStreamEventCount: callbackState.parsedStreamEventCount,
      rawLogBytesWritten: callbackState.rawLogBytesWritten,
      ...extras
    };
    writeFileSync2(DONE_FILE, JSON.stringify(payload));
  } catch (err) {
    console.error(
      "Failed to write done file: " + String(err instanceof Error ? err.message : err)
    );
  }
}
function computeCodexCostUsd(model, inputTokens, cachedInputTokens, outputTokens) {
  const pricing = CODEX_PRICING_PER_MILLION[model];
  if (!pricing) return 0;
  const nonCachedInput = Math.max(0, inputTokens - cachedInputTokens);
  return nonCachedInput * pricing.input / 1e6 + cachedInputTokens * pricing.cached / 1e6 + outputTokens * pricing.output / 1e6;
}
function buildClaudeShapedResult(args) {
  return JSON.stringify({
    type: "result",
    provider: args.provider,
    total_cost_usd: args.totalCostUsd,
    duration_ms: args.durationMs,
    usage: {
      input_tokens: args.inputTokens,
      output_tokens: args.outputTokens,
      cache_read_input_tokens: args.cacheReadInputTokens,
      cache_creation_input_tokens: args.cacheCreationInputTokens
    },
    modelUsage: args.model ? { [args.model]: {} } : {}
  });
}
function extractResultEvent(output) {
  if (PROVIDER === "cursor") {
    let resultText = "";
    let isError = false;
    let sawResult = false;
    let durationMs = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let cacheWriteTokens = 0;
    const assistantParts = [];
    const readTokenField = (usage, key) => {
      const value = usage[key];
      return typeof value === "number" && Number.isFinite(value) ? value : 0;
    };
    for (const line of output.split("\\n")) {
      const clean = line.trim();
      if (!clean) continue;
      try {
        const parsed = parseJsonObject(clean);
        if (!parsed) continue;
        if (parsed.type === "result") {
          sawResult = true;
          isError = Boolean(parsed.is_error);
          if (typeof parsed.duration_ms === "number")
            durationMs = parsed.duration_ms;
          if (typeof parsed.result === "string") {
            resultText = parsed.result;
          } else if (parsed.result !== void 0) {
            resultText = JSON.stringify(parsed.result);
          }
          if (parsed.usage && typeof parsed.usage === "object" && !Array.isArray(parsed.usage)) {
            inputTokens = readTokenField(parsed.usage, "input_tokens");
            outputTokens = readTokenField(parsed.usage, "output_tokens");
            cacheReadTokens = readTokenField(
              parsed.usage,
              "cache_read_input_tokens"
            );
            cacheWriteTokens = readTokenField(
              parsed.usage,
              "cache_creation_input_tokens"
            );
          }
          continue;
        }
        if (parsed.type === "assistant" && parsed.message && typeof parsed.message === "object" && !Array.isArray(parsed.message) && Array.isArray(parsed.message.content)) {
          for (const block of parsed.message.content) {
            if (block && typeof block === "object" && !Array.isArray(block) && block.type === "text" && typeof block.text === "string") {
              assistantParts.push(block.text);
            }
          }
        }
      } catch {
      }
    }
    if (sawResult) {
      return {
        result: resultText || assistantParts.join(""),
        isError,
        rawResultEvent: buildClaudeShapedResult({
          provider: "cursor",
          totalCostUsd: 0,
          durationMs: durationMs || attemptElapsedMs(),
          inputTokens,
          outputTokens,
          cacheReadInputTokens: cacheReadTokens,
          cacheCreationInputTokens: cacheWriteTokens,
          model: normalizedCursorModel
        })
      };
    }
    if (assistantParts.length > 0) {
      return {
        result: assistantParts.join(""),
        isError: false,
        rawResultEvent: ""
      };
    }
    return null;
  }
  if (PROVIDER === "opencode") {
    let finalMessageId = "";
    let sawStopStep = false;
    let errorLine = "";
    let errorMessage = "";
    const textByMessageId = /* @__PURE__ */ new Map();
    let totalCostUsd = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let reasoningTokens = 0;
    let cacheReadTokens = 0;
    let cacheWriteTokens = 0;
    let stepModel = "";
    for (const line of output.split("\\n")) {
      const clean = line.trim();
      if (!clean) continue;
      try {
        const parsed = parseJsonObject(clean);
        if (!parsed) continue;
        if (parsed.type === "step_finish" && parsed.part) {
          const part = typeof parsed.part === "object" && !Array.isArray(parsed.part) ? parsed.part : null;
          if (part && typeof part.cost === "number") totalCostUsd += part.cost;
          const t = part && part.tokens;
          if (t && typeof t === "object" && !Array.isArray(t)) {
            if (typeof t.input === "number") inputTokens = t.input;
            if (typeof t.output === "number") outputTokens += t.output;
            if (typeof t.reasoning === "number") reasoningTokens += t.reasoning;
            if (t.cache && typeof t.cache === "object" && !Array.isArray(t.cache)) {
              if (typeof t.cache.read === "number")
                cacheReadTokens = t.cache.read;
              if (typeof t.cache.write === "number")
                cacheWriteTokens += t.cache.write;
            }
          }
          if (part && typeof part.modelID === "string" && part.modelID) {
            stepModel = part.modelID;
          }
          if (part && part.reason === "stop" && typeof part.messageID === "string" && part.messageID) {
            finalMessageId = part.messageID;
            sawStopStep = true;
          }
          continue;
        }
        if (parsed.type === "text" && parsed.part && typeof parsed.part === "object" && !Array.isArray(parsed.part) && typeof parsed.part.messageID === "string" && parsed.part.messageID && typeof parsed.part.text === "string") {
          const existing = textByMessageId.get(parsed.part.messageID) || "";
          textByMessageId.set(
            parsed.part.messageID,
            existing + parsed.part.text
          );
          continue;
        }
        if (parsed.type === "error") {
          errorLine = clean;
          const err = parsed.error && typeof parsed.error === "object" && !Array.isArray(parsed.error) ? parsed.error : null;
          if (err && err.data && typeof err.data === "object" && !Array.isArray(err.data) && typeof err.data.message === "string") {
            errorMessage = err.data.message;
          } else if (err && typeof err.name === "string") {
            errorMessage = err.name;
          } else {
            errorMessage = "Opencode error";
          }
        }
      } catch {
      }
    }
    if (sawStopStep) {
      return {
        result: textByMessageId.get(finalMessageId) || "",
        isError: false,
        rawResultEvent: buildClaudeShapedResult({
          provider: "opencode",
          totalCostUsd,
          durationMs: attemptElapsedMs(),
          inputTokens,
          outputTokens: outputTokens + reasoningTokens,
          cacheReadInputTokens: cacheReadTokens,
          cacheCreationInputTokens: cacheWriteTokens,
          model: stepModel || normalizedOpencodeModel
        })
      };
    }
    if (errorMessage) {
      return { result: errorMessage, isError: true, rawResultEvent: errorLine };
    }
    return null;
  }
  if (PROVIDER === "codex") {
    let finalText = "";
    let lastInputTokens = 0;
    let lastCachedInputTokens = 0;
    let lastOutputTokens = 0;
    for (const line of output.split("\\n")) {
      const clean = line.trim();
      if (!clean) continue;
      try {
        const parsed = parseJsonObject(clean);
        if (!parsed) continue;
        if (parsed.type === "item.completed" && parsed.item && typeof parsed.item === "object" && !Array.isArray(parsed.item) && parsed.item.type === "agent_message") {
          const messageText = getCodexAgentMessageText(parsed.item);
          if (messageText) finalText = messageText;
          continue;
        }
        if (parsed.type === "token_count" && parsed.info) {
          const info = typeof parsed.info === "object" && !Array.isArray(parsed.info) ? parsed.info : null;
          const total = info && info.total_token_usage;
          if (total && typeof total === "object" && !Array.isArray(total)) {
            if (typeof total.input_tokens === "number")
              lastInputTokens = total.input_tokens;
            if (typeof total.cached_input_tokens === "number")
              lastCachedInputTokens = total.cached_input_tokens;
            if (typeof total.output_tokens === "number")
              lastOutputTokens = total.output_tokens;
          }
        }
      } catch {
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
          lastOutputTokens
        ),
        durationMs: attemptElapsedMs(),
        inputTokens: nonCachedInput,
        outputTokens: lastOutputTokens,
        cacheReadInputTokens: lastCachedInputTokens,
        cacheCreationInputTokens: 0,
        model: normalizedCodexModel
      })
    };
  }
  let resultEvent = null;
  for (const line of output.split("\\n")) {
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
          rawResultEvent: withProvider
        };
      }
    } catch {
    }
  }
  return resultEvent;
}
function buildErrorMessage(code, fatalHeartbeatError, toolStallError, timedOutForMaxRuntime, timedOutForNoOutput, timedOutForFirstEvent, timedOutForFirstAssistant, timedOutAfterFirstText, timedOutForZombie) {
  const cliName = PROVIDER === "codex" ? "Codex CLI" : PROVIDER === "opencode" ? "Opencode CLI" : PROVIDER === "cursor" ? "Cursor CLI" : "Claude CLI";
  if (fatalHeartbeatError) return fatalHeartbeatError;
  if (toolStallError) return toolStallError;
  if (timedOutForZombie) {
    return cliName + " terminated because the CLI process entered zombie state (likely a grandchild held stdio open after the CLI exited)";
  }
  if (timedOutForMaxRuntime) {
    return cliName + " terminated after max runtime of " + MAX_TOTAL_RUNTIME_MS + "ms";
  }
  if (timedOutForFirstEvent) {
    return cliName + " produced no parseable stream-json events within " + FIRST_EVENT_TIMEOUT_MS + "ms";
  }
  if (timedOutForFirstAssistant) {
    return cliName + " initialized but produced no assistant response within " + FIRST_ASSISTANT_EVENT_TIMEOUT_MS + "ms \\u2014 likely MCP initialization or API congestion";
  }
  if (timedOutAfterFirstText) {
    return cliName + " stalled after first text block for " + POST_TEXT_STALL_TIMEOUT_MS + "ms";
  }
  if (timedOutForNoOutput) {
    return cliName + " terminated after no stdout for " + NO_OUTPUT_TIMEOUT_MS + "ms";
  }
  if (code === 137 || code === 143) {
    return cliName + (code === 137 ? " was killed before it finished \\u2014 the sandbox ran out of memory." : " was stopped before it finished \\u2014 the run was interrupted.") + " This usually means the sandbox was stopped or a new message cancelled the run, so nothing was completed. Send the request again on a running sandbox.";
  }
  return cliName + " exited with code " + code;
}
function appendDiagnosticTail(message) {
  const details = [];
  const stdoutTail = callbackState.rawOutput.slice(-1500).trim();
  const stderrTail = callbackState.stderrOutput.slice(-1500).trim();
  if (stdoutTail) details.push("stdout tail:\\n" + stdoutTail);
  if (stderrTail) details.push("stderr tail:\\n" + stderrTail);
  if (details.length === 0) {
    details.push(
      "(stdout and stderr were empty \\u2014 the agent likely failed before emitting any events, e.g. invalid model or auth)"
    );
  }
  return message + "\\n\\n" + details.join("\\n\\n");
}
async function uploadMediaFile(filePath, mimeType) {
  const urlRes = await callConvexWithRetry(
    "mutation",
    "screenshots:generateUploadUrl",
    {},
    3
  );
  const urlValue = urlRes && typeof urlRes === "object" && !Array.isArray(urlRes) && urlRes.value && typeof urlRes.value === "string" ? urlRes.value : "";
  if (!urlValue) throw new Error("Missing upload URL");
  const fileData = readFileSync2(filePath);
  const uploadRes = await fetchWithTimeout(
    urlValue,
    {
      method: "POST",
      headers: { "Content-Type": mimeType },
      body: fileData
    },
    3e4
  );
  if (!uploadRes.ok) {
    throw new Error("Upload failed: " + uploadRes.status);
  }
  const uploadJson = await readResponseJson(uploadRes);
  if (uploadJson && typeof uploadJson === "object" && !Array.isArray(uploadJson) && typeof uploadJson.storageId === "string") {
    return uploadJson.storageId;
  }
  throw new Error("Missing storageId in upload response");
}
async function persistTaskProofIfNeeded(uploaded) {
  if (uploaded.length > 0) {
    if (ENTITY_ID_FIELD === "taskId" && RUN_ID) {
      for (const item of uploaded) {
        const saveArgs = {
          taskId: ENTITY_ID ?? "",
          storageId: item.storageId,
          fileName: item.fileName
        };
        if (RUN_ID) saveArgs.runId = RUN_ID;
        await callConvexWithRetry("mutation", "taskProof:save", saveArgs, 3);
      }
      return;
    }
    const mediaArgs = {
      parentId: ENTITY_ID ?? "",
      mediaStorageIds: uploaded.map((item) => item.storageId)
    };
    await callConvexWithRetry(
      "action",
      "screenshots:attachMedia",
      mediaArgs,
      3
    );
    return;
  }
  if (ENTITY_ID_FIELD === "taskId") {
    if (!TASK_PROOF_CAPTURE_ENABLED) return;
    if (!RUN_ID) return;
    const messageArgs = {
      taskId: ENTITY_ID ?? "",
      message: PROOF_NO_MEDIA_MESSAGE,
      runId: RUN_ID
    };
    await callConvexWithRetry(
      "mutation",
      "taskProof:saveMessage",
      messageArgs,
      3
    );
  }
}
async function deliverCompletionWithMedia(completionArgs) {
  const uploadFirst = isProofCompletionMutation(COMPLETION_MUTATION);
  if (uploadFirst) {
    await uploadAndAttachSandboxMedia();
  }
  await callConvexWithRetry(
    "mutation",
    COMPLETION_MUTATION ?? "",
    completionArgs
  );
  if (!uploadFirst) {
    await uploadAndAttachSandboxMedia();
  }
}
async function uploadAndAttachSandboxMedia() {
  if (RUN_ID && !TASK_PROOF_CAPTURE_ENABLED) return;
  const uploaded = [];
  const seenDigests = /* @__PURE__ */ new Set();
  const isDuplicate = (filePath) => {
    const digest = createHash("sha256").update(readFileSync2(filePath)).digest("hex");
    if (seenDigests.has(digest)) return true;
    seenDigests.add(digest);
    return false;
  };
  const { recordings, screenshots } = proofMediaSearchDirs(
    WORK_DIR,
    ROOT_DIRECTORY
  );
  for (const recDir of recordings) {
    if (!existsSync3(recDir)) continue;
    for (const file of readdirSync2(recDir)) {
      if (!/\\.(webm|mp4|mov|avi)\$/i.test(file)) continue;
      const fp = recDir + "/" + file;
      const mimeType = file.endsWith(".mp4") ? "video/mp4" : "video/webm";
      try {
        if (!isDuplicate(fp)) {
          const storageId = await uploadMediaFile(fp, mimeType);
          uploaded.push({ storageId, fileName: file });
        }
      } catch {
      }
      try {
        unlinkSync(fp);
      } catch {
      }
    }
  }
  const mimeMap = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp"
  };
  for (const ssDir of screenshots) {
    if (!existsSync3(ssDir)) continue;
    for (const file of readdirSync2(ssDir)) {
      if (!/\\.(png|jpg|jpeg|gif|webp)\$/i.test(file)) continue;
      const fp = ssDir + "/" + file;
      const ext = file.split(".").pop()?.toLowerCase() ?? "png";
      const mimeType = mimeMap[ext] || "image/png";
      try {
        if (!isDuplicate(fp)) {
          const storageId = await uploadMediaFile(fp, mimeType);
          uploaded.push({ storageId, fileName: file });
        }
      } catch {
      }
      try {
        unlinkSync(fp);
      } catch {
      }
    }
  }
  try {
    await persistTaskProofIfNeeded(uploaded);
  } catch (e) {
    console.error("Failed to persist task proof:", e);
    const proofError = e instanceof Error ? e.message : String(e);
    await saveProofFailureMessageIfNeeded(
      "Proof capture failed after completion: " + proofError
    );
  }
}
async function saveProofFailureMessageIfNeeded(message) {
  if (ENTITY_ID_FIELD !== "taskId") return;
  if (!TASK_PROOF_CAPTURE_ENABLED) return;
  if (!RUN_ID) return;
  try {
    const failureArgs = {
      taskId: ENTITY_ID ?? "",
      message
    };
    if (RUN_ID) failureArgs.runId = RUN_ID;
    await callConvexWithRetry(
      "mutation",
      "taskProof:saveMessage",
      failureArgs,
      2
    );
  } catch (error) {
    console.error("Failed to record proof persistence error:", error);
  }
}
function hasToolActivity() {
  return callbackState.accumulatedSteps.some((step) => TOOL_STEP_TYPES.has(step.type));
}

// callback-src/session/claudeSession.ts
import { existsSync as existsSync4, mkdirSync as mkdirSync2, readFileSync as readFileSync3, writeFileSync as writeFileSync3 } from "fs";
function buildClaudeStartupStep() {
  if (callbackState.waitingForFirstAssistantEvent && callbackState.claudeInitAt > 0) {
    const elapsedSeconds = Math.max(
      1,
      Math.floor((Date.now() - callbackState.claudeInitAt) / 1e3)
    );
    return callbackState.activeClaudeSessionMode === "resume" ? {
      label: "Restoring Claude session...",
      detail: "Claude started. Restoring saved context... " + elapsedSeconds + "s"
    } : {
      label: "Starting Claude CLI...",
      detail: "Claude started. Waiting for first output... " + elapsedSeconds + "s"
    };
  }
  return callbackState.activeClaudeSessionMode === "resume" ? {
    label: "Starting Claude CLI...",
    detail: "Launching Claude with saved session..."
  } : {
    label: "Starting Claude CLI...",
    detail: "Launching Claude process..."
  };
}
function readClaudeSessionState() {
  if (!existsSync4(CLAUDE_LOCAL_STATE_FILE)) {
    return null;
  }
  const parsed = tryParseJson(readFileSync3(CLAUDE_LOCAL_STATE_FILE, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const resumeSessionId = typeof parsed.resumeSessionId === "string" ? parsed.resumeSessionId.trim() : "";
  if (!resumeSessionId) {
    return null;
  }
  return { resumeSessionId };
}
function writeClaudeSessionState() {
  if (!process.env.CLAUDE_SESSION_ID) {
    return;
  }
  const resumeSessionId = typeof callbackState.activeClaudeSessionId === "string" && callbackState.activeClaudeSessionId.trim() ? callbackState.activeClaudeSessionId.trim() : process.env.CLAUDE_SESSION_ID;
  if (!resumeSessionId) {
    return;
  }
  mkdirSync2(CLAUDE_RUNTIME_CONFIG_DIR, { recursive: true });
  writeFileSync3(
    CLAUDE_LOCAL_STATE_FILE,
    JSON.stringify(
      {
        logicalSessionId: process.env.CLAUDE_SESSION_ID,
        resumeSessionId,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      null,
      2
    )
  );
}
function collectClaudeTranscriptSessionIds() {
  const sessionIds = /* @__PURE__ */ new Set();
  const configuredSessionId = process.env.CLAUDE_SESSION_ID;
  if (configuredSessionId) {
    sessionIds.add(configuredSessionId);
  }
  const persistedState = readClaudeSessionState();
  if (persistedState && persistedState.resumeSessionId) {
    sessionIds.add(persistedState.resumeSessionId);
  }
  const currentSessionId = typeof callbackState.activeClaudeSessionId === "string" ? callbackState.activeClaudeSessionId.trim() : "";
  if (currentSessionId) {
    sessionIds.add(currentSessionId);
  }
  return Array.from(sessionIds);
}
function hydratePersistedClaudeState() {
  const startedAt = Date.now();
  if (!process.env.CLAUDE_SESSION_ID) {
    log("hydratePersistedClaudeState skipped: no Claude session id");
    return;
  }
  copyBaseClaudeConfig();
  mkdirSync2(CLAUDE_LOCAL_PROJECT_DIR, { recursive: true });
  const prepareScript = "mkdir -p " + JSON.stringify(CLAUDE_LOCAL_PROJECT_DIR) + " " + JSON.stringify(CLAUDE_RUNTIME_CONFIG_DIR);
  runTimedBashSync(prepareScript, "hydratePersistedClaudeState(prepare)");
  copyFileIfPresent(
    CLAUDE_PERSIST_STATE_FILE,
    CLAUDE_LOCAL_STATE_FILE,
    "hydratePersistedClaudeState(state)"
  );
  const transcriptSessionIds = collectClaudeTranscriptSessionIds();
  for (const sessionId of transcriptSessionIds) {
    copyFileIfPresent(
      buildClaudeTranscriptPath(CLAUDE_PERSIST_PROJECT_DIR, sessionId),
      buildClaudeTranscriptPath(CLAUDE_LOCAL_PROJECT_DIR, sessionId),
      "hydratePersistedClaudeState(" + sessionId + ")"
    );
  }
  log(
    "hydratePersistedClaudeState sessionIds=" + (transcriptSessionIds.length > 0 ? transcriptSessionIds.join(",") : "none")
  );
  log(
    "hydratePersistedClaudeState finished in " + String(Date.now() - startedAt) + "ms"
  );
}
function ensureClaudeWorkspaceTrust() {
  const configPath = CLAUDE_RUNTIME_CONFIG_DIR + "/.claude.json";
  mkdirSync2(CLAUDE_RUNTIME_CONFIG_DIR, { recursive: true });
  const parsed = existsSync4(configPath) ? tryParseJson(readFileSync3(configPath, "utf8")) : null;
  const config = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...parsed } : {};
  const rawProjects = config.projects;
  const projects = rawProjects && typeof rawProjects === "object" && !Array.isArray(rawProjects) ? { ...rawProjects } : {};
  const rawProject = projects[WORK_DIR];
  const projectEntry = rawProject && typeof rawProject === "object" && !Array.isArray(rawProject) ? { ...rawProject } : {};
  projectEntry.hasTrustDialogAccepted = true;
  projects[WORK_DIR] = projectEntry;
  config.projects = projects;
  writeFileSync3(configPath, JSON.stringify(config, null, 2));
}
function resolveClaudeSessionMode() {
  const configuredSessionId = process.env.CLAUDE_SESSION_ID;
  if (!configuredSessionId) {
    return { mode: "none", sessionId: null };
  }
  const persistedState = readClaudeSessionState();
  if (persistedState) {
    if (existsSync4(
      buildClaudeTranscriptPath(
        CLAUDE_LOCAL_PROJECT_DIR,
        persistedState.resumeSessionId
      )
    )) {
      return { mode: "resume", sessionId: persistedState.resumeSessionId };
    }
    log(
      "resolveClaudeSessionMode: persisted state without transcript, starting fresh session"
    );
    return { mode: "session", sessionId: configuredSessionId };
  }
  if (existsSync4(
    buildClaudeTranscriptPath(CLAUDE_LOCAL_PROJECT_DIR, configuredSessionId)
  )) {
    return { mode: "resume", sessionId: configuredSessionId };
  }
  return { mode: "session", sessionId: configuredSessionId };
}
function syncClaudeStateToPersist(reason) {
  if (!process.env.CLAUDE_SESSION_ID) {
    return;
  }
  writeClaudeSessionState();
  const prepareScript = "mkdir -p " + JSON.stringify(CLAUDE_PERSIST_PROJECT_DIR) + " " + JSON.stringify(CLAUDE_PERSIST_DIR);
  runTimedBashSync(
    prepareScript,
    "syncClaudeStateToPersist(" + reason + ":prepare)"
  );
  copyFileIfPresent(
    CLAUDE_LOCAL_STATE_FILE,
    CLAUDE_PERSIST_STATE_FILE,
    "syncClaudeStateToPersist(" + reason + ":state)"
  );
  const transcriptSessionIds = collectClaudeTranscriptSessionIds();
  for (const sessionId of transcriptSessionIds) {
    copyFileIfPresent(
      buildClaudeTranscriptPath(CLAUDE_LOCAL_PROJECT_DIR, sessionId),
      buildClaudeTranscriptPath(CLAUDE_PERSIST_PROJECT_DIR, sessionId),
      "syncClaudeStateToPersist(" + reason + ":" + sessionId + ")"
    );
  }
  log(
    "syncClaudeStateToPersist(" + reason + ") sessionIds=" + (transcriptSessionIds.length > 0 ? transcriptSessionIds.join(",") : "none")
  );
}
function prepareClaudeSessionState() {
  if (!process.env.CLAUDE_SESSION_ID) {
    callbackState.activeClaudeSessionMode = "none";
    updateThinkingStep("Starting Claude CLI...", "Launching Claude process...");
    return { mode: "none", sessionId: null };
  }
  updateThinkingStep(
    "Preparing Claude session...",
    "Hydrating saved session..."
  );
  hydratePersistedClaudeState();
  ensureClaudeWorkspaceTrust();
  const sessionMode = resolveClaudeSessionMode();
  callbackState.activeClaudeSessionMode = sessionMode.mode;
  updateThinkingStep(
    "Preparing Claude session...",
    sessionMode.mode === "resume" ? "Saved session hydrated. Starting Claude..." : "Preparing fresh saved session..."
  );
  if (sessionMode.sessionId) {
    callbackState.activeClaudeSessionId = sessionMode.sessionId;
  }
  logTranscriptStats(
    sessionMode.sessionId ?? "",
    sessionMode.mode === "resume" ? "resume transcript stats" : "session transcript stats"
  );
  log(
    "prepareClaudeSessionState resolved mode=" + sessionMode.mode + " sessionId=" + (sessionMode.sessionId || "none")
  );
  return sessionMode;
}

// callback-src/runtime/backgroundShells.ts
var PENDING_CAP = 200;
var QUEUE_CAP = 20;
var FLUSH_FAILURE_COOLDOWN_MS = 1e4;
var BG_SHELL_ID_RE = /running in (?:the )?background.*?ID:?\\s*([\\w-]+)/i;
var pendingBashToolUses = /* @__PURE__ */ new Map();
var pendingKillShellUses = /* @__PURE__ */ new Map();
var eventQueue = [];
var flushInFlight = false;
var flushCooldownUntil = 0;
function trimMap(map, cap) {
  while (map.size > cap) {
    const first = map.keys().next();
    if (first.done) break;
    map.delete(first.value);
  }
}
function enqueue(event) {
  if (eventQueue.length >= QUEUE_CAP) {
    eventQueue.shift();
  }
  eventQueue.push(event);
}
function trackClaudeToolUse(name, input, toolUseId) {
  if (!toolUseId) return;
  if (name === "Bash" || name === "bash") {
    const command = typeof input.command === "string" ? input.command : "";
    pendingBashToolUses.set(toolUseId, { command });
    trimMap(pendingBashToolUses, PENDING_CAP);
    return;
  }
  if (name === "KillShell") {
    const shellId = typeof input.shell_id === "string" ? input.shell_id : typeof input.shellId === "string" ? input.shellId : "";
    if (!shellId) return;
    pendingKillShellUses.set(toolUseId, { shellId });
    trimMap(pendingKillShellUses, PENDING_CAP);
  }
}
function trackClaudeToolResult(toolUseId, resultText, isError) {
  if (!toolUseId) return;
  const killPending = pendingKillShellUses.get(toolUseId);
  if (killPending) {
    pendingKillShellUses.delete(toolUseId);
    if (!isError) {
      enqueue({ kind: "agent_killed", shellId: killPending.shellId });
    }
    return;
  }
  const bashPending = pendingBashToolUses.get(toolUseId);
  if (!bashPending) return;
  pendingBashToolUses.delete(toolUseId);
  if (isError) return;
  const match = BG_SHELL_ID_RE.exec(resultText);
  if (!match) return;
  const shellId = match[1];
  enqueue({
    kind: "register",
    key: toolUseId,
    command: bashPending.command,
    ...shellId ? { shellId } : {}
  });
}
function canFlushBackgroundShells() {
  return PROVIDER === "claude" && ENTITY_ID_FIELD === "sessionId" && typeof ENTITY_ID === "string" && ENTITY_ID.length > 0;
}
async function flushBackgroundShellQueue() {
  if (!canFlushBackgroundShells()) return;
  if (flushInFlight) return;
  if (Date.now() < flushCooldownUntil) return;
  if (eventQueue.length === 0) return;
  flushInFlight = true;
  const sessionId = ENTITY_ID;
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    flushInFlight = false;
    return;
  }
  try {
    while (eventQueue.length > 0) {
      const event = eventQueue[0];
      if (!event) break;
      if (event.kind === "register") {
        const registerArgs = {
          sessionId,
          key: event.key,
          command: event.command
        };
        if (event.shellId !== void 0) {
          registerArgs.shellId = event.shellId;
        }
        await callConvexWithRetry(
          "mutation",
          "backgroundProcesses:register",
          registerArgs
        );
      } else {
        await callConvexWithRetry(
          "mutation",
          "backgroundProcesses:markExitedByShellId",
          { sessionId, shellId: event.shellId }
        );
      }
      eventQueue.shift();
    }
  } catch (error) {
    flushCooldownUntil = Date.now() + FLUSH_FAILURE_COOLDOWN_MS;
    log(
      "backgroundShells flush failed: " + (error instanceof Error ? error.message : String(error))
    );
  } finally {
    flushInFlight = false;
  }
}

// callback-src/parse/sdkTaxonomy.ts
var loggedUnknownKinds = /* @__PURE__ */ new Set();
var knownBackgroundTaskIds = /* @__PURE__ */ new Set();
function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function readStringArray(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    const s = readString(item);
    if (s) out.push(s);
  }
  return out;
}
function pushNoticeStep(label, detail) {
  return [
    {
      kind: "push_step",
      step: {
        type: "notice",
        label,
        detail,
        status: "complete"
      }
    }
  ];
}
function completeActiveStatusStep() {
  for (let i = callbackState.accumulatedSteps.length - 1; i >= 0; i--) {
    const step = callbackState.accumulatedSteps[i];
    if (step.type === "status" && step.status === "active") {
      step.status = "complete";
      return;
    }
  }
}
function patchStepDetailByToolUseId(toolUseId, detail) {
  for (let i = callbackState.accumulatedSteps.length - 1; i >= 0; i--) {
    const step = callbackState.accumulatedSteps[i];
    if (step.toolUseId === toolUseId && step.status === "active") {
      step.detail = detail;
      return;
    }
  }
  const last = callbackState.accumulatedSteps[callbackState.accumulatedSteps.length - 1];
  if (last?.status === "active") {
    last.detail = detail;
  }
}
function patchStepsWithSummary(toolUseIds, summary) {
  const idSet = new Set(toolUseIds);
  for (const step of callbackState.accumulatedSteps) {
    if (step.toolUseId && idSet.has(step.toolUseId)) {
      step.detail = summary;
    }
  }
}
function appendHookDetail(hookId, detail) {
  for (let i = callbackState.accumulatedSteps.length - 1; i >= 0; i--) {
    const step = callbackState.accumulatedSteps[i];
    if (step.type === "hook" && step.toolUseId === hookId) {
      const trimmed = detail.trim();
      if (!trimmed) return;
      step.detail = step.detail ? \`\${step.detail}
\${trimmed}\` : trimmed;
      return;
    }
  }
}
function readFileNamesFromPersisted(event) {
  const filesField = event.files;
  if (!Array.isArray(filesField)) return "";
  const names = [];
  for (const entry of filesField) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }
    const filename = readString(entry.filename);
    if (filename) names.push(filename);
  }
  return names.join(", ");
}
function readBackgroundTaskIds(event) {
  const tasksField = event.tasks;
  if (!Array.isArray(tasksField)) return [];
  const ids = [];
  for (const task of tasksField) {
    if (typeof task !== "object" || task === null || Array.isArray(task)) {
      continue;
    }
    const taskId = readString(task.task_id);
    if (taskId) ids.push(taskId);
  }
  return ids;
}
function readBackgroundTaskDescriptions(event) {
  const tasksField = event.tasks;
  const descriptions = /* @__PURE__ */ new Map();
  if (!Array.isArray(tasksField)) return descriptions;
  for (const task of tasksField) {
    if (typeof task !== "object" || task === null || Array.isArray(task)) {
      continue;
    }
    const taskId = readString(task.task_id);
    const description = readString(task.description);
    if (taskId && description) {
      descriptions.set(taskId, description);
    }
  }
  return descriptions;
}
function diffNewBackgroundTaskIds(taskIds) {
  const newly = [];
  for (const id of taskIds) {
    if (!knownBackgroundTaskIds.has(id)) {
      newly.push(id);
    }
  }
  for (const id of taskIds) {
    knownBackgroundTaskIds.add(id);
  }
  return newly;
}
function logUnknownSdkKind(kind) {
  if (loggedUnknownKinds.has(kind)) return;
  loggedUnknownKinds.add(kind);
  log("unhandled sdk kind: " + kind);
}
function parseModelReroute(event) {
  const subtype = readString(event.subtype);
  if (subtype === "model_reroute" || subtype === "model_fallback") {
    const reason = readString(event.reason) ?? readString(event.message) ?? readString(event.content);
    return pushNoticeStep("Model rerouted", reason);
  }
  if (subtype === "informational") {
    const content = readString(event.content);
    if (content && (content.toLowerCase().includes("rerouted") || content.toLowerCase().includes("fallback model"))) {
      return pushNoticeStep("Model rerouted", content);
    }
  }
  return null;
}
function isTaskSystemSubtype(subtype) {
  return subtype === "task_started" || subtype === "task_updated" || subtype === "task_notification" || subtype === "task_progress";
}
function consumesClaudeSdkTaxonomyMessage(event) {
  const messageType = typeof event.type === "string" ? event.type.trim() : void 0;
  if (!messageType) return false;
  if (messageType === "tool_progress" || messageType === "tool_use_summary" || messageType === "auth_status" || messageType === "rate_limit_event") {
    return true;
  }
  if (messageType !== "system") return false;
  const subtype = typeof event.subtype === "string" ? event.subtype.trim() : void 0;
  if (!subtype || subtype === "init" || isTaskSystemSubtype(subtype)) {
    return false;
  }
  return true;
}
function parseClaudeSdkTaxonomy(event) {
  const messageType = readString(event.type);
  if (!messageType) return [];
  if (messageType !== "system" && messageType !== "tool_progress" && messageType !== "tool_use_summary" && messageType !== "auth_status" && messageType !== "rate_limit_event") {
    return [];
  }
  if (messageType === "auth_status" || messageType === "rate_limit_event") {
    return [];
  }
  if (messageType === "tool_progress") {
    completeActiveStatusStep();
    const toolUseId = readString(event.tool_use_id);
    const elapsed = event.elapsed_time_seconds;
    if (toolUseId && typeof elapsed === "number" && Number.isFinite(elapsed)) {
      const seconds = Math.max(0, Math.floor(elapsed));
      patchStepDetailByToolUseId(toolUseId, \`\${seconds}s elapsed\`);
    }
    return [];
  }
  if (messageType === "tool_use_summary") {
    completeActiveStatusStep();
    const summary = readString(event.summary);
    const ids = readStringArray(event.preceding_tool_use_ids);
    if (summary && ids.length > 0) {
      patchStepsWithSummary(ids, summary);
    }
    return [];
  }
  const subtype = readString(event.subtype);
  if (!subtype) {
    logUnknownSdkKind(\`\${messageType}:?\`);
    return [];
  }
  if (subtype === "thinking_tokens") {
    return [];
  }
  if (subtype === "status") {
    if (event.status === "compacting") {
      return [
        { kind: "mark_last_complete" },
        {
          kind: "push_step",
          step: {
            type: "status",
            label: "Compacting context...",
            status: "active"
          }
        }
      ];
    }
    return [];
  }
  completeActiveStatusStep();
  if (subtype === "compact_boundary") {
    return pushNoticeStep("Context compacted");
  }
  if (subtype === "files_persisted") {
    const names = readFileNamesFromPersisted(event);
    return pushNoticeStep(
      "Files persisted",
      names.length > 0 ? names : void 0
    );
  }
  if (subtype === "hook_started") {
    const hookId = readString(event.hook_id);
    const hookName = readString(event.hook_name) ?? "Hook";
    if (!hookId) return [];
    return [
      { kind: "mark_last_complete" },
      {
        kind: "push_step",
        step: {
          type: "hook",
          label: hookName,
          toolUseId: hookId,
          status: "active"
        },
        trackingId: hookId
      }
    ];
  }
  if (subtype === "hook_progress") {
    const hookId = readString(event.hook_id);
    const output = readString(event.output) ?? readString(event.stdout) ?? readString(event.stderr);
    if (hookId && output) {
      appendHookDetail(hookId, output);
    }
    return [];
  }
  if (subtype === "hook_response") {
    const hookId = readString(event.hook_id);
    if (!hookId) return [];
    return [{ kind: "complete_tool", trackingId: hookId }];
  }
  if (subtype === "background_tasks_changed") {
    const taskIds = readBackgroundTaskIds(event);
    const descriptions = readBackgroundTaskDescriptions(event);
    const newly = diffNewBackgroundTaskIds(taskIds);
    const events = [];
    for (const taskId of newly) {
      const description = descriptions.get(taskId);
      events.push(
        ...pushNoticeStep("Agent moved to background", description ?? taskId)
      );
    }
    return events;
  }
  const reroute = parseModelReroute(event);
  if (reroute) {
    return reroute;
  }
  if (subtype !== "init" && subtype !== "task_started" && subtype !== "task_updated" && subtype !== "task_notification" && subtype !== "task_progress") {
    logUnknownSdkKind(\`\${messageType}:\${subtype}\`);
  }
  return [];
}
function completeStatusOnNonStatusMessage(event) {
  const messageType = readString(event.type);
  if (messageType === "system" && event.subtype === "status") {
    return;
  }
  completeActiveStatusStep();
}

// callback-src/providers/claude.ts
function claudeToolCompleteResult(resultText, isError) {
  const output = buildStepOutput(resultText);
  if (!output && !isError) {
    return void 0;
  }
  return {
    output,
    isError: isError ? true : void 0
  };
}
function extractToolResultText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const item of content) {
    if (typeof item === "string") {
      parts.push(item);
      continue;
    }
    if (item && typeof item === "object" && !Array.isArray(item) && item.type === "text" && typeof item.text === "string") {
      parts.push(item.text);
    }
  }
  return parts.join("");
}
function normalizeTodoStatus(value) {
  return value === "in_progress" || value === "completed" ? value : "pending";
}
function reduceTodoState(name, input) {
  if (name === "TodoWrite") {
    const raw = Array.isArray(input.todos) ? input.todos : [];
    callbackState.todoState.length = 0;
    for (const item of raw) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const content = typeof item.content === "string" ? item.content : "";
      if (!content) continue;
      callbackState.todoState.push({ content, status: normalizeTodoStatus(item.status) });
    }
  } else if (name === "TaskCreate") {
    const content = typeof input.subject === "string" ? input.subject : typeof input.description === "string" ? input.description : "";
    if (content) {
      callbackState.todoState.push({ content, status: normalizeTodoStatus(input.status) });
    }
  } else if (name === "TaskUpdate") {
    const last = callbackState.todoState[callbackState.todoState.length - 1];
    if (last) {
      if (input.status !== void 0)
        last.status = normalizeTodoStatus(input.status);
      if (typeof input.subject === "string" && input.subject) {
        last.content = input.subject;
      }
    }
  }
  return callbackState.todoState.map((t) => ({ ...t }));
}
function parseClaudeStreamEvent(event) {
  const events = [];
  const inner = event.event && typeof event.event === "object" && !Array.isArray(event.event) ? event.event : null;
  if (!inner) return events;
  if (inner.type === "message_start") {
    events.push({ kind: "mark_message_start" });
    return events;
  }
  if (inner.type === "content_block_start") {
    const contentBlock = inner.content_block && typeof inner.content_block === "object" && !Array.isArray(inner.content_block) ? inner.content_block : null;
    if (contentBlock && contentBlock.type === "text") {
      events.push({ kind: "mark_text_block_start" });
    }
    return events;
  }
  if (inner.type !== "content_block_delta") return events;
  const delta = inner.delta && typeof inner.delta === "object" && !Array.isArray(inner.delta) ? inner.delta : null;
  if (!delta) return events;
  if (delta.type === "text_delta" && typeof delta.text === "string") {
    if (delta.text) {
      events.push({ kind: "stream_text_delta", text: delta.text });
    }
    return events;
  }
  if (delta.type === "thinking_delta" && typeof delta.thinking === "string") {
    if (delta.thinking) {
      events.push({ kind: "update_reasoning", text: delta.thinking });
    }
  }
  return events;
}
function claudeParseLine(event) {
  if (consumesClaudeSdkTaxonomyMessage(event)) {
    return parseClaudeSdkTaxonomy(event);
  }
  const events = [];
  if (event.type === "stream_event") {
    return parseClaudeStreamEvent(event);
  }
  if (event.type === "tool_result") {
    const toolUseId = typeof event.tool_use_id === "string" && event.tool_use_id.trim() ? event.tool_use_id.trim() : void 0;
    const resultText = event.content !== void 0 ? extractToolResultText(event.content) : "";
    const isError = event.is_error === true;
    if (toolUseId) {
      trackClaudeToolResult(toolUseId, resultText, isError);
    }
    const result = claudeToolCompleteResult(resultText, isError);
    events.push(
      result ? { kind: "complete_tool", trackingId: toolUseId, result } : { kind: "complete_tool", trackingId: toolUseId }
    );
    return events;
  }
  if (event.type === "user") {
    const message2 = event.message && typeof event.message === "object" && !Array.isArray(event.message) ? event.message : null;
    const content2 = message2 && Array.isArray(message2.content) ? message2.content : [];
    for (const block of content2) {
      if (!block || typeof block !== "object" || Array.isArray(block)) continue;
      if (block.type === "tool_result" && typeof block.tool_use_id === "string" && block.tool_use_id.trim()) {
        const toolUseId = block.tool_use_id.trim();
        const resultText = block.content !== void 0 ? extractToolResultText(block.content) : "";
        const isError = block.is_error === true;
        trackClaudeToolResult(toolUseId, resultText, isError);
        const result = claudeToolCompleteResult(resultText, isError);
        events.push(
          result ? { kind: "complete_tool", trackingId: toolUseId, result } : { kind: "complete_tool", trackingId: toolUseId }
        );
      }
    }
    if (events.length > 0) {
      return events;
    }
  }
  if (event.type !== "assistant") return events;
  if (callbackState.waitingForFirstAssistantEvent) {
    events.push({ kind: "mark_first_assistant" });
  }
  const message = event.message && typeof event.message === "object" && !Array.isArray(event.message) ? event.message : null;
  const content = message && Array.isArray(message.content) ? message.content : [];
  const parentToolUseId = typeof event.parent_tool_use_id === "string" && event.parent_tool_use_id.trim() ? event.parent_tool_use_id.trim() : void 0;
  for (const block of content) {
    if (!block || typeof block !== "object" || Array.isArray(block)) continue;
    if (block.type === "tool_use" && typeof block.name === "string") {
      const input = block.input && typeof block.input === "object" && !Array.isArray(block.input) ? block.input : {};
      if (block.name === "TodoWrite" || block.name === "TaskCreate" || block.name === "TaskUpdate") {
        events.push({
          kind: "set_todos",
          todos: reduceTodoState(block.name, input)
        });
        continue;
      }
      if (block.name === "TodoRead" || block.name === "TaskGet" || block.name === "TaskList") {
        continue;
      }
      const step = toolCallToStep(block.name, input);
      const trackingId = typeof block.id === "string" && block.id.trim() ? block.id.trim() : void 0;
      if (trackingId) {
        step.toolUseId = trackingId;
        trackClaudeToolUse(block.name, input, trackingId);
      }
      if (parentToolUseId) step.parentToolUseId = parentToolUseId;
      events.push(
        trackingId ? { kind: "push_step", step, trackingId } : { kind: "push_step", step }
      );
      if (!BLOCKING_QUESTIONS_ENABLED && block.name === "AskUserQuestion" && block.input) {
        events.push({
          kind: "set_pending_question",
          data: JSON.stringify(block.input)
        });
      }
    } else if (block.type === "thinking" && "thinking" in block && block.thinking) {
      events.push({ kind: "update_reasoning", text: String(block.thinking) });
    } else if (block.type === "text" && "text" in block && block.text) {
      if (!callbackState.streamedAssistantTextThisMessage) {
        events.push({ kind: "append_text", text: String(block.text) });
      }
    }
  }
  return events;
}
function onStreamLine(parsed) {
  if (parsed.type === "system" && parsed.subtype === "init" && typeof parsed.session_id === "string" && parsed.session_id.trim()) {
    callbackState.activeClaudeSessionId = parsed.session_id.trim();
    callbackState.claudeInitAt = Date.now();
    callbackState.waitingForFirstAssistantEvent = true;
    log(
      "claude init event after " + String(elapsedAttemptMs()) + "ms sessionId=" + callbackState.activeClaudeSessionId
    );
    log("captured Claude session id " + callbackState.activeClaudeSessionId);
    const startupStep = buildClaudeStartupStep();
    updateThinkingStep(startupStep.label, startupStep.detail);
    return { needsHeartbeat: true };
  }
  if (parsed.type === "assistant") {
    if (callbackState.firstAssistantEventAt === 0) {
      callbackState.firstAssistantEventAt = Date.now();
      log(
        "first assistant event after " + String(callbackState.firstAssistantEventAt - callbackState.activeAttemptStartedAt) + "ms"
      );
    }
    const message = parsed.message && typeof parsed.message === "object" && !Array.isArray(parsed.message) ? parsed.message : null;
    const contentBlocks = message && Array.isArray(message.content) ? message.content : [];
    for (const block of contentBlocks) {
      if (block && typeof block === "object" && !Array.isArray(block) && block.type === "text" && typeof block.text === "string") {
        if (callbackState.firstTextBlockAt === 0) {
          callbackState.firstTextBlockAt = Date.now();
          log(
            "first text block after " + String(callbackState.firstTextBlockAt - callbackState.activeAttemptStartedAt) + "ms chars=" + String(block.text.length)
          );
        }
        break;
      }
    }
    return {};
  }
  if (parsed.type === "result" && !callbackState.resultEventSeen) {
    callbackState.resultEventSeen = true;
    syncClaudeStateToPersist("result-event");
  }
  return {};
}
var claudeAdapter = {
  parseLine: claudeParseLine,
  onStreamLine(_line, parsed) {
    return onStreamLine(parsed);
  }
};

// callback-src/session/codexSession.ts
import { mkdirSync as mkdirSync4, writeFileSync as writeFileSync5 } from "fs";

// callback-src/session/createSessionStore.ts
import { existsSync as existsSync5, mkdirSync as mkdirSync3, readFileSync as readFileSync4, writeFileSync as writeFileSync4 } from "fs";
function createSessionStore(config) {
  const readSessionState = () => {
    const statePath = existsSync5(config.localStateFile) ? config.localStateFile : existsSync5(config.persistStateFile) ? config.persistStateFile : "";
    if (!statePath) {
      return null;
    }
    try {
      const parsed = JSON.parse(readFileSync4(statePath, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      const value = parsed[config.resumeField];
      if (typeof value === "string" && value.trim()) {
        if (config.resumeField === "resumeThreadId") {
          return { resumeThreadId: value.trim() };
        }
        return { resumeSessionId: value.trim() };
      }
    } catch (error) {
      console.error(
        "Failed to read session state from " + statePath + ":",
        String(error)
      );
    }
    return null;
  };
  const writeSessionState = () => {
    const activeId = config.getActiveId();
    if (!activeId) {
      return;
    }
    mkdirSync3(config.runtimeHomeDir, { recursive: true });
    const payload = {
      [config.resumeField]: activeId,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    writeFileSync4(config.localStateFile, JSON.stringify(payload, null, 2));
  };
  const hydratePersistedState = (label) => {
    mkdirSync3(config.runtimeHomeDir, { recursive: true });
    copyFileIfPresent(
      config.persistStateFile,
      config.localStateFile,
      label + "(state)"
    );
  };
  const syncStateToPersist = (label) => {
    writeSessionState();
    mkdirSync3(config.persistDir, { recursive: true });
    copyFileIfPresent(
      config.localStateFile,
      config.persistStateFile,
      label + "(state)"
    );
  };
  const resolveResumeId = () => {
    const persisted = readSessionState();
    if (!persisted) return null;
    if (config.resumeField === "resumeThreadId") {
      return persisted.resumeThreadId ?? null;
    }
    return persisted.resumeSessionId ?? null;
  };
  return {
    readSessionState,
    writeSessionState,
    hydratePersistedState,
    syncStateToPersist,
    resolveResumeId
  };
}

// callback-src/session/codexSession.ts
var store = createSessionStore({
  runtimeHomeDir: CODEX_RUNTIME_HOME_DIR,
  persistDir: CODEX_PERSIST_DIR,
  localStateFile: CODEX_LOCAL_STATE_FILE,
  persistStateFile: CODEX_PERSIST_STATE_FILE,
  resumeField: "resumeThreadId",
  getActiveId: () => callbackState.activeCodexThreadId,
  setActiveId: (id) => {
    callbackState.activeCodexThreadId = id;
  }
});
var readCodexSessionState = store.readSessionState;
var writeCodexSessionState = store.writeSessionState;
function syncCodexStateToPersist() {
  store.syncStateToPersist("syncCodexStateToPersist");
  copyFileIfPresent(
    CODEX_AUTH_FILE,
    CODEX_PERSIST_AUTH_FILE,
    "syncCodexStateToPersist(auth)"
  );
}
function writeCodexFileIfConfigured(fileName, rawValue, encodedValue) {
  const value = rawValue || (encodedValue ? decodeBase64(encodedValue) : "");
  if (!value) {
    return;
  }
  mkdirSync4(CODEX_RUNTIME_HOME_DIR, { recursive: true });
  writeFileSync5(CODEX_RUNTIME_HOME_DIR + "/" + fileName, value);
}
function buildCodexRuntimeConfig(rawValue, encodedValue) {
  const configuredValue = rawValue || (encodedValue ? decodeBase64(encodedValue) : "");
  const preservedLines = configuredValue ? configuredValue.split(/\\r?\\n/).filter((line) => {
    const trimmed = line.trim().toLowerCase();
    return !trimmed.startsWith("sandbox_mode") && !trimmed.startsWith("approval_policy") && // Drop any configured reasoning effort; the session lever wins when set.
    !(codexReasoningEffort && trimmed.startsWith("model_reasoning_effort"));
  }) : [];
  const normalizedPreservedLines = preservedLines.filter((line) => line.trim());
  const runtimeLines = [
    'approval_policy = "never"',
    'sandbox_mode = "danger-full-access"'
  ];
  if (codexReasoningEffort) {
    runtimeLines.push(\`model_reasoning_effort = "\${codexReasoningEffort}"\`);
  }
  if (normalizedPreservedLines.length > 0) {
    runtimeLines.push(...normalizedPreservedLines);
  }
  return runtimeLines.join("\\n") + "\\n";
}
function hydratePersistedCodexState() {
  store.hydratePersistedState("hydratePersistedCodexState");
  if (!CODEX_AUTH_JSON && !CODEX_AUTH_JSON_BASE64) {
    copyFileIfPresent(
      CODEX_PERSIST_AUTH_FILE,
      CODEX_AUTH_FILE,
      "hydratePersistedCodexState(auth)"
    );
  }
  writeCodexFileIfConfigured(
    "auth.json",
    CODEX_AUTH_JSON,
    CODEX_AUTH_JSON_BASE64
  );
  mkdirSync4(CODEX_RUNTIME_HOME_DIR, { recursive: true });
  writeFileSync5(
    CODEX_RUNTIME_HOME_DIR + "/config.toml",
    buildCodexRuntimeConfig(CODEX_CONFIG_TOML, CODEX_CONFIG_TOML_BASE64)
  );
}
function prepareCodexSessionState() {
  updateThinkingStep(
    "Preparing Codex session...",
    "Hydrating saved session..."
  );
  hydratePersistedCodexState();
  const persistedState = readCodexSessionState();
  updateThinkingStep(
    "Preparing Codex session...",
    persistedState ? "Saved session hydrated. Starting Codex..." : "Preparing fresh Codex session..."
  );
  return persistedState && persistedState.resumeThreadId ? { mode: "resume", sessionId: persistedState.resumeThreadId } : { mode: "none", sessionId: null };
}

// callback-src/providers/codex.ts
function codexParseLine(event) {
  const events = [];
  const threadId = getCodexThreadId(event);
  if (event.type === "thread.started" && threadId) {
    events.push({ kind: "set_codex_thread", threadId });
    events.push({
      kind: "update_thinking",
      label: "Starting Codex CLI...",
      detail: "Restoring saved context..."
    });
    return events;
  }
  if (event.type === "turn.started") {
    events.push({
      kind: "update_thinking",
      label: "Starting Codex CLI...",
      detail: "Codex is reasoning..."
    });
    return events;
  }
  if ((event.type === "item.started" || event.type === "item.updated" || event.type === "item.completed") && event.item && typeof event.item === "object" && !Array.isArray(event.item) && event.item.type === "reasoning") {
    if (typeof event.item.text === "string" && event.item.text.trim()) {
      events.push({ kind: "update_reasoning", text: event.item.text });
    }
    return events;
  }
  if (event.type === "item.started" && event.item && typeof event.item === "object" && !Array.isArray(event.item) && typeof event.item.type === "string" && event.item.type !== "agent_message") {
    const step = codexItemToStep(event.item);
    const trackingId = step.type !== "thinking" && typeof event.item.id === "string" ? event.item.id : void 0;
    events.push(
      trackingId ? { kind: "push_step", step, trackingId } : { kind: "push_step", step }
    );
    return events;
  }
  if (event.type === "item.completed" && event.item && typeof event.item === "object" && !Array.isArray(event.item) && event.item.type === "agent_message") {
    const messageText = getCodexAgentMessageText(event.item);
    if (messageText) {
      events.push({ kind: "append_text", text: messageText });
    }
    return events;
  }
  if ((event.type === "item.completed" || event.type === "item.failed") && event.item && typeof event.item === "object" && !Array.isArray(event.item) && typeof event.item.type === "string" && event.item.type !== "agent_message") {
    const result = probeCodexItemResult(
      event.item,
      event.type === "item.failed"
    );
    if (typeof event.item.id === "string") {
      events.push(
        result ? {
          kind: "complete_tool",
          trackingId: event.item.id,
          result
        } : { kind: "complete_tool", trackingId: event.item.id }
      );
    } else if (result) {
      events.push({ kind: "complete_tool", result });
    } else {
      events.push({ kind: "mark_last_complete" });
    }
    return events;
  }
  if (event.type === "turn.completed") {
    events.push({ kind: "mark_last_complete" });
    return events;
  }
  return events;
}
function inspectCodexStdout(text) {
  for (const line of text.split("\\n")) {
    const clean = line.trim();
    if (!clean) continue;
    try {
      const parsed = tryParseJson(clean);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.type === "item.completed" && parsed.item && typeof parsed.item === "object" && !Array.isArray(parsed.item) && parsed.item.type === "agent_message" && getCodexAgentMessageText(parsed.item) && callbackState.firstTextBlockAt === 0) {
        callbackState.firstTextBlockAt = Date.now();
      }
    } catch {
    }
  }
}
function onStreamLine2(parsed) {
  const threadId = getCodexThreadId(parsed);
  if (parsed.type === "thread.started" && threadId) {
    callbackState.activeCodexThreadId = threadId;
    writeCodexSessionState();
    return {};
  }
  if (parsed.type === "turn.completed" && !callbackState.resultEventSeen) {
    callbackState.resultEventSeen = true;
    syncCodexStateToPersist();
  }
  return {};
}
var codexAdapter = {
  parseLine: codexParseLine,
  onStreamLine(_line, parsed) {
    return onStreamLine2(parsed);
  },
  onStdoutText: inspectCodexStdout
};

// callback-src/session/cursorSession.ts
var store2 = createSessionStore({
  runtimeHomeDir: CURSOR_RUNTIME_HOME_DIR,
  persistDir: CURSOR_PERSIST_DIR,
  localStateFile: CURSOR_LOCAL_STATE_FILE,
  persistStateFile: CURSOR_PERSIST_STATE_FILE,
  resumeField: "resumeSessionId",
  getActiveId: () => callbackState.activeCursorSessionId,
  setActiveId: (id) => {
    callbackState.activeCursorSessionId = id;
  }
});
var readCursorSessionState = store2.readSessionState;
var writeCursorSessionState = store2.writeSessionState;
function syncCursorStateToPersist() {
  store2.syncStateToPersist("syncCursorStateToPersist");
}
function hydratePersistedCursorState() {
  store2.hydratePersistedState("hydratePersistedCursorState");
}
function prepareCursorSessionState() {
  updateThinkingStep(
    "Preparing Cursor session...",
    "Hydrating saved session..."
  );
  hydratePersistedCursorState();
  const persistedState = readCursorSessionState();
  updateThinkingStep(
    "Preparing Cursor session...",
    persistedState ? "Saved session hydrated. Starting Cursor..." : "Preparing fresh Cursor session..."
  );
  if (persistedState && persistedState.resumeSessionId) {
    callbackState.activeCursorSessionId = persistedState.resumeSessionId;
    return { mode: "resume", sessionId: persistedState.resumeSessionId };
  }
  return { mode: "none", sessionId: null };
}

// callback-src/providers/cursor.ts
function probeCursorSdkToolResult(status, result) {
  const eventIsError = status === "error";
  if (result === void 0 || result === null) {
    return eventIsError ? { isError: true } : void 0;
  }
  let payload = result;
  let envelopeIsError = false;
  if (typeof result === "object" && !Array.isArray(result)) {
    const envStatus = typeof result.status === "string" ? result.status : "";
    if (envStatus === "success" && result.value !== void 0) {
      payload = result.value;
    } else if (envStatus === "error" && result.error !== void 0) {
      payload = result.error;
      envelopeIsError = true;
    }
  }
  const isError = eventIsError || envelopeIsError;
  if (typeof payload === "string") {
    const output = buildStepOutput(payload);
    if (!output && !isError) return void 0;
    return { output, isError: isError ? true : void 0 };
  }
  if (isError && payload && typeof payload === "object" && !Array.isArray(payload) && typeof payload.message === "string" && payload.message.trim()) {
    return {
      output: buildStepOutput(payload.message),
      isError: true
    };
  }
  const probed = probeToolCompleteResult(payload) ?? {};
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    if (!probed.output && typeof payload.diffString === "string" && payload.diffString.trim()) {
      probed.output = buildStepOutput(payload.diffString);
    }
    if (typeof payload.executionTime === "number" && Number.isFinite(payload.executionTime)) {
      probed.durationMs = payload.executionTime;
    }
  }
  if (isError) probed.isError = true;
  if (!probed.output && probed.isError === void 0 && !probed.files && probed.durationMs === void 0) {
    return void 0;
  }
  return probed;
}
function cursorToolCallEvents(event) {
  const callId = typeof event.call_id === "string" && event.call_id.trim() ? event.call_id.trim() : void 0;
  const status = typeof event.status === "string" ? event.status : "";
  const name = typeof event.name === "string" ? event.name : "";
  const args = event.args && typeof event.args === "object" && !Array.isArray(event.args) ? event.args : {};
  if (status === "running") {
    if (callId && (callbackState.cursorKnownToolIds.has(callId) || callbackState.cursorTerminalToolIds.has(callId))) {
      return [];
    }
    const step = cursorSdkToolToStep(name, args);
    if (callId) {
      step.toolUseId = callId;
      callbackState.cursorKnownToolIds.add(callId);
      return [{ kind: "push_step", step, trackingId: callId }];
    }
    return [{ kind: "push_step", step }];
  }
  if (status === "completed" || status === "error") {
    const events = [];
    if (callId) {
      if (callbackState.cursorTerminalToolIds.has(callId)) return [];
      if (!callbackState.cursorKnownToolIds.has(callId)) {
        const step = cursorSdkToolToStep(name, args);
        step.toolUseId = callId;
        callbackState.cursorKnownToolIds.add(callId);
        events.push({ kind: "push_step", step, trackingId: callId });
      }
      callbackState.cursorTerminalToolIds.add(callId);
    }
    const result = probeCursorSdkToolResult(status, event.result);
    events.push(
      result ? { kind: "complete_tool", trackingId: callId, result } : { kind: "complete_tool", trackingId: callId }
    );
    return events;
  }
  return [];
}
function cursorParseLine(event) {
  const events = [];
  if (event.type === "system") {
    events.push({
      kind: "update_thinking",
      label: "Starting Cursor agent...",
      detail: "Cursor agent initializing..."
    });
    return events;
  }
  if (event.type === "assistant") {
    const message = event.message && typeof event.message === "object" && !Array.isArray(event.message) ? event.message : null;
    const contentBlocks = message && Array.isArray(message.content) ? message.content : [];
    for (const block of contentBlocks) {
      if (block && typeof block === "object" && !Array.isArray(block) && block.type === "text" && typeof block.text === "string" && block.text) {
        events.push({ kind: "append_text", text: block.text });
      }
    }
    return events;
  }
  if (event.type === "thinking" && typeof event.text === "string" && event.text) {
    events.push({ kind: "update_reasoning", text: event.text });
    return events;
  }
  if (event.type === "tool_call") {
    return cursorToolCallEvents(event);
  }
  if (event.type === "result") {
    events.push({ kind: "mark_last_complete" });
    return events;
  }
  return events;
}
function onStreamLine3(parsed) {
  if (parsed.type === "system" && typeof parsed.agent_id === "string" && parsed.agent_id.trim()) {
    const agentId = parsed.agent_id.trim();
    if (agentId !== callbackState.activeCursorSessionId) {
      callbackState.activeCursorSessionId = agentId;
      writeCursorSessionState();
      return { needsHeartbeat: true };
    }
    return {};
  }
  if (parsed.type === "assistant") {
    if (callbackState.firstAssistantEventAt === 0) callbackState.firstAssistantEventAt = Date.now();
    const message = parsed.message && typeof parsed.message === "object" && !Array.isArray(parsed.message) ? parsed.message : null;
    const contentBlocks = message && Array.isArray(message.content) ? message.content : [];
    for (const block of contentBlocks) {
      if (block && typeof block === "object" && !Array.isArray(block) && block.type === "text" && typeof block.text === "string" && callbackState.firstTextBlockAt === 0) {
        callbackState.firstTextBlockAt = Date.now();
        break;
      }
    }
    return {};
  }
  if (parsed.type === "tool_call") {
    callbackState.firstTextBlockAt = 0;
    return {};
  }
  if (parsed.type === "result" && !callbackState.resultEventSeen) {
    callbackState.resultEventSeen = true;
    syncCursorStateToPersist();
  }
  return {};
}
var cursorAdapter = {
  parseLine: cursorParseLine,
  onStreamLine(_line, parsed) {
    return onStreamLine3(parsed);
  }
};

// callback-src/session/opencodeSession.ts
import { mkdirSync as mkdirSync5, writeFileSync as writeFileSync6 } from "fs";
var store3 = createSessionStore({
  runtimeHomeDir: OPENCODE_RUNTIME_HOME_DIR,
  persistDir: OPENCODE_PERSIST_DIR,
  localStateFile: OPENCODE_LOCAL_STATE_FILE,
  persistStateFile: OPENCODE_PERSIST_STATE_FILE,
  resumeField: "resumeSessionId",
  getActiveId: () => callbackState.activeOpencodeSessionId,
  setActiveId: (id) => {
    callbackState.activeOpencodeSessionId = id;
  }
});
var readOpencodeSessionState = store3.readSessionState;
var writeOpencodeSessionState = store3.writeSessionState;
function syncOpencodeStateToPersist() {
  store3.syncStateToPersist("syncOpencodeStateToPersist");
  copyFileIfPresent(
    OPENCODE_AUTH_FILE,
    OPENCODE_PERSIST_AUTH_FILE,
    "syncOpencodeStateToPersist(auth)"
  );
}
function hydratePersistedOpencodeState() {
  store3.hydratePersistedState("hydratePersistedOpencodeState");
  const configJson = OPENCODE_CONFIG_JSON || (OPENCODE_CONFIG_JSON_BASE64 ? decodeBase64(OPENCODE_CONFIG_JSON_BASE64) : "");
  if (configJson) {
    process.env.OPENCODE_CONFIG_CONTENT = configJson;
  }
  mkdirSync5(OPENCODE_AUTH_DIR, { recursive: true });
  const authJson = OPENCODE_AUTH_JSON || (OPENCODE_AUTH_JSON_BASE64 ? decodeBase64(OPENCODE_AUTH_JSON_BASE64) : "");
  if (authJson) {
    writeFileSync6(OPENCODE_AUTH_FILE, authJson);
  } else {
    copyFileIfPresent(
      OPENCODE_PERSIST_AUTH_FILE,
      OPENCODE_AUTH_FILE,
      "hydratePersistedOpencodeState(auth)"
    );
  }
  process.env.OPENCODE_PERMISSION = '"allow"';
  process.env.OPENCODE_DISABLE_AUTOUPDATE = "1";
}
function prepareOpencodeSessionState() {
  updateThinkingStep(
    "Preparing Opencode session...",
    "Hydrating saved session..."
  );
  hydratePersistedOpencodeState();
  const persistedState = readOpencodeSessionState();
  updateThinkingStep(
    "Preparing Opencode session...",
    persistedState ? "Saved session hydrated. Starting Opencode..." : "Preparing fresh Opencode session..."
  );
  if (persistedState && persistedState.resumeSessionId) {
    callbackState.activeOpencodeSessionId = persistedState.resumeSessionId;
    return { mode: "resume", sessionId: persistedState.resumeSessionId };
  }
  return { mode: "none", sessionId: null };
}

// callback-src/providers/opencode.ts
function opencodeParseLine(event) {
  const events = [];
  if (event.type === "reasoning" && event.part && typeof event.part === "object" && !Array.isArray(event.part) && typeof event.part.text === "string" && event.part.text) {
    events.push({ kind: "update_reasoning", text: event.part.text });
    return events;
  }
  if (event.type === "text" && event.part && typeof event.part === "object" && !Array.isArray(event.part) && typeof event.part.text === "string" && event.part.text) {
    events.push({ kind: "append_text", text: event.part.text });
    return events;
  }
  if (event.type === "tool_use" && event.part && typeof event.part === "object" && !Array.isArray(event.part)) {
    const state = "state" in event.part && event.part.state && typeof event.part.state === "object" && !Array.isArray(event.part.state) ? event.part.state : {};
    const status = typeof state.status === "string" ? state.status : "";
    if (status === "running") {
      const step = opencodeToolToStep(event.part);
      const trackingId = step.toolUseId;
      events.push(
        trackingId ? { kind: "push_step", step, trackingId } : { kind: "push_step", step }
      );
      return events;
    }
    if (status === "completed" || status === "error") {
      const step = opencodeToolToStep(event.part);
      const result = probeOpencodeStateResult(state);
      events.push(
        result ? {
          kind: "complete_tool",
          trackingId: step.toolUseId,
          result
        } : { kind: "complete_tool", trackingId: step.toolUseId }
      );
      return events;
    }
    return events;
  }
  if (event.type === "step_finish") {
    const reason = event.part && typeof event.part === "object" && !Array.isArray(event.part) && typeof event.part.reason === "string" ? event.part.reason : "";
    if (reason === "stop") {
      events.push({ kind: "mark_last_complete" });
    }
    return events;
  }
  return events;
}
function onStreamLine4(parsed) {
  const sessionID = typeof parsed.sessionID === "string" && parsed.sessionID.trim() ? parsed.sessionID.trim() : "";
  let needsHeartbeat = false;
  if (sessionID && sessionID !== callbackState.activeOpencodeSessionId) {
    callbackState.activeOpencodeSessionId = sessionID;
    writeOpencodeSessionState();
    needsHeartbeat = true;
  }
  if (parsed.type === "step_start") {
    if (callbackState.firstAssistantEventAt === 0) {
      callbackState.firstAssistantEventAt = Date.now();
    }
  }
  if (parsed.type === "text" && parsed.part && typeof parsed.part === "object" && !Array.isArray(parsed.part) && typeof parsed.part.text === "string" && parsed.part.text) {
    if (callbackState.firstTextBlockAt === 0) {
      callbackState.firstTextBlockAt = Date.now();
    }
  }
  if (parsed.type === "step_finish" && parsed.part && typeof parsed.part === "object" && !Array.isArray(parsed.part) && parsed.part.reason === "stop" && !callbackState.resultEventSeen) {
    if (typeof parsed.part.messageID === "string" && parsed.part.messageID) {
      callbackState.opencodeFinalMessageId = parsed.part.messageID;
    }
    callbackState.resultEventSeen = true;
    syncOpencodeStateToPersist();
  }
  return needsHeartbeat ? { needsHeartbeat: true } : {};
}
var opencodeAdapter = {
  parseLine: opencodeParseLine,
  onStreamLine(_line, parsed) {
    return onStreamLine4(parsed);
  }
};

// callback-src/parse/canonical.ts
var stepStartedAt = /* @__PURE__ */ new WeakMap();
function mergeToolResult(step, result) {
  if (result.output) {
    step.output = result.output;
  }
  if (result.isError !== void 0) {
    step.isError = result.isError;
  }
  if (result.files && result.files.length > 0) {
    step.files = result.files;
  }
  if (result.durationMs !== void 0) {
    step.durationMs = result.durationMs;
  }
}
function markStepComplete(step) {
  step.status = "complete";
  if (completedLabels[step.label]) {
    step.label = completedLabels[step.label];
  } else if (step.label.startsWith("Using ") && step.label.endsWith("...")) {
    step.label = "Used " + step.label.slice(6, -3);
  }
  if (step.durationMs === void 0) {
    const started = stepStartedAt.get(step);
    if (started !== void 0) {
      step.durationMs = Date.now() - started;
    }
  }
}
function markLastComplete() {
  if (callbackState.accumulatedSteps.length === 0) return;
  markStepComplete(callbackState.accumulatedSteps[callbackState.accumulatedSteps.length - 1]);
}
function completeToolStep(trackingId, result) {
  if (trackingId) {
    for (let i = callbackState.accumulatedSteps.length - 1; i >= 0; i--) {
      const step = callbackState.accumulatedSteps[i];
      if (step.toolUseId === trackingId) {
        if (result) mergeToolResult(step, result);
        markStepComplete(step);
        return;
      }
    }
  }
  if (callbackState.accumulatedSteps.length > 0) {
    const last = callbackState.accumulatedSteps[callbackState.accumulatedSteps.length - 1];
    if (result) mergeToolResult(last, result);
    markStepComplete(last);
    return;
  }
}
function summarizeTodos(todos) {
  const done = todos.filter((t) => t.status === "completed").length;
  return \`\${done} of \${todos.length} done\`;
}
function applyTodosSnapshot(todos) {
  const existing = callbackState.accumulatedSteps.find((step) => step.type === "todos");
  if (existing) {
    existing.todos = todos;
    existing.detail = summarizeTodos(todos);
    return;
  }
  markLastComplete();
  callbackState.accumulatedSteps.push({
    type: "todos",
    label: "Updating tasks...",
    detail: summarizeTodos(todos),
    todos,
    status: "active"
  });
  callbackState.lastStepType = "tool";
}
function updateThinkingStep(label, detail) {
  void label;
  void detail;
  callbackState.lastStepType = "thinking";
}
function shouldRecordProgressStep(step) {
  return step.type !== "thinking" && step.type !== "reasoning" && step.type !== "response";
}
function pushProgressStep(step) {
  if (!shouldRecordProgressStep(step)) {
    updateThinkingStep(step.label, step.detail);
    return;
  }
  const last = callbackState.accumulatedSteps[callbackState.accumulatedSteps.length - 1];
  const isFirstChildUnderParent = step.parentToolUseId !== void 0 && last !== void 0 && last.toolUseId === step.parentToolUseId;
  if (!isFirstChildUnderParent) {
    markLastComplete();
  }
  callbackState.accumulatedSteps.push(step);
  stepStartedAt.set(step, Date.now());
  callbackState.lastStepType = "tool";
}
function parseToCanonical(event, provider = PROVIDER) {
  if (provider === "cursor") return cursorParseLine(event);
  if (provider === "opencode") return opencodeParseLine(event);
  if (provider === "codex") return codexParseLine(event);
  return claudeParseLine(event);
}
function applyCanonicalEvents(events) {
  if (events.length === 0) return false;
  for (const ev of events) {
    switch (ev.kind) {
      case "update_thinking":
        updateThinkingStep(ev.label, ev.detail);
        break;
      case "push_step":
        pushProgressStep(ev.step);
        if (shouldRecordProgressStep(ev.step)) {
          if (ev.trackingId) callbackState.codexToolItemIds.add(ev.trackingId);
          callbackState.inFlightToolUses++;
        }
        break;
      case "complete_tool":
        completeToolStep(ev.trackingId, ev.result);
        if (ev.trackingId !== void 0) {
          callbackState.codexToolItemIds.delete(ev.trackingId);
        }
        if (callbackState.inFlightToolUses > 0) {
          callbackState.inFlightToolUses--;
        }
        break;
      case "mark_last_complete":
        markLastComplete();
        break;
      case "append_text":
        appendStreamedContent(ev.text, true);
        break;
      case "stream_text_delta":
        appendStreamedContent(ev.text, callbackState.pendingParagraphBreak);
        callbackState.pendingParagraphBreak = false;
        callbackState.streamedAssistantTextThisMessage = true;
        break;
      case "mark_message_start":
        callbackState.streamedAssistantTextThisMessage = false;
        callbackState.pendingParagraphBreak = true;
        break;
      case "mark_text_block_start":
        callbackState.pendingParagraphBreak = true;
        break;
      case "update_reasoning":
        callbackState.lastStepType = "thinking";
        break;
      case "set_pending_question":
        callbackState.pendingQuestionData = ev.data;
        break;
      case "set_todos":
        applyTodosSnapshot(ev.todos);
        break;
      case "set_codex_thread":
        callbackState.activeCodexThreadId = ev.threadId;
        break;
      case "mark_first_assistant":
        callbackState.waitingForFirstAssistantEvent = false;
        break;
    }
  }
  return true;
}
function parseStreamEvent(line) {
  const event = tryParseJson(line);
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return false;
  }
  try {
    completeStatusOnNonStatusMessage(event);
    if (consumesClaudeSdkTaxonomyMessage(event)) {
      applyCanonicalEvents(parseClaudeSdkTaxonomy(event));
      return true;
    }
    return applyCanonicalEvents(parseToCanonical(event, PROVIDER));
  } catch {
    return false;
  }
}
function appendStreamedContent(text, isBlockBoundary = false) {
  const nextText = String(text);
  if (!nextText) {
    return;
  }
  if (nextText.startsWith(callbackState.currentStreamedContent)) {
    callbackState.currentStreamedContent = nextText;
    return;
  }
  if (isBlockBoundary && callbackState.currentStreamedContent.length > 0 && !callbackState.currentStreamedContent.endsWith("\\n") && !nextText.startsWith("\\n")) {
    callbackState.currentStreamedContent += "\\n\\n";
  }
  callbackState.currentStreamedContent += nextText;
}

// callback-src/runtime/heartbeats.ts
import { writeFileSync as writeFileSync7 } from "fs";

// callback-src/runtime/processControl.ts
import { spawnSync as spawnSync2 } from "child_process";
function terminateAttemptProcess(child) {
  try {
    child.kill("SIGTERM");
  } catch {
  }
  setTimeout(() => {
    try {
      child.kill("SIGKILL");
    } catch {
    }
  }, 2e3);
}
function isChildZombie(pid) {
  if (!pid) return false;
  try {
    const result = spawnSync2("ps", ["-p", String(pid), "-o", "state="], {
      timeout: 2e3,
      encoding: "utf8"
    });
    if (result.error || result.status !== 0) return false;
    return (result.stdout || "").trim() === "Z";
  } catch {
    return false;
  }
}

// callback-src/runtime/heartbeats.ts
var flushInterval = null;
var heartbeatInterval = null;
function buildStreamingPayload() {
  return serializeSteps(callbackState.accumulatedSteps);
}
function markHeartbeatSuccess(payload) {
  callbackState.lastSentPayload = payload;
  callbackState.lastSentContent = callbackState.currentStreamedContent;
  callbackState.lastStreamingSentAt = Date.now();
  if (callbackState.consecutiveHeartbeatFailures > 0) {
    console.error(
      "Heartbeat recovered after " + callbackState.consecutiveHeartbeatFailures + " consecutive failures"
    );
  }
  callbackState.consecutiveHeartbeatFailures = 0;
  callbackState.heartbeatFailureStreakStartedAt = 0;
}
function noteHeartbeatFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  callbackState.consecutiveHeartbeatFailures++;
  if (callbackState.consecutiveHeartbeatFailures === 1) {
    callbackState.heartbeatFailureStreakStartedAt = Date.now();
  }
  console.error(
    "Heartbeat failed (consecutive: " + callbackState.consecutiveHeartbeatFailures + "):",
    message
  );
  if (callbackState.consecutiveHeartbeatFailures === 2 || callbackState.consecutiveHeartbeatFailures === 4) {
    console.error(
      "[streaming-heartbeat] degraded: " + callbackState.consecutiveHeartbeatFailures + " consecutive post-retry failures (burstFatal>=" + HEARTBEAT_FATAL_BURST + " or slowFatal>=" + HEARTBEAT_FATAL_SLOW_COUNT + " over " + HEARTBEAT_FATAL_SLOW_WINDOW_MS + "ms)"
    );
  }
  if (callbackState.fatalHeartbeatErrorMessage) {
    return;
  }
  const streakAge = callbackState.heartbeatFailureStreakStartedAt > 0 ? Date.now() - callbackState.heartbeatFailureStreakStartedAt : 0;
  const burstFatal = callbackState.consecutiveHeartbeatFailures >= HEARTBEAT_FATAL_BURST;
  const slowFatal = callbackState.consecutiveHeartbeatFailures >= HEARTBEAT_FATAL_SLOW_COUNT && streakAge >= HEARTBEAT_FATAL_SLOW_WINDOW_MS;
  const absoluteFatal = callbackState.consecutiveHeartbeatFailures >= HEARTBEAT_ABSOLUTE_MAX_FAILURES;
  if (burstFatal || slowFatal || absoluteFatal) {
    callbackState.fatalHeartbeatErrorMessage = "Lost streaming heartbeat after " + String(callbackState.consecutiveHeartbeatFailures) + " consecutive failures: " + message;
    log(callbackState.fatalHeartbeatErrorMessage);
    if (callbackState.activeAttemptChild) {
      terminateAttemptProcess(callbackState.activeAttemptChild);
    }
  }
}
async function sendStreamingHeartbeatUpdate(payload) {
  try {
    await callStreamingHeartbeat(
      STREAMING_ENTITY_ID ?? "",
      payload,
      callbackState.currentStreamedContent,
      callbackState.pendingQuestionData || void 0
    );
    markHeartbeatSuccess(payload);
    return true;
  } catch (error) {
    noteHeartbeatFailure(error instanceof Error ? error : String(error));
    return false;
  }
}
async function flushStreaming() {
  if (callbackState.flushInProgress) return;
  if (callbackState.rawOutput.length <= callbackState.lastProcessed) {
    void flushBackgroundShellQueue();
    return;
  }
  callbackState.flushInProgress = true;
  try {
    const pending = callbackState.rawOutput.slice(callbackState.lastProcessed);
    const lastNewline = pending.lastIndexOf("\\n");
    if (lastNewline === -1) return;
    callbackState.lastProcessed += lastNewline + 1;
    let hasNew = false;
    for (const line of pending.slice(0, lastNewline).split("\\n")) {
      const clean = line.trim();
      if (!clean) continue;
      if (parseStreamEvent(clean)) {
        hasNew = true;
        callbackState.parsedStreamEventCount++;
      }
    }
    const contentChanged = callbackState.currentStreamedContent !== callbackState.lastSentContent;
    if (hasNew || contentChanged) {
      const payload = buildStreamingPayload();
      if (payload === callbackState.lastSentPayload && !contentChanged) {
        return;
      }
      await sendStreamingHeartbeatUpdate(payload);
    } else if (callbackState.inFlightToolUses > 0 && Date.now() - callbackState.lastStreamingSentAt > 15e3) {
      const entityId = STREAMING_ENTITY_ID ?? "";
      if (entityId) {
        await callStreamingHeartbeatTouch(entityId);
        callbackState.lastStreamingSentAt = Date.now();
      }
    }
  } finally {
    callbackState.flushInProgress = false;
    void flushBackgroundShellQueue();
  }
}
var PING_STUCK_MS = 45e3;
async function heartbeatPing() {
  if (callbackState.pingInProgress && callbackState.pingStartedAt > 0 && Date.now() - callbackState.pingStartedAt < PING_STUCK_MS) {
    return;
  }
  if (callbackState.pingInProgress) {
    console.warn(
      "[streaming-heartbeat] pingInProgress stuck past timeout, resetting"
    );
    callbackState.pingInProgress = false;
  }
  if (Date.now() - callbackState.lastStreamingSentAt < 1e4) return;
  callbackState.pingInProgress = true;
  callbackState.pingStartedAt = Date.now();
  try {
    if (callbackState.waitingForFirstAssistantEvent) {
      const startupStep = buildClaudeStartupStep();
      updateThinkingStep(startupStep.label, startupStep.detail);
      await sendStreamingHeartbeatUpdate(buildStreamingPayload());
      return;
    }
    const entityId = STREAMING_ENTITY_ID ?? "";
    if (!entityId) return;
    await callStreamingHeartbeatTouch(entityId);
    callbackState.lastStreamingSentAt = Date.now();
    callbackState.consecutiveHeartbeatFailures = 0;
    callbackState.heartbeatFailureStreakStartedAt = 0;
  } catch (error) {
    noteHeartbeatFailure(error instanceof Error ? error : String(error));
  } finally {
    callbackState.pingInProgress = false;
    callbackState.pingStartedAt = 0;
  }
}
async function initialHeartbeat() {
  const startedAt = Date.now();
  let attempt = 0;
  while (attempt <= 1) {
    try {
      const payload = buildStreamingPayload();
      await callStreamingHeartbeat(
        STREAMING_ENTITY_ID ?? "",
        payload,
        callbackState.currentStreamedContent,
        callbackState.pendingQuestionData || void 0
      );
      markHeartbeatSuccess(payload);
      log(
        "initialHeartbeat succeeded in " + String(Date.now() - startedAt) + "ms attempts=" + String(attempt + 1)
      );
      return;
    } catch (e) {
      attempt++;
      if (attempt > 1) throw e;
      await new Promise((r) => setTimeout(r, 1e3));
    }
  }
}
function enforceTurnLease() {
  const reason = getLeaseTerminalReason();
  if (reason === null) return false;
  if (leaseExitScheduled) return true;
  leaseExitScheduled = true;
  log("exiting: turn lease terminal (" + reason + ")");
  if (callbackState.activeAttemptChild) {
    terminateAttemptProcess(callbackState.activeAttemptChild);
  }
  if (flushInterval) clearInterval(flushInterval);
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  callbackState.streamingLoopsStopped = true;
  setTimeout(() => process.exit(0), LEASE_EXIT_GRACE_MS).unref();
  return true;
}
var LEASE_EXIT_GRACE_MS = 500;
var leaseExitScheduled = false;
function startStreamingLoops() {
  flushInterval = setInterval(() => {
    void flushStreaming().then(enforceTurnLease);
  }, 150);
  heartbeatInterval = setInterval(() => {
    void heartbeatPing().then(enforceTurnLease);
  }, 1e4);
}
async function stopStreamingLoops() {
  if (callbackState.streamingLoopsStopped) return;
  callbackState.streamingLoopsStopped = true;
  if (flushInterval) clearInterval(flushInterval);
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  await flushStreaming();
}
async function setFinalizingState() {
  markLastComplete();
  callbackState.lastStepType = "thinking";
  try {
    await sendStreamingHeartbeatUpdate(buildStreamingPayload());
  } catch {
  }
  return enforceTurnLease();
}
async function runPreflightHeartbeat() {
  try {
    await initialHeartbeat();
    try {
      writeFileSync7(READY_FILE, LAUNCH_ID || String(Date.now()));
      log(
        "ready file written after " + String(Date.now() - SCRIPT_STARTED_AT) + "ms"
      );
    } catch {
    }
    return true;
  } catch (error) {
    console.error("Callback preflight failed:", String(error));
    return false;
  }
}

// callback-src/providers/index.ts
function getProviderAdapter(provider = PROVIDER) {
  if (provider === "codex") return codexAdapter;
  if (provider === "opencode") return opencodeAdapter;
  if (provider === "cursor") return cursorAdapter;
  return claudeAdapter;
}

// callback-src/parse/streamRouter.ts
function processRealtimeStdoutChunk(text) {
  callbackState.realtimeOutputBuffer += text;
  while (true) {
    const newlineIndex = callbackState.realtimeOutputBuffer.indexOf("\\n");
    if (newlineIndex === -1) {
      return;
    }
    const line = callbackState.realtimeOutputBuffer.slice(0, newlineIndex).trim();
    callbackState.realtimeOutputBuffer = callbackState.realtimeOutputBuffer.slice(newlineIndex + 1);
    if (!line) {
      continue;
    }
    handleRealtimeStreamLine(line);
  }
}
function handleRealtimeStreamLine(line) {
  const parsed = tryParseJson(line);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return;
  }
  const result = getProviderAdapter(PROVIDER).onStreamLine(line, parsed);
  if (result.needsHeartbeat) {
    void sendStreamingHeartbeatUpdate(buildStreamingPayload());
  }
}

// callback-src/runtime/buffers.ts
import { createWriteStream } from "fs";
function trimBufferHead(buf) {
  if (buf.length <= OUTPUT_BUFFER_MAX_BYTES) return buf;
  return buf.slice(buf.length - OUTPUT_BUFFER_MAX_BYTES);
}
function appendToRawOutput(text) {
  appendRawOutputChunk(text);
  const trimAmount = trimRawOutputHead(OUTPUT_BUFFER_MAX_BYTES);
  if (trimAmount > 0) {
    shiftLastProcessed(trimAmount);
  }
}
function appendToRawLogFile(text) {
  if (callbackState.rawLogStreamFailed || !text) return;
  try {
    if (!callbackState.rawLogStream) {
      const stream = createWriteStream(RAW_LOG_FILE, { flags: "a" });
      stream.on("error", (err) => {
        setRawLogStreamFailed(true);
        console.error(
          "Raw log stream error: " + String(err instanceof Error ? err.message : err)
        );
      });
      assignRawLogStream(stream);
      stream.write(text);
    } else {
      callbackState.rawLogStream.write(text);
    }
    incrementRawLogBytesWritten(Buffer.byteLength(text));
  } catch (err) {
    setRawLogStreamFailed(true);
    console.error(
      "Failed to append to raw log: " + String(err instanceof Error ? err.message : err)
    );
  }
}

// callback-src/providers/claudeSdk.ts
import { execSync } from "child_process";
import { existsSync as existsSync6, readFileSync as readFileSync5 } from "fs";

// callback-src/runtime/cliAttempt.ts
import { spawn } from "child_process";
import { writeFileSync as writeFileSync8 } from "fs";
function evaluateAttemptHealth(input) {
  const result = {
    shouldTerminate: false,
    timedOutForZombie: false,
    timedOutForMaxRuntime: false,
    timedOutForFirstEvent: false,
    timedOutForFirstAssistant: false,
    timedOutAfterFirstText: false,
    timedOutForNoOutput: false,
    toolStallErrorMessage: input.toolStallErrorMessage
  };
  if (callbackState.fatalHeartbeatErrorMessage) {
    result.shouldTerminate = true;
    return result;
  }
  if (isChildZombie(input.childPid)) {
    if (callbackState.resultEventSeen) {
      result.logMessage = input.processLabel + " detected zombie state for pid=" + String(input.childPid) + " after result event; terminating for cleanup";
      result.shouldTerminate = true;
      return result;
    }
    result.timedOutForZombie = true;
    result.logMessage = input.processLabel + " detected zombie state for pid=" + String(input.childPid) + "; terminating";
    result.shouldTerminate = true;
    return result;
  }
  if (Date.now() - SCRIPT_STARTED_AT > MAX_TOTAL_RUNTIME_MS) {
    result.timedOutForMaxRuntime = true;
    result.shouldTerminate = true;
    return result;
  }
  if (callbackState.parsedStreamEventCount === input.parsedEventsAtStart && Date.now() - input.attemptStartedAt > FIRST_EVENT_TIMEOUT_MS) {
    result.timedOutForFirstEvent = true;
    result.shouldTerminate = true;
    return result;
  }
  if (callbackState.waitingForFirstAssistantEvent && callbackState.claudeInitAt > 0 && Date.now() - callbackState.claudeInitAt > FIRST_ASSISTANT_EVENT_TIMEOUT_MS) {
    result.timedOutForFirstAssistant = true;
    result.logMessage = input.processLabel + " stalled waiting for first assistant event for " + String(Date.now() - callbackState.claudeInitAt) + "ms after init; terminating process";
    result.shouldTerminate = true;
    return result;
  }
  if (callbackState.inFlightToolUses > 0 || callbackState.resultEventSeen) {
    return result;
  }
  const silenceMs = Date.now() - input.lastStdoutAt;
  if (silenceMs > STREAM_SILENCE_TIMEOUT_MS) {
    result.timedOutForNoOutput = true;
    if (callbackState.firstTextBlockAt > 0) {
      result.timedOutAfterFirstText = true;
    }
    result.logMessage = input.processLabel + " stream silent for " + String(silenceMs) + "ms with no tool in flight; terminating process";
    result.shouldTerminate = true;
  }
  return result;
}
function resetAttemptState() {
  callbackState.realtimeOutputBuffer = "";
  callbackState.resultEventSeen = false;
  callbackState.waitingForFirstAssistantEvent = false;
  callbackState.claudeInitAt = 0;
  callbackState.currentStreamedContent = "";
  callbackState.firstAssistantEventAt = 0;
  callbackState.firstTextBlockAt = 0;
  callbackState.fatalHeartbeatErrorMessage = "";
  callbackState.heartbeatFailureStreakStartedAt = 0;
  callbackState.inFlightToolUses = 0;
  callbackState.codexToolItemIds.clear();
  callbackState.cursorKnownToolIds.clear();
  callbackState.cursorTerminalToolIds.clear();
}
async function runCliAttempt(options) {
  resetAttemptState();
  callbackState.activeAttemptStartedAt = Date.now();
  updateThinkingStep(options.startupStep.label, options.startupStep.detail);
  if (options.onStart) {
    options.onStart();
  }
  return await new Promise((resolve, reject) => {
    const child = spawn(
      "bash",
      ["-c", "cd " + WORK_DIR + " && " + options.cmd],
      {
        env: options.env,
        stdio: ["pipe", "pipe", "pipe"]
      }
    );
    callbackState.activeAttemptChild = child;
    if (child.pid) {
      try {
        writeFileSync8("/proc/" + String(child.pid) + "/oom_score_adj", "300");
      } catch {
      }
    }
    log(
      options.processLabel + " process spawned after " + String(elapsedAttemptMs()) + "ms pid=" + String(child.pid || "unknown")
    );
    let attemptOutput = "";
    const attemptStartedAt = Date.now();
    const parsedEventsAtStart = callbackState.parsedStreamEventCount;
    let lastStdoutAt = Date.now();
    let timedOutForNoOutput = false;
    let timedOutForMaxRuntime = false;
    let timedOutForFirstEvent = false;
    let timedOutForFirstAssistant = false;
    let timedOutAfterFirstText = false;
    let timedOutForZombie = false;
    let toolStallErrorMessage = "";
    const noOutputTimer = setInterval(() => {
      const health = evaluateAttemptHealth({
        childPid: child.pid,
        parsedEventsAtStart,
        attemptStartedAt,
        lastStdoutAt,
        processLabel: options.processLabel,
        toolStallErrorMessage
      });
      toolStallErrorMessage = health.toolStallErrorMessage;
      if (health.logMessage) {
        log(health.logMessage);
      }
      if (!health.shouldTerminate) {
        return;
      }
      timedOutForZombie = health.timedOutForZombie;
      timedOutForMaxRuntime = health.timedOutForMaxRuntime;
      timedOutForFirstEvent = health.timedOutForFirstEvent;
      timedOutForFirstAssistant = health.timedOutForFirstAssistant;
      timedOutAfterFirstText = health.timedOutAfterFirstText;
      timedOutForNoOutput = health.timedOutForNoOutput;
      terminateAttemptProcess(child);
    }, NO_OUTPUT_CHECK_INTERVAL_MS);
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      appendToRawLogFile(text);
      attemptOutput = trimBufferHead(attemptOutput + text);
      appendToRawOutput(text);
      lastStdoutAt = Date.now();
      processRealtimeStdoutChunk(text);
      if (options.onStdoutText) {
        options.onStdoutText(text);
      }
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      appendToRawLogFile(
        "[stderr] " + text + (text.endsWith("\\n") ? "" : "\\n")
      );
      callbackState.stderrOutput = trimBufferHead(callbackState.stderrOutput + text);
    });
    child.on("close", (code, signal) => {
      clearInterval(noOutputTimer);
      callbackState.activeAttemptChild = null;
      const terminatedBySignal = signal !== null;
      log(
        options.attemptLabel + " finished in " + elapsedAttemptMs() + "ms (code=" + code + ", signal=" + (signal ?? "none") + ", timedOutForNoOutput=" + timedOutForNoOutput + ", timedOutForMaxRuntime=" + timedOutForMaxRuntime + ", timedOutForFirstEvent=" + timedOutForFirstEvent + ", timedOutForFirstAssistant=" + timedOutForFirstAssistant + ", timedOutAfterFirstText=" + timedOutAfterFirstText + ", timedOutForZombie=" + timedOutForZombie + ", toolStallError=" + (toolStallErrorMessage || "none") + ", outputBytes=" + attemptOutput.length + ", stderrBytes=" + callbackState.stderrOutput.length + ")"
      );
      resolve({
        code: code ?? 1,
        terminatedBySignal,
        output: attemptOutput,
        timedOutForNoOutput,
        timedOutForMaxRuntime,
        timedOutForFirstEvent,
        timedOutForFirstAssistant,
        timedOutAfterFirstText,
        timedOutForZombie,
        toolStallErrorMessage
      });
    });
    child.on("error", (err) => {
      clearInterval(noOutputTimer);
      reject(err);
    });
  });
}

// callback-src/runtime/pendingQuestion.ts
var POLL_INTERVAL_MS = 300;
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function readClaimedAnswer(result) {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    return null;
  }
  const inner = result.value;
  const payload = typeof inner === "object" && inner !== null && !Array.isArray(inner) ? inner : result;
  const answer = payload.answer;
  return typeof answer === "string" ? answer : null;
}
async function postQuestion(toolUseId, payload) {
  await callConvexWithRetry("mutation", "pendingQuestions:post", {
    entityId: ENTITY_ID ?? "",
    toolUseId,
    payload
  });
}
async function pollForAnswer(toolUseId, signal) {
  while (!signal.aborted) {
    const result = await callConvexWithRetry(
      "mutation",
      "pendingQuestions:claimAnswer",
      { entityId: ENTITY_ID ?? "", toolUseId }
    );
    const answer = readClaimedAnswer(result);
    if (answer !== null) return answer;
    await sleep(POLL_INTERVAL_MS);
  }
  return null;
}
function parseAnswers(answerJson) {
  try {
    const parsed = JSON.parse(answerJson);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
  }
  return {};
}
function buildCanUseTool() {
  return async (toolName, input, options) => {
    if (!CLAIM_MUTATION && (toolName === "Agent" || toolName === "Task") && input.run_in_background === true) {
      return {
        behavior: "allow",
        updatedInput: { ...input, run_in_background: false }
      };
    }
    if (toolName !== "AskUserQuestion" || !BLOCKING_QUESTIONS_ENABLED) {
      return { behavior: "allow", updatedInput: input };
    }
    const toolUseId = typeof options.toolUseID === "string" && options.toolUseID ? options.toolUseID : "";
    callbackState.awaitingQuestionAnswer = true;
    log("canUseTool: AskUserQuestion \\u2014 posting question, awaiting user answer");
    try {
      await postQuestion(toolUseId, JSON.stringify(input));
      const answerJson = await pollForAnswer(toolUseId, options.signal);
      if (answerJson === null) {
        return { behavior: "deny", message: "The question was cancelled." };
      }
      return {
        behavior: "allow",
        updatedInput: { ...input, answers: parseAnswers(answerJson) }
      };
    } finally {
      callbackState.awaitingQuestionAnswer = false;
    }
  };
}

// callback-src/providers/claudeSdk.ts
var SDK_PACKAGE = "@anthropic-ai/claude-agent-sdk";
var SDK_VERSION = "0.3.201";
var MCP_CONFIG_PATH = "/tmp/eva-mcp.json";
function globalNpmRoot() {
  return execSync("npm root -g", { encoding: "utf8" }).trim();
}
var SDK_LOCAL_PREFIX = "/home/eva/.eva-agent-sdk";
async function loadSdk() {
  const globalEntry = globalNpmRoot() + "/" + SDK_PACKAGE + "/sdk.mjs";
  const localEntry = SDK_LOCAL_PREFIX + "/node_modules/" + SDK_PACKAGE + "/sdk.mjs";
  if (existsSync6(globalEntry)) {
    const mod2 = await import(globalEntry);
    return mod2;
  }
  if (!existsSync6(localEntry)) {
    log(
      "claude-agent-sdk not found in sandbox; installing " + SDK_PACKAGE + "@" + SDK_VERSION + " to " + SDK_LOCAL_PREFIX + " (one-time)"
    );
    execSync(
      "mkdir -p " + SDK_LOCAL_PREFIX + " && npm install --prefix " + SDK_LOCAL_PREFIX + " " + SDK_PACKAGE + "@" + SDK_VERSION,
      { encoding: "utf8", timeout: 18e4 }
    );
  }
  const mod = await import(localEntry);
  return mod;
}
function claudeExecutablePath() {
  try {
    return execSync("command -v claude", { encoding: "utf8" }).trim();
  } catch {
    const fallback = process.env.CLAUDE_BIN_PATH || "";
    return fallback && existsSync6(fallback) ? fallback : "claude";
  }
}
function readPromptText() {
  return readFileSync5("/tmp/design-prompt.txt", "utf8");
}
function buildSdkOptions(sessionMode) {
  const extraArgs = { settings: settingsJson };
  if (existsSync6(MCP_CONFIG_PATH)) {
    extraArgs["mcp-config"] = MCP_CONFIG_PATH;
  }
  return buildSdkOptionsFromParts(sessionMode, extraArgs);
}
var EVA_SDK_SYSTEM_APPEND = "You are running inside Eva, a platform that runs coding agents in remote sandboxes against GitHub repos. Treat the workspace as the active repo checkout.";
function buildSdkOptionsFromParts(sessionMode, extraArgs, tools = "agent") {
  const allowedToolsOption = tools === "agent" && ALLOWED_TOOLS ? { allowedTools: ALLOWED_TOOLS.split(",") } : { allowedTools: [] };
  const permissionOption = tools === "agent" ? {
    permissionMode: "default",
    allowDangerouslySkipPermissions: false,
    canUseTool: buildCanUseTool()
  } : {
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true
  };
  const env = {
    ...process.env,
    CLAUDE_CONFIG_DIR: CLAUDE_RUNTIME_CONFIG_DIR,
    DISABLE_NON_ESSENTIAL_MODEL_CALLS: "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    DISABLE_TELEMETRY: "1",
    DISABLE_AUTOUPDATER: "1",
    DISABLE_ERROR_REPORTING: "1",
    // Defer MCP/tool schemas when they exceed ~10% of context (agent turns only).
    ENABLE_TOOL_SEARCH: "auto"
  };
  if (CLAIM_MUTATION || ENTITY_ID_FIELD === "sessionId") {
    delete env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS;
  }
  const effortOption = claudeEffort === "low" || claudeEffort === "medium" || claudeEffort === "high" || claudeEffort === "xhigh" || claudeEffort === "max" ? { effort: claudeEffort } : {};
  return {
    cwd: WORK_DIR,
    model: normalizedClaudeModel,
    pathToClaudeCodeExecutable: claudeExecutablePath(),
    systemPrompt: SYSTEM_PROMPT ? {
      type: "preset",
      preset: "claude_code",
      append: \`\${EVA_SDK_SYSTEM_APPEND}

\${SYSTEM_PROMPT}\`
    } : {
      type: "preset",
      preset: "claude_code",
      append: EVA_SDK_SYSTEM_APPEND
    },
    ...permissionOption,
    // Emit token-level partial (\`stream_event\`) messages so claudeParseLine can
    // stream text deltas into the reply live (dedup guards the final message).
    includePartialMessages: true,
    ...allowedToolsOption,
    env,
    ...sessionMode.mode === "session" && sessionMode.sessionId ? { sessionId: sessionMode.sessionId } : {},
    ...sessionMode.mode === "resume" && sessionMode.sessionId ? { resume: sessionMode.sessionId } : {},
    extraArgs,
    ...effortOption
  };
}
async function runClaudeSdkAttempt(sessionMode) {
  resetAttemptState();
  callbackState.activeAttemptStartedAt = Date.now();
  const startupStep = buildClaudeStartupStep();
  updateThinkingStep(startupStep.label, startupStep.detail);
  log(
    "runClaudeSdkAttempt started (mode=" + sessionMode.mode + ", sessionId=" + (sessionMode.sessionId || "none") + ")"
  );
  let attemptOutput = "";
  let lastMessageAt = Date.now();
  let timedOutForNoOutput = false;
  let timedOutForMaxRuntime = false;
  let sawResult = false;
  let resultIsError = false;
  let queryErrorMessage = "";
  const sdk = await loadSdk();
  let effectiveMode = sessionMode;
  let q = sdk.query({
    prompt: readPromptText(),
    options: buildSdkOptions(effectiveMode)
  });
  const interrupt = async () => {
    try {
      if (q.interrupt) await q.interrupt();
    } catch {
    }
  };
  const healthTimer = setInterval(() => {
    const now = Date.now();
    if (callbackState.awaitingQuestionAnswer) {
      callbackState.activeAttemptStartedAt = now;
      lastMessageAt = now;
      return;
    }
    if (now - callbackState.activeAttemptStartedAt > MAX_TOTAL_RUNTIME_MS) {
      timedOutForMaxRuntime = true;
      log("runClaudeSdkAttempt: max runtime exceeded \\u2014 interrupting");
      void interrupt();
      return;
    }
    if (!sawResult && now - lastMessageAt > NO_OUTPUT_TIMEOUT_MS * 5) {
      timedOutForNoOutput = true;
      log("runClaudeSdkAttempt: no SDK messages \\u2014 interrupting");
      void interrupt();
    }
  }, NO_OUTPUT_CHECK_INTERVAL_MS);
  const consumeQuery = async () => {
    for await (const message of q) {
      lastMessageAt = Date.now();
      const line = JSON.stringify(message) + "\\n";
      appendToRawLogFile(line);
      attemptOutput = trimBufferHead(attemptOutput + line);
      appendToRawOutput(line);
      processRealtimeStdoutChunk(line);
      if (message.type === "result") {
        sawResult = true;
        resultIsError = message.is_error === true;
      }
      if (timedOutForMaxRuntime || timedOutForNoOutput) break;
    }
  };
  try {
    try {
      await consumeQuery();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      if (effectiveMode.mode === "resume" && effectiveMode.sessionId && messageText.includes("No conversation found with session ID")) {
        log(
          "runClaudeSdkAttempt: resume target missing \\u2014 retrying as a new session with the same id"
        );
        appendToRawLogFile("[sdk-retry] " + messageText + "\\n");
        sawResult = false;
        resultIsError = false;
        effectiveMode = { mode: "session", sessionId: effectiveMode.sessionId };
        q = sdk.query({
          prompt: readPromptText(),
          options: buildSdkOptions(effectiveMode)
        });
        await consumeQuery();
      } else {
        throw error;
      }
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    queryErrorMessage = messageText;
    log("runClaudeSdkAttempt: query failed \\u2014 " + messageText);
    appendToRawLogFile("[sdk-error] " + messageText + "\\n");
    callbackState.stderrOutput = trimBufferHead(callbackState.stderrOutput + messageText + "\\n");
  } finally {
    clearInterval(healthTimer);
  }
  const code = sawResult && !resultIsError && !timedOutForMaxRuntime && !timedOutForNoOutput ? 0 : 1;
  log(
    "runClaudeSdkAttempt finished in " + String(Date.now() - callbackState.activeAttemptStartedAt) + "ms (code=" + code + ", sawResult=" + sawResult + ", resultIsError=" + resultIsError + ", timedOutForNoOutput=" + timedOutForNoOutput + ", timedOutForMaxRuntime=" + timedOutForMaxRuntime + ", outputBytes=" + attemptOutput.length + (queryErrorMessage ? ", queryError=" + queryErrorMessage : "") + ")"
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
    toolStallErrorMessage: ""
  };
}

// callback-src/runtime/turnPersist.ts
import { spawnSync as spawnSync3 } from "child_process";
var GIT_STEP_TIMEOUT_MS = 2e4;
var PUSH_TIMEOUT_MS = 6e4;
var COMMIT_ADD_ARGS = [
  "add",
  "-A",
  "--",
  ":!*.png",
  ":!*.jpg",
  ":!*.jpeg",
  ":!*.gif",
  ":!*.webp",
  ":!*.webm",
  ":!*.mp4",
  ":!*.mov",
  ":!screenshots/",
  ":!recordings/"
];
function git(args, timeoutMs = GIT_STEP_TIMEOUT_MS) {
  const result = spawnSync3("git", ["-C", WORK_DIR, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }
  });
  const out = ((result.stdout || "") + (result.stderr || "")).trim();
  return { ok: result.status === 0, out };
}
function persistTurnWork() {
  if (REQUIRE_TASK_COMMIT || RUN_ID) return;
  const startedAt = Date.now();
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch.ok || !branch.out.startsWith("eva/")) {
    if (branch.ok && branch.out) {
      log(\`persistTurnWork: skipped \\u2014 branch "\${branch.out}" is not eva-owned\`);
    }
    return;
  }
  const dirty = git(["status", "--porcelain"]);
  if (dirty.ok && dirty.out.length > 0) {
    git(COMMIT_ADD_ARGS);
    const staged = git(["diff", "--cached", "--quiet"]);
    if (!staged.ok) {
      const commit = git([
        "commit",
        "-m",
        "task: checkpoint uncommitted work at turn end"
      ]);
      log(
        \`persistTurnWork: auto-commit \${commit.ok ? "created" : "failed: " + commit.out.slice(0, 200)}\`
      );
    }
  }
  const unpushed = git([
    "rev-list",
    "--count",
    "HEAD",
    "--not",
    "--remotes=origin"
  ]);
  if (unpushed.ok && unpushed.out === "0") return;
  const push = git(["push", "origin", "HEAD"], PUSH_TIMEOUT_MS);
  log(
    \`persistTurnWork: push \${push.ok ? "ok" : "failed: " + push.out.slice(0, 200)} branch=\${branch.out} in \${Date.now() - startedAt}ms\`
  );
}

// callback-src/providers/claimPendingTurnParse.ts
function readStopTaskToolUseIds(result) {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    return [];
  }
  const inner = result.value;
  const payload = typeof inner === "object" && inner !== null && !Array.isArray(inner) ? inner : result;
  const field = payload.stopTaskToolUseIds;
  if (!Array.isArray(field)) {
    return [];
  }
  return field.filter((id) => typeof id === "string");
}
function readCancelRequested(result) {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    return false;
  }
  const inner = result.value;
  const payload = typeof inner === "object" && inner !== null && !Array.isArray(inner) ? inner : result;
  return payload.cancelRequested === true;
}

// callback-src/providers/claudeSdkDaemon.ts
function sleep2(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function readDaemonPidFile() {
  try {
    return Number(readFileSync6(DAEMON_PID_FILE, "utf8").trim());
  } catch {
    return Number.NaN;
  }
}
var daemonPaths = resolveDaemonPaths();
var DAEMON_PID_FILE = daemonPaths.pid;
var DAEMON_ENTITY_FILE = daemonPaths.entity;
var DAEMON_OPTS_FILE = daemonPaths.opts;
var IDLE_EXIT_MS = 45 * 60 * 1e3;
var FENCE_POLL_INTERVAL_MS = 5e3;
var PROMPT_POLL_INTERVAL_MS = 50;
var NO_MESSAGE_TIMEOUT_MS = NO_OUTPUT_TIMEOUT_MS * 5;
var WATCHDOG_TICK_MS = 5e3;
var CANCEL_SETTLE_TIMEOUT_MS = 3e4;
var turnActive = false;
var turnStartedAtMs = 0;
var lastMessageAtMs = 0;
var daemonTurn = null;
var pendingClaimedTurn = null;
var daemonExiting = false;
var openingSyntheticTurn = false;
var lastIdleActivityAtMs = Date.now();
var agentTurnOutput = "";
var agentTurnStartedAt = 0;
var sawFirstMessageThisTurn = { value: false };
var sawAssistantThisTurn = { value: false };
var turnCancelInFlight = false;
var turnCancelRequestedAtMs = 0;
var recognisedSubagentToolUseIds = /* @__PURE__ */ new Set();
var settledSubagentToolUseIds = /* @__PURE__ */ new Set();
var unsettledBackgroundAgents = /* @__PURE__ */ new Map();
var pendingAgentStops = /* @__PURE__ */ new Set();
var currentAgentRunner = null;
function entityMutationArgs(fields) {
  return {
    [ENTITY_ID_FIELD ?? "sessionId"]: ENTITY_ID ?? "",
    ...fields
  };
}
function beginWatchedTurn() {
  turnActive = true;
  turnStartedAtMs = Date.now();
  lastMessageAtMs = turnStartedAtMs;
}
function noteWatchedMessage() {
  lastMessageAtMs = Date.now();
}
function endWatchedTurn() {
  turnActive = false;
}
function currentTurnArgs() {
  const turnId = getCurrentTurnId();
  return turnId ? { turnId } : {};
}
async function failTurnAndExit(error) {
  log("daemon: failing turn \\u2014 " + error);
  try {
    await callConvexWithRetry("mutation", COMPLETION_MUTATION ?? "", {
      [ENTITY_ID_FIELD ?? "sessionId"]: ENTITY_ID ?? "",
      success: false,
      result: null,
      error,
      activityLog: serializeSteps(callbackState.accumulatedSteps),
      ...RUN_ID ? { runId: RUN_ID } : {},
      ...currentTurnArgs()
    });
  } catch {
  }
  if (readDaemonPidFile() === process.pid) {
    try {
      unlinkSync2(DAEMON_PID_FILE);
    } catch {
    }
  }
  await stopStreamingLoops();
  process.exit(1);
}
async function exitWithoutCompletion(reason) {
  log("daemon: exiting without completion \\u2014 " + reason);
  if (readDaemonPidFile() === process.pid) {
    try {
      unlinkSync2(DAEMON_PID_FILE);
    } catch {
    }
  }
  await stopStreamingLoops();
}
function startTurnWatchdog() {
  const timer = setInterval(() => {
    const now = Date.now();
    if (turnCancelInFlight) {
      if (now - turnCancelRequestedAtMs > CANCEL_SETTLE_TIMEOUT_MS) {
        log("daemon: cancelled turn did not settle in time \\u2014 exiting");
        process.exit(1);
      }
      return;
    }
    if (!turnActive) return;
    if (callbackState.awaitingQuestionAnswer) {
      turnStartedAtMs = now;
      lastMessageAtMs = now;
      return;
    }
    if (now - turnStartedAtMs > MAX_TOTAL_RUNTIME_MS) {
      turnActive = false;
      if (daemonTurn?.kind === "synthetic") {
        void failSyntheticTurn(
          "The assistant exceeded the maximum turn runtime."
        );
      } else {
        void failTurnAndExit(
          "The assistant exceeded the maximum turn runtime."
        );
      }
    } else if (now - lastMessageAtMs > NO_MESSAGE_TIMEOUT_MS) {
      turnActive = false;
      if (daemonTurn?.kind === "synthetic") {
        void failSyntheticTurn(
          "The assistant stopped responding. Please try again."
        );
      } else {
        void failTurnAndExit(
          "The assistant stopped responding. Please try again."
        );
      }
    }
  }, WATCHDOG_TICK_MS);
  timer.unref?.();
}
function createPromptStream() {
  const queue = [];
  let notify = null;
  const push = (text) => {
    queue.push({
      type: "user",
      message: { role: "user", content: text },
      parent_tool_use_id: null,
      session_id: callbackState.activeClaudeSessionId || ""
    });
    const resume = notify;
    notify = null;
    if (resume) resume();
  };
  const iterable = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          while (queue.length === 0) {
            await new Promise((resolve) => {
              notify = resolve;
            });
          }
          const value = queue.shift();
          if (value === void 0) {
            return { value: void 0, done: true };
          }
          return { value, done: false };
        }
      };
    }
  };
  return { push, iterable };
}
async function ensureGithubToken() {
  if (!REPO_ID || !CONVEX_URL || !CONVEX_TOKEN) return;
  try {
    const res = await fetchWithTimeout(CONVEX_URL + "/api/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + CONVEX_TOKEN
      },
      body: JSON.stringify({
        path: "github:getInstallationTokenAction",
        args: { repoId: REPO_ID },
        format: "json"
      })
    });
    if (!res.ok) return;
    const data = await readResponseJson(res);
    const token = readGithubToken(data);
    if (token) {
      process.env.GITHUB_TOKEN = token;
      process.env.GH_TOKEN = token;
    }
  } catch {
  }
}
function readGithubToken(data) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  const value = data.value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const payload = value;
  return typeof payload.token === "string" ? payload.token : null;
}
function resetTurnState() {
  callbackState.accumulatedSteps.length = 0;
  callbackState.currentStreamedContent = "";
  callbackState.streamedAssistantTextThisMessage = false;
  callbackState.resultEventSeen = false;
  callbackState.rawOutput = "";
  callbackState.lastProcessed = 0;
  callbackState.inFlightToolUses = 0;
  callbackState.pendingQuestionData = "";
  callbackState.todoState.length = 0;
  callbackState.awaitingQuestionAnswer = false;
  callbackState.lastStepType = "thinking";
  setCurrentTurnId(null);
}
async function finalizeTurn(output) {
  await flushStreaming();
  const resultEvent = extractResultEvent(output);
  for (const step of callbackState.accumulatedSteps) step.status = "complete";
  const activityLog = serializeSteps(callbackState.accumulatedSteps);
  const success = resultEvent ? !resultEvent.isError : false;
  const completionArgs = {
    [ENTITY_ID_FIELD ?? "sessionId"]: ENTITY_ID ?? "",
    success,
    result: resultEvent?.result ?? callbackState.rawOutput,
    error: resultEvent?.isError ? resultEvent.result : null,
    activityLog
  };
  if (RUN_ID) completionArgs.runId = RUN_ID;
  if (resultEvent?.rawResultEvent) {
    completionArgs.rawResultEvent = resultEvent.rawResultEvent;
  }
  if (callbackState.pendingQuestionData) {
    completionArgs.pendingQuestion = callbackState.pendingQuestionData;
  }
  if (await setFinalizingState()) return false;
  Object.assign(completionArgs, currentTurnArgs());
  persistTurnWork();
  const completionSentAt = Date.now();
  await deliverCompletionWithMedia(completionArgs);
  setCurrentTurnId(null);
  log(
    "daemon: turn finalized success=" + success + " steps=" + activityLog.length + " (completion mutation " + (Date.now() - completionSentAt) + "ms)"
  );
  const bookkeepingAt = Date.now();
  syncClaudeStateToPersist("daemon-turn");
  log(
    "daemon: post-turn bookkeeping took " + (Date.now() - bookkeepingAt) + "ms"
  );
  return true;
}
function readClaimedPrompt(result) {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    return null;
  }
  const inner = result.value;
  const payload = typeof inner === "object" && inner !== null && !Array.isArray(inner) ? inner : result;
  const prompt = payload.prompt;
  return typeof prompt === "string" ? prompt : null;
}
function readClaimedAttachmentUrls(payload) {
  const field = payload.attachmentUrls;
  if (!Array.isArray(field)) {
    return [];
  }
  return field.filter((url) => typeof url === "string");
}
function readClaimedTurn(result) {
  const prompt = readClaimedPrompt(result);
  if (prompt === null) {
    return null;
  }
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    return { prompt, attachmentUrls: [], turnId: null };
  }
  const inner = result.value;
  const payload = typeof inner === "object" && inner !== null && !Array.isArray(inner) ? inner : result;
  return {
    prompt,
    attachmentUrls: readClaimedAttachmentUrls(payload),
    turnId: typeof payload.turnId === "string" ? payload.turnId : null
  };
}
function readOpenedSyntheticTurn(result) {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    return null;
  }
  const inner = result.value;
  const payload = typeof inner === "object" && inner !== null && !Array.isArray(inner) ? inner : result;
  const messageId = payload.messageId;
  if (typeof messageId !== "string") return null;
  return {
    messageId,
    turnId: typeof payload.turnId === "string" ? payload.turnId : null
  };
}
function readParentToolUseId(message) {
  const parentField = message.parent_tool_use_id;
  if (typeof parentField === "string" && parentField.trim()) {
    return parentField.trim();
  }
  return null;
}
function readStringField2(message, field) {
  const value = message[field];
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function recogniseSubagentToolUses(message) {
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
function shouldDropSubagentMessage(message) {
  const parentId = readParentToolUseId(message);
  if (parentId === null) {
    return false;
  }
  return settledSubagentToolUseIds.has(parentId);
}
function shouldMintSyntheticTurn(message) {
  if (message.type === "assistant" || message.type === "stream_event") {
    return true;
  }
  const parentId = readParentToolUseId(message);
  if (parentId === null) {
    return false;
  }
  return recognisedSubagentToolUseIds.has(parentId);
}
function completeSubtaskStep(toolUseId) {
  for (const step of callbackState.accumulatedSteps) {
    if (step.type === "subtask" && step.toolUseId === toolUseId) {
      step.status = "complete";
    }
  }
}
function settleSubagent(toolUseId, terminalStatus) {
  settledSubagentToolUseIds.add(toolUseId);
  const entry = unsettledBackgroundAgents.get(toolUseId);
  unsettledBackgroundAgents.delete(toolUseId);
  completeSubtaskStep(toolUseId);
  if (entry) {
    void syncBackgroundAgentsToConvex([
      {
        ...entry,
        status: terminalStatus,
        settledAt: Date.now()
      }
    ]);
  }
}
function toConvexBackgroundAgent(entry) {
  const payload = {
    toolUseId: entry.toolUseId,
    status: entry.status,
    startedAt: entry.startedAt
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
  if (entry.settledAt !== void 0) {
    payload.settledAt = entry.settledAt;
  }
  return payload;
}
async function syncBackgroundAgentsToConvex(agents) {
  if (agents.length === 0) {
    return;
  }
  try {
    await callConvexWithRetry(
      "mutation",
      UPDATE_BACKGROUND_AGENTS_MUTATION ?? "",
      entityMutationArgs({
        agents: agents.map(toConvexBackgroundAgent)
      })
    );
  } catch {
  }
}
function findAgentByTaskId(taskId) {
  for (const entry of unsettledBackgroundAgents.values()) {
    if (entry.taskId === taskId) {
      return entry;
    }
  }
  return void 0;
}
function markAgentsBackgrounded(taskIds) {
  const patches = [];
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
async function dispatchPendingAgentStops(agentRunner) {
  const pendingStops = [];
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
      const messageText = error instanceof Error ? error.message : String(error);
      log("daemon: stopTask failed \\u2014 " + messageText);
      pendingAgentStops.add(toolUseId);
    }
  }
}
function handleBackgroundTasksChanged(message) {
  if (message.type !== "system" || message.subtype !== "background_tasks_changed") {
    return;
  }
  const tasksField = message.tasks;
  if (!Array.isArray(tasksField)) {
    return;
  }
  const taskIds = [];
  for (const task of tasksField) {
    if (typeof task !== "object" || task === null || Array.isArray(task)) {
      continue;
    }
    const taskIdField = task.task_id;
    const taskId = typeof taskIdField === "string" && taskIdField.trim() ? taskIdField.trim() : void 0;
    if (taskId) {
      taskIds.push(taskId);
    }
  }
  markAgentsBackgrounded(taskIds);
}
function handleSystemTaskMessage(message) {
  if (message.type !== "system") {
    return;
  }
  const subtype = message.subtype;
  if (typeof subtype !== "string") {
    return;
  }
  const toolUseId = readStringField2(message, "tool_use_id");
  if (subtype === "task_started" && toolUseId) {
    const entry = {
      toolUseId,
      taskId: readStringField2(message, "task_id"),
      description: readStringField2(message, "description"),
      status: "running",
      startedAt: Date.now()
    };
    unsettledBackgroundAgents.set(toolUseId, entry);
    void syncBackgroundAgentsToConvex([entry]);
    if (currentAgentRunner) {
      void dispatchPendingAgentStops(currentAgentRunner);
    }
    return;
  }
  if ((subtype === "task_updated" || subtype === "task_notification") && toolUseId) {
    const status = readStringField2(message, "status");
    const terminal = status === "completed" || status === "failed" || status === "killed" || status === "stopped" || subtype === "task_notification";
    if (terminal) {
      settleSubagent(toolUseId, status ?? "completed");
    }
  }
}
async function failSyntheticTurn(error) {
  if (daemonTurn?.kind !== "synthetic") {
    return;
  }
  log("daemon: failing synthetic turn \\u2014 " + error);
  const messageId = daemonTurn.messageId;
  try {
    await flushStreaming();
    for (const step of callbackState.accumulatedSteps) {
      step.status = "complete";
    }
    await callConvexWithRetry(
      "mutation",
      COMPLETE_SYNTHETIC_TURN_MUTATION ?? "",
      entityMutationArgs({
        messageId,
        success: false,
        result: null,
        error,
        activityLog: serializeSteps(callbackState.accumulatedSteps),
        ...currentTurnArgs()
      })
    );
  } catch {
  }
  endWatchedTurn();
  resetTurnState();
  daemonTurn = null;
  agentTurnOutput = "";
}
async function ensureSyntheticTurn() {
  if (daemonTurn !== null || openingSyntheticTurn) {
    return;
  }
  openingSyntheticTurn = true;
  try {
    const result = await callConvexWithRetry(
      "mutation",
      OPEN_SYNTHETIC_TURN_MUTATION ?? "",
      entityMutationArgs({})
    );
    const opened = readOpenedSyntheticTurn(result);
    if (opened === null) {
      log("daemon: openSyntheticTurn returned no messageId");
      return;
    }
    const { messageId } = opened;
    resetTurnState();
    daemonTurn = { kind: "synthetic", messageId };
    setCurrentTurnId(opened.turnId);
    agentTurnStartedAt = Date.now();
    sawFirstMessageThisTurn = { value: false };
    sawAssistantThisTurn = { value: false };
    callbackState.activeAttemptStartedAt = agentTurnStartedAt;
    beginWatchedTurn();
    log("daemon: synthetic turn opened messageId=" + messageId);
  } finally {
    openingSyntheticTurn = false;
  }
}
async function finalizeSyntheticTurn(output) {
  if (daemonTurn?.kind !== "synthetic") {
    return false;
  }
  const messageId = daemonTurn.messageId;
  await flushStreaming();
  const resultEvent = extractResultEvent(output);
  for (const step of callbackState.accumulatedSteps) {
    step.status = "complete";
  }
  const activityLog = serializeSteps(callbackState.accumulatedSteps);
  const success = resultEvent ? !resultEvent.isError : false;
  const completionArgs = entityMutationArgs({
    messageId,
    success,
    result: resultEvent?.result ?? callbackState.rawOutput,
    error: resultEvent?.isError ? resultEvent.result : null,
    activityLog
  });
  if (callbackState.pendingQuestionData) {
    completionArgs.pendingQuestion = callbackState.pendingQuestionData;
  }
  if (await setFinalizingState()) return false;
  Object.assign(completionArgs, currentTurnArgs());
  await callConvexWithRetry(
    "mutation",
    COMPLETE_SYNTHETIC_TURN_MUTATION ?? "",
    completionArgs
  );
  syncClaudeStateToPersist("daemon-synthetic-turn");
  endWatchedTurn();
  resetTurnState();
  daemonTurn = null;
  agentTurnOutput = "";
  log("daemon: synthetic turn finalized success=" + success);
  return true;
}
function startRealAgentTurn(turn, agentRunner) {
  resetTurnState();
  daemonTurn = { kind: "real" };
  setCurrentTurnId(turn.turnId);
  agentTurnStartedAt = Date.now();
  sawFirstMessageThisTurn = { value: false };
  sawAssistantThisTurn = { value: false };
  beginWatchedTurn();
  agentRunner.push(turn.prompt);
  callbackState.activeAttemptStartedAt = agentTurnStartedAt;
  agentTurnOutput = "";
  log("daemon: real turn started turnId=" + String(turn.turnId));
}
function handleCancelRequested(agentRunner) {
  if (daemonTurn === null) {
    log("daemon: cancelRequested with no active turn \\u2014 ignored");
    return;
  }
  if (turnCancelInFlight) {
    return;
  }
  turnCancelInFlight = true;
  turnCancelRequestedAtMs = Date.now();
  endWatchedTurn();
  log("daemon: cancel requested \\u2014 interrupting in-flight turn");
  void agentRunner.interrupt().catch((error) => {
    const messageText = error instanceof Error ? error.message : String(error);
    log("daemon: interrupt failed \\u2014 " + messageText);
  });
}
function startClaimWatcher(agentRunner) {
  void (async () => {
    while (!daemonExiting) {
      if (callbackScriptWentStaleOnDisk()) {
        log("daemon: callback script updated on disk \\u2014 exiting for respawn");
        daemonExiting = true;
        return;
      }
      try {
        const claimed = await callConvexWithRetry(
          "mutation",
          CLAIM_MUTATION ?? "",
          entityMutationArgs({ model: MODEL })
        );
        const stopIds = readStopTaskToolUseIds(claimed);
        for (const toolUseId of stopIds) {
          pendingAgentStops.add(toolUseId);
        }
        await dispatchPendingAgentStops(agentRunner);
        if (readCancelRequested(claimed)) {
          handleCancelRequested(agentRunner);
        }
        const turn = readClaimedTurn(claimed);
        if (turn !== null) {
          await materializeTurnAttachments(turn);
          lastIdleActivityAtMs = Date.now();
          if (daemonTurn === null) {
            pendingClaimedTurn = turn;
          } else if (daemonTurn.kind === "synthetic") {
            pendingClaimedTurn = turn;
          } else if (turnCancelInFlight) {
            pendingClaimedTurn = turn;
          } else {
            log(
              "daemon: claim discarded while real turn active (prompt lost; pendingTurn was already cleared)"
            );
          }
        }
      } catch {
      }
      await sleep2(PROMPT_POLL_INTERVAL_MS);
    }
  })();
}
async function runDaemonMessagePump(agentRunner) {
  while (!daemonExiting) {
    if (daemonTurn === null && pendingClaimedTurn !== null) {
      const turn = pendingClaimedTurn;
      pendingClaimedTurn = null;
      startRealAgentTurn(turn, agentRunner);
      continue;
    }
    if (daemonTurn === null && pendingClaimedTurn === null && unsettledBackgroundAgents.size === 0 && Date.now() - lastIdleActivityAtMs > IDLE_EXIT_MS) {
      log("daemon: idle timeout \\u2014 exiting");
      return;
    }
    if (daemonTurn === null && !agentRunner.hasPending()) {
      await sleep2(PROMPT_POLL_INTERVAL_MS);
      continue;
    }
    const message = await agentRunner.waitMessage();
    if (message === null) {
      if (turnCancelInFlight) {
        await exitWithoutCompletion("pump ended while a cancel was settling");
        return;
      }
      if (turnActive) {
        if (daemonTurn?.kind === "synthetic") {
          await failSyntheticTurn(
            "The assistant ended without a reply. Please try again."
          );
        } else {
          await failTurnAndExit(
            "The assistant ended without a reply. Please try again."
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
    if (turnCancelInFlight) {
      if (message.type !== "result") {
        continue;
      }
      resetTurnState();
      daemonTurn = null;
      agentTurnOutput = "";
      turnCancelInFlight = false;
      continue;
    }
    if (message.type === "result" && daemonTurn === null) {
      log("daemon: result with no live turn \\u2014 ignored");
      continue;
    }
    if (daemonTurn === null) {
      if (!shouldMintSyntheticTurn(message)) {
        const messageType = typeof message.type === "string" ? message.type : "?";
        log(
          "daemon: between-turn " + messageType + " consumed without minting a synthetic turn"
        );
        continue;
      }
      await ensureSyntheticTurn();
      if (daemonTurn === null) {
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
      sawAssistantThisTurn
    );
    agentTurnOutput = processed.output;
    if (!processed.isResult) {
      continue;
    }
    endWatchedTurn();
    const resultAt = Date.now();
    log(
      "daemon[timing]: result message +" + (resultAt - agentTurnStartedAt) + "ms after turn start"
    );
    let completionAccepted;
    if (daemonTurn?.kind === "synthetic") {
      completionAccepted = await finalizeSyntheticTurn(agentTurnOutput);
    } else {
      completionAccepted = await finalizeTurn(agentTurnOutput);
      log(
        "daemon[timing]: finalizeTurn took " + (Date.now() - resultAt) + "ms"
      );
      daemonTurn = null;
    }
    if (!completionAccepted) {
      daemonExiting = true;
      return;
    }
    if (pendingClaimedTurn !== null && daemonTurn === null) {
      const parked = pendingClaimedTurn;
      pendingClaimedTurn = null;
      startRealAgentTurn(parked, agentRunner);
    }
  }
}
function handleDaemonMessage(message, output, turnStartedAt, sawFirstMessageThisTurn2, sawAssistantThisTurn2) {
  const messageType = typeof message.type === "string" ? message.type : "?";
  if (!sawFirstMessageThisTurn2.value) {
    sawFirstMessageThisTurn2.value = true;
    log(
      "daemon[timing]: first SDK message (" + messageType + ") +" + (Date.now() - turnStartedAt) + "ms after turn start"
    );
  }
  if (!sawAssistantThisTurn2.value && messageType === "assistant") {
    sawAssistantThisTurn2.value = true;
    log(
      "daemon[timing]: first assistant msg +" + (Date.now() - turnStartedAt) + "ms after turn start"
    );
  }
  const line = JSON.stringify(message) + "\\n";
  appendToRawLogFile(line);
  const nextOutput = trimBufferHead(output + line);
  appendToRawOutput(line);
  processRealtimeStdoutChunk(line);
  const isResult = message.type === "result";
  return { output: nextOutput, isResult };
}
function createWarmAgentRunner(sdk, options) {
  const { push, iterable } = createPromptStream();
  log("daemon: booting warm agent query()");
  const query = sdk.query({ prompt: iterable, options });
  const pending = [];
  let notify = null;
  let pumpFinished = false;
  const wakeWaiters = () => {
    const resume = notify;
    notify = null;
    if (resume) resume();
  };
  void (async () => {
    try {
      for await (const raw of query) {
        if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
          continue;
        }
        pending.push(raw);
        wakeWaiters();
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      log("daemon: agent query pump failed \\u2014 " + messageText);
    } finally {
      pumpFinished = true;
      wakeWaiters();
    }
  })();
  const waitMessage = async () => {
    while (pending.length === 0) {
      if (pumpFinished) return null;
      await new Promise((resolve) => {
        notify = resolve;
      });
      if (pending.length === 0 && pumpFinished) return null;
    }
    const message = pending.shift();
    return message ?? null;
  };
  const drainPending = () => {
    const drained = pending.slice();
    pending.length = 0;
    return drained;
  };
  const hasPending = () => pending.length > 0;
  const stopTask = async (taskId) => {
    if (typeof query.stopTask === "function") {
      await query.stopTask(taskId);
      return;
    }
    log("daemon: stopTask unavailable on SDK query handle");
  };
  const interrupt = async () => {
    if (typeof query.interrupt === "function") {
      await query.interrupt();
      return;
    }
    log("daemon: interrupt unavailable on SDK query handle");
  };
  return { push, waitMessage, drainPending, hasPending, stopTask, interrupt };
}
function callbackScriptWentStaleOnDisk() {
  if (!CALLBACK_SCRIPT_FP) return false;
  try {
    const onDisk = readFileSync6("/tmp/eva-callback-fp", "utf8").trim();
    return onDisk !== CALLBACK_SCRIPT_FP;
  } catch {
    return false;
  }
}
function attachmentExtensionForMimeType(mimeType) {
  const type = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  switch (type) {
    case "image/jpeg":
      return ".jpg";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    case "image/svg+xml":
      return ".svg";
    case "image/png":
      return ".png";
    case "text/html":
      return ".html";
    case "text/markdown":
      return ".md";
    case "text/plain":
      return ".txt";
    default:
      if (type.startsWith("image/")) return ".png";
      return ".bin";
  }
}
async function materializeTurnAttachments(turn) {
  if (turn.attachmentUrls.length === 0) return;
  const paths = [];
  for (let index = 0; index < turn.attachmentUrls.length; index++) {
    const url = turn.attachmentUrls[index];
    if (!url) continue;
    try {
      const res = await fetchWithTimeout(url, { method: "GET" });
      if (!res.ok) {
        log(\`daemon: attachment download failed status=\${res.status}\`);
        continue;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      const extension = attachmentExtensionForMimeType(
        res.headers.get("content-type") ?? ""
      );
      const path = \`/tmp/eva-attachment-\${index}\${extension}\`;
      writeFileSync9(path, bytes);
      paths.push(path);
    } catch (error) {
      log(
        \`daemon: attachment download error \${error instanceof Error ? error.message : String(error)}\`
      );
    }
  }
  if (paths.length === 0) return;
  const list = paths.map((p) => \`- \${p}\`).join("\\n");
  turn.prompt += \`

---
The user attached the following file(s). Read them with your file-reading tool before responding:
\${list}\`;
}
async function runSdkDaemon() {
  if (!CLAIM_MUTATION) {
    log("daemon: CLAIM_MUTATION env is required in sdk-daemon mode");
    process.exit(1);
  }
  if (!OPEN_SYNTHETIC_TURN_MUTATION || !COMPLETE_SYNTHETIC_TURN_MUTATION) {
    log(
      "daemon: synthetic turn mutation env vars are required in sdk-daemon mode"
    );
    process.exit(1);
  }
  const rivalPid = readDaemonPidFile();
  if (!Number.isNaN(rivalPid) && rivalPid !== process.pid && pidAlive(rivalPid)) {
    log(
      \`daemon: rival daemon pid=\${rivalPid} already owns \${DAEMON_PID_FILE} \\u2014 exiting\`
    );
    process.exit(0);
  }
  writeFileSync9(DAEMON_PID_FILE, String(process.pid));
  writeFileSync9(DAEMON_ENTITY_FILE, ENTITY_ID ?? "");
  writeFileSync9(DAEMON_OPTS_FILE, DAEMON_OPTS_SIG);
  let deposedLogged = false;
  setInterval(() => {
    const owner = readDaemonPidFile();
    if (owner === process.pid) {
      deposedLogged = false;
      return;
    }
    const ownerLabel = Number.isNaN(owner) ? "none" : String(owner);
    if (turnActive) {
      if (!deposedLogged) {
        deposedLogged = true;
        log(
          \`daemon: deposed (pidfile owner=\${ownerLabel}) \\u2014 exiting after active turn\`
        );
      }
      return;
    }
    log(\`daemon: deposed (pidfile owner=\${ownerLabel}) \\u2014 exiting\`);
    process.exit(0);
  }, FENCE_POLL_INTERVAL_MS);
  const preflightOk2 = await runPreflightHeartbeat();
  if (!preflightOk2) {
    log("daemon: preflight failed");
    process.exit(1);
  }
  startStreamingLoops();
  await ensureGithubToken();
  const sessionMode = prepareClaudeSessionState();
  const options = buildSdkOptions(sessionMode);
  const sdk = await loadSdk();
  const agentRunner = createWarmAgentRunner(sdk, options);
  currentAgentRunner = agentRunner;
  log(
    "runSdkDaemon started (entityId=" + (ENTITY_ID ?? "none") + ", mode=" + sessionMode.mode + ")"
  );
  log("daemon: warm query() live, claim watcher started");
  startTurnWatchdog();
  startClaimWatcher(agentRunner);
  try {
    await runDaemonMessagePump(agentRunner);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    log("daemon: query failed \\u2014 " + messageText);
    try {
      await callConvexWithRetry("mutation", COMPLETION_MUTATION ?? "", {
        [ENTITY_ID_FIELD ?? "sessionId"]: ENTITY_ID ?? "",
        success: false,
        result: null,
        error: "Agent SDK daemon failed: " + messageText,
        activityLog: serializeSteps(callbackState.accumulatedSteps),
        ...currentTurnArgs()
      });
    } catch {
    }
  } finally {
    if (readDaemonPidFile() === process.pid) {
      try {
        unlinkSync2(DAEMON_PID_FILE);
        unlinkSync2(DAEMON_ENTITY_FILE);
        unlinkSync2(DAEMON_OPTS_FILE);
        if (ENTITY_ID_FIELD === "sessionId") {
          const legacy = resolveLegacySessionDaemonPaths();
          try {
            unlinkSync2(legacy.pid);
          } catch {
          }
          try {
            unlinkSync2(legacy.entity);
          } catch {
          }
          try {
            unlinkSync2(legacy.opts);
          } catch {
          }
        }
      } catch {
      }
    }
    await stopStreamingLoops();
  }
  process.exit(0);
}

// callback-src/runtime/systemSkills.ts
import {
  existsSync as existsSync7,
  mkdirSync as mkdirSync6,
  readdirSync as readdirSync3,
  readFileSync as readFileSync7,
  rmSync,
  writeFileSync as writeFileSync10
} from "fs";
var SYSTEM_SKILLS_STATE_FILE = "/tmp/eva-system-skills.json";
var SYSTEM_SKILL_MARKER = "<!-- eva:system-skill -->";
var EXCLUDE_BEGIN = "# >>> eva-system-skills >>>";
var EXCLUDE_END = "# <<< eva-system-skills <<<";
var SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}\$/;
function parseSystemSkillsFile(raw) {
  const parsed = tryParseJson(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const skills = parsed.skills;
  if (!Array.isArray(skills)) return null;
  const result = [];
  for (const entry of skills) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }
    const name = entry.name;
    const stub = entry.stub;
    if (typeof name !== "string" || typeof stub !== "string") continue;
    if (!SKILL_NAME_PATTERN.test(name)) continue;
    result.push({ name, stub });
  }
  return result;
}
function renderExcludeContent(existing, names) {
  const lines = existing.replace(/\\r\\n/g, "\\n").split("\\n");
  const kept = [];
  let insideBlock = false;
  for (const line of lines) {
    if (line.trim() === EXCLUDE_BEGIN) {
      insideBlock = true;
      continue;
    }
    if (line.trim() === EXCLUDE_END) {
      insideBlock = false;
      continue;
    }
    if (!insideBlock) kept.push(line);
  }
  while (kept.length > 0 && kept[kept.length - 1]?.trim() === "") kept.pop();
  const preserved = kept.length > 0 ? \`\${kept.join("\\n")}
\` : "";
  if (names.length === 0) return preserved;
  const block = [
    EXCLUDE_BEGIN,
    ...names.map((name) => \`/.agents/skills/\${name}/\`),
    EXCLUDE_END,
    ""
  ].join("\\n");
  return \`\${preserved}\${block}\`;
}
function skillsRoot() {
  return \`\${WORK_DIR}/.agents/skills\`;
}
function isEvaStub(directoryName) {
  const skillFile = \`\${skillsRoot()}/\${directoryName}/SKILL.md\`;
  if (!existsSync7(skillFile)) return false;
  try {
    return readFileSync7(skillFile, "utf8").includes(SYSTEM_SKILL_MARKER);
  } catch {
    return false;
  }
}
function writeStub(skill) {
  const directory = \`\${skillsRoot()}/\${skill.name}\`;
  if (existsSync7(\`\${directory}/SKILL.md\`) && !isEvaStub(skill.name)) {
    log(\`[system-skills] \${skill.name} exists in the repo \\u2014 leaving it alone\`);
    return false;
  }
  mkdirSync6(directory, { recursive: true });
  writeFileSync10(\`\${directory}/SKILL.md\`, skill.stub);
  return true;
}
function pruneStaleStubs(keep) {
  const root = skillsRoot();
  if (!existsSync7(root)) return;
  for (const entry of readdirSync3(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (keep.has(entry.name)) continue;
    if (!isEvaStub(entry.name)) continue;
    try {
      rmSync(\`\${root}/\${entry.name}\`, { recursive: true, force: true });
      log(\`[system-skills] pruned \${entry.name}\`);
    } catch (err) {
      log(\`[system-skills] prune failed for \${entry.name}: \${String(err)}\`);
    }
  }
}
function updateGitExclude(names) {
  const gitDir = \`\${WORK_DIR}/.git\`;
  if (!existsSync7(gitDir)) return;
  const infoDir = \`\${gitDir}/info\`;
  const excludeFile = \`\${infoDir}/exclude\`;
  const existing = existsSync7(excludeFile) ? readFileSync7(excludeFile, "utf8") : "";
  const next = renderExcludeContent(existing, names);
  if (next === existing) return;
  mkdirSync6(infoDir, { recursive: true });
  writeFileSync10(excludeFile, next);
}
function materializeSystemSkills() {
  try {
    if (!existsSync7(SYSTEM_SKILLS_STATE_FILE)) return;
    if (!existsSync7(WORK_DIR)) {
      log("[system-skills] no checkout yet \\u2014 skipping");
      return;
    }
    const skills = parseSystemSkillsFile(
      readFileSync7(SYSTEM_SKILLS_STATE_FILE, "utf8")
    );
    if (skills === null) {
      log("[system-skills] state file unreadable \\u2014 skipping");
      return;
    }
    const written = [];
    for (const skill of skills) {
      try {
        if (writeStub(skill)) written.push(skill.name);
      } catch (err) {
        log(\`[system-skills] write failed for \${skill.name}: \${String(err)}\`);
      }
    }
    pruneStaleStubs(new Set(written));
    updateGitExclude(written);
    log(
      \`[system-skills] materialized \${written.length}/\${skills.length}\` + (written.length > 0 ? \` (\${written.join(", ")})\` : "")
    );
  } catch (err) {
    log(\`[system-skills] materialize failed: \${String(err)}\`);
  }
}

// callback-src/providers/cursorSdk.ts
import { execSync as execSync2 } from "child_process";
import { existsSync as existsSync8, mkdirSync as mkdirSync7, readFileSync as readFileSync8 } from "fs";
var SDK_PACKAGE2 = "@cursor/sdk";
var SDK_VERSION2 = "1.0.26";
var SDK_ENTRY_RELPATH = "/dist/esm/index.js";
var MCP_CONFIG_PATH2 = "/tmp/eva-mcp.json";
var SDK_LOCAL_PREFIX2 = "/home/eva/.eva-agent-sdk";
async function loadCursorSdk() {
  const globalEntry = globalNpmRoot() + "/" + SDK_PACKAGE2 + SDK_ENTRY_RELPATH;
  const localEntry = SDK_LOCAL_PREFIX2 + "/node_modules/" + SDK_PACKAGE2 + SDK_ENTRY_RELPATH;
  if (existsSync8(globalEntry)) {
    const mod2 = await import(globalEntry);
    return mod2;
  }
  if (!existsSync8(localEntry)) {
    log(
      "cursor sdk not found in sandbox; installing " + SDK_PACKAGE2 + "@" + SDK_VERSION2 + " to " + SDK_LOCAL_PREFIX2 + " (one-time)"
    );
    execSync2(
      "mkdir -p " + SDK_LOCAL_PREFIX2 + " && npm install --prefix " + SDK_LOCAL_PREFIX2 + " " + SDK_PACKAGE2 + "@" + SDK_VERSION2,
      { encoding: "utf8", timeout: 18e4 }
    );
  }
  const mod = await import(localEntry);
  return mod;
}
function parseCursorSdkMcpServers(raw) {
  const servers = {};
  const parsed = tryParseJson(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !parsed.mcpServers || typeof parsed.mcpServers !== "object" || Array.isArray(parsed.mcpServers)) {
    return servers;
  }
  for (const [name, server] of Object.entries(parsed.mcpServers)) {
    if (!server || typeof server !== "object" || Array.isArray(server) || typeof server.url !== "string" || !server.url.trim()) {
      continue;
    }
    const entry = { type: "http", url: server.url };
    if (server.headers && typeof server.headers === "object" && !Array.isArray(server.headers)) {
      const headers = {};
      for (const [headerName, headerValue] of Object.entries(server.headers)) {
        if (typeof headerValue === "string") {
          headers[headerName] = headerValue;
        }
      }
      if (Object.keys(headers).length > 0) entry.headers = headers;
    }
    servers[name] = entry;
  }
  return servers;
}
function readCursorSdkMcpServers() {
  if (!existsSync8(MCP_CONFIG_PATH2)) return {};
  try {
    return parseCursorSdkMcpServers(readFileSync8(MCP_CONFIG_PATH2, "utf8"));
  } catch {
    return {};
  }
}
function readPromptText2() {
  return readFileSync8("/tmp/design-prompt.txt", "utf8");
}
async function resolveCursorModelSelection(sdk) {
  const base = normalizedCursorModel;
  const level = cursorReasoningLevel;
  if (!level) return { id: base };
  try {
    const list = sdk.Cursor?.models?.list;
    if (!list) return { id: base };
    const models = await list();
    const model = Array.isArray(models) ? models.find(
      (entry) => entry && typeof entry === "object" && entry.id === base
    ) : void 0;
    if (!model) {
      log(
        "resolveCursorModelSelection: model " + base + " not in Cursor.models.list \\u2014 sending base id"
      );
      return { id: base };
    }
    for (const definition of model.parameters ?? []) {
      if (!definition || typeof definition.id !== "string") continue;
      const values = Array.isArray(definition.values) ? definition.values : [];
      if (values.some((entry) => entry && entry.value === level)) {
        log(
          "resolveCursorModelSelection: " + base + " reasoning level " + level + " via parameter " + definition.id
        );
        return { id: base, params: [{ id: definition.id, value: level }] };
      }
    }
    for (const variant of model.variants ?? []) {
      const params = Array.isArray(variant?.params) ? variant.params : [];
      if (params.some((param) => param && param.value === level)) {
        log(
          "resolveCursorModelSelection: " + base + " reasoning level " + level + " via variant params"
        );
        return { id: base, params };
      }
    }
    log(
      "resolveCursorModelSelection: " + base + " exposes no parameter accepting '" + level + "' \\u2014 sending base id"
    );
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    log(
      "resolveCursorModelSelection: model list failed \\u2014 sending base id (" + messageText + ")"
    );
  }
  return { id: base };
}
function errorCode(error) {
  const withCode = error;
  return typeof withCode.code === "string" ? withCode.code : "";
}
function isAgentNotFound(error) {
  return errorCode(error) === "agent_not_found" || error.message.includes("agent_not_found");
}
var ZERO_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0
};
function readNum(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function readUsageTokens(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const usage = value;
  return {
    inputTokens: readNum(usage.inputTokens),
    outputTokens: readNum(usage.outputTokens),
    cacheReadTokens: readNum(usage.cacheReadTokens),
    cacheWriteTokens: readNum(usage.cacheWriteTokens)
  };
}
async function runCursorSdkAttempt(sessionMode) {
  resetAttemptState();
  callbackState.activeAttemptStartedAt = Date.now();
  updateThinkingStep(
    "Starting Cursor agent...",
    sessionMode.mode === "resume" ? "Restoring saved context..." : "Creating Cursor agent..."
  );
  log(
    "runCursorSdkAttempt started (mode=" + sessionMode.mode + ", sessionId=" + (sessionMode.sessionId || "none") + ")"
  );
  let attemptOutput = "";
  let lastMessageAt = Date.now();
  let timedOutForNoOutput = false;
  let timedOutForMaxRuntime = false;
  let sawResult = false;
  let resultIsError = false;
  let attemptErrorMessage = "";
  let lastStreamUsage = null;
  let activeRun = null;
  const sdk = await loadCursorSdk();
  mkdirSync7(CURSOR_SDK_STORE_DIR, { recursive: true });
  const store4 = new sdk.JsonlLocalAgentStore(CURSOR_SDK_STORE_DIR);
  const mcpServers = readCursorSdkMcpServers();
  const options = {
    apiKey: (process.env.CURSOR_API_KEY || "").trim(),
    model: await resolveCursorModelSelection(sdk),
    local: { cwd: WORK_DIR, store: store4 },
    ...Object.keys(mcpServers).length > 0 ? { mcpServers } : {}
  };
  const persistAgentId = (agentId) => {
    callbackState.activeCursorSessionId = agentId;
    writeCursorSessionState();
    syncCursorStateToPersist();
  };
  const createFreshAgent = async () => {
    const created = await sdk.Agent.create(options);
    persistAgentId(created.agentId);
    return created;
  };
  let resumedExistingAgent = false;
  let agent;
  if (sessionMode.mode === "resume" && sessionMode.sessionId) {
    try {
      agent = await sdk.Agent.resume(sessionMode.sessionId, options);
      resumedExistingAgent = true;
      persistAgentId(agent.agentId);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      log(
        "runCursorSdkAttempt: resume failed \\u2014 starting a fresh agent (" + messageText + ")"
      );
      appendToRawLogFile("[sdk-retry] resume failed: " + messageText + "\\n");
      agent = await createFreshAgent();
    }
  } else {
    agent = await createFreshAgent();
  }
  const promptText = readPromptText2();
  const combinedPrompt = SYSTEM_PROMPT ? SYSTEM_PROMPT + "\\n\\n" + promptText : promptText;
  const cancelRun = () => {
    if (!activeRun) return;
    activeRun.cancel().catch(() => {
    });
  };
  const healthTimer = setInterval(() => {
    const now = Date.now();
    if (now - callbackState.activeAttemptStartedAt > MAX_TOTAL_RUNTIME_MS) {
      timedOutForMaxRuntime = true;
      log("runCursorSdkAttempt: max runtime exceeded \\u2014 cancelling run");
      cancelRun();
      return;
    }
    if (!sawResult && now - lastMessageAt > NO_OUTPUT_TIMEOUT_MS * 5) {
      timedOutForNoOutput = true;
      log("runCursorSdkAttempt: no SDK events \\u2014 cancelling run");
      cancelRun();
    }
  }, NO_OUTPUT_CHECK_INTERVAL_MS);
  const pushLine = (line) => {
    appendToRawLogFile(line);
    attemptOutput = trimBufferHead(attemptOutput + line);
    appendToRawOutput(line);
    processRealtimeStdoutChunk(line);
  };
  const runTurn = async (activeAgent) => {
    const run = await activeAgent.send(combinedPrompt, {
      local: { force: true }
    });
    activeRun = run;
    for await (const message of run.stream()) {
      lastMessageAt = Date.now();
      pushLine(JSON.stringify(message) + "\\n");
      if (message.type === "usage") {
        lastStreamUsage = readUsageTokens(message.usage) ?? lastStreamUsage;
      }
      if (timedOutForMaxRuntime || timedOutForNoOutput) break;
    }
    const result = await run.wait();
    const usage = readUsageTokens(result.usage) ?? lastStreamUsage ?? ZERO_USAGE;
    const isError = result.status !== "finished";
    const resultText = typeof result.result === "string" && result.result ? result.result : result.error && typeof result.error.message === "string" ? result.error.message : "";
    const syntheticResult = {
      type: "result",
      is_error: isError,
      result: resultText,
      duration_ms: readNum(result.durationMs),
      usage: {
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cache_read_input_tokens: usage.cacheReadTokens,
        cache_creation_input_tokens: usage.cacheWriteTokens
      }
    };
    pushLine(JSON.stringify(syntheticResult) + "\\n");
    sawResult = true;
    resultIsError = isError;
  };
  try {
    try {
      await runTurn(agent);
    } catch (error) {
      if (resumedExistingAgent && error instanceof Error && isAgentNotFound(error)) {
        log(
          "runCursorSdkAttempt: resumed agent unusable \\u2014 retrying as a fresh agent"
        );
        appendToRawLogFile("[sdk-retry] " + error.message + "\\n");
        sawResult = false;
        resultIsError = false;
        try {
          agent.close();
        } catch {
        }
        agent = await createFreshAgent();
        await runTurn(agent);
      } else {
        throw error;
      }
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    attemptErrorMessage = messageText;
    log("runCursorSdkAttempt: run failed \\u2014 " + messageText);
    appendToRawLogFile("[sdk-error] " + messageText + "\\n");
    callbackState.stderrOutput = trimBufferHead(callbackState.stderrOutput + messageText + "\\n");
  } finally {
    clearInterval(healthTimer);
    try {
      agent.close();
    } catch {
    }
  }
  const code = sawResult && !resultIsError && !timedOutForMaxRuntime && !timedOutForNoOutput ? 0 : 1;
  log(
    "runCursorSdkAttempt finished in " + String(Date.now() - callbackState.activeAttemptStartedAt) + "ms (code=" + code + ", sawResult=" + sawResult + ", resultIsError=" + resultIsError + ", timedOutForNoOutput=" + timedOutForNoOutput + ", timedOutForMaxRuntime=" + timedOutForMaxRuntime + ", outputBytes=" + attemptOutput.length + (attemptErrorMessage ? ", runError=" + attemptErrorMessage : "") + ")"
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
    toolStallErrorMessage: ""
  };
}

// callback-src/providers/attempts.ts
function prepareProviderSessionState() {
  if (PROVIDER === "codex") return prepareCodexSessionState();
  if (PROVIDER === "opencode") return prepareOpencodeSessionState();
  if (PROVIDER === "cursor") return prepareCursorSessionState();
  return prepareClaudeSessionState();
}
function syncProviderStateToPersist(reason) {
  if (PROVIDER === "codex") {
    syncCodexStateToPersist();
    return;
  }
  if (PROVIDER === "opencode") {
    syncOpencodeStateToPersist();
    return;
  }
  if (PROVIDER === "cursor") {
    syncCursorStateToPersist();
    return;
  }
  syncClaudeStateToPersist(reason);
}
async function runClaudeAttempt(sessionMode) {
  return await runClaudeSdkAttempt(sessionMode);
}
async function runCodexAttempt(sessionMode) {
  const sessionArg = sessionMode.mode === "resume" && sessionMode.sessionId ? " resume " + JSON.stringify(sessionMode.sessionId) : "";
  const cmd = codexPromptCmd + " | " + codexExecBaseCmd + sessionArg + " -";
  return await runCliAttempt({
    cmd,
    env: { ...process.env, CODEX_HOME: CODEX_RUNTIME_HOME_DIR },
    processLabel: "codex",
    attemptLabel: "runCodexAttempt",
    startupStep: {
      label: "Starting Codex CLI...",
      detail: sessionMode.mode === "resume" ? "Restoring saved context..." : "Launching Codex process..."
    },
    onStdoutText: codexAdapter.onStdoutText
  });
}
async function runOpencodeAttempt(sessionMode) {
  const sessionArg = sessionMode.mode === "resume" && sessionMode.sessionId ? " -s " + JSON.stringify(sessionMode.sessionId) : "";
  const cmd = opencodePromptCmd + " | " + opencodeExecBaseCmd + sessionArg;
  return await runCliAttempt({
    cmd,
    env: { ...process.env },
    processLabel: "opencode",
    attemptLabel: "runOpencodeAttempt",
    startupStep: {
      label: "Starting Opencode CLI...",
      detail: sessionMode.mode === "resume" ? "Restoring saved context..." : "Launching Opencode process..."
    }
  });
}
async function runCursorAttempt(sessionMode) {
  if (!process.env.CURSOR_API_KEY?.trim()) {
    throw new Error(
      "CURSOR_API_KEY is missing in the sandbox environment \\u2014 the Cursor SDK cannot authenticate"
    );
  }
  return await runCursorSdkAttempt(sessionMode);
}
async function runProviderAttempt(sessionMode) {
  if (PROVIDER === "codex") return await runCodexAttempt(sessionMode);
  if (PROVIDER === "opencode") return await runOpencodeAttempt(sessionMode);
  if (PROVIDER === "cursor") return await runCursorAttempt(sessionMode);
  return await runClaudeAttempt(sessionMode);
}

// callback-src/index.ts
process.on("exit", (code) => {
  writeDoneFile("unexpected-exit", {
    exitCode: typeof code === "number" ? code : null
  });
  try {
    if (callbackState.rawLogStream) callbackState.rawLogStream.end();
  } catch {
  }
});
try {
  unlinkSync3(READY_FILE);
} catch {
}
try {
  writeFileSync11(PID_FILE, String(process.pid));
} catch {
}
try {
  writeFileSync11("/proc/self/oom_score_adj", "-600");
} catch {
}
callbackState.lastStepType = "thinking";
materializeSystemSkills();
if (PROVIDER === "claude" && CLAIM_MUTATION) {
  await runSdkDaemon();
}
var preflightOk = await runPreflightHeartbeat();
if (!preflightOk) {
  writeDoneFile("preflight-failed");
  process.exit(1);
}
startStreamingLoops();
for (const d of [WORK_DIR + "/screenshots", WORK_DIR + "/recordings"]) {
  if (existsSync9(d)) {
    for (const f of readdirSync4(d)) {
      try {
        unlinkSync3(d + "/" + f);
      } catch {
      }
    }
  } else {
    try {
      mkdirSync8(d, { recursive: true });
    } catch {
    }
  }
}
if (REPO_ID && CONVEX_URL && CONVEX_TOKEN) {
  try {
    const res = await fetchWithTimeout(CONVEX_URL + "/api/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + CONVEX_TOKEN
      },
      body: JSON.stringify({
        path: "github:getInstallationTokenAction",
        args: { repoId: REPO_ID },
        format: "json"
      })
    });
    if (res.ok) {
      const data = await readResponseJson(res);
      if (data && typeof data === "object" && !Array.isArray(data) && data.value && typeof data.value === "object" && !Array.isArray(data.value) && typeof data.value.token === "string") {
        process.env.GITHUB_TOKEN = data.value.token;
        process.env.GH_TOKEN = data.value.token;
      }
    }
  } catch {
  }
}
log(
  "entityId=" + ENTITY_ID + " provider=" + PROVIDER + " model=" + MODEL + " tools=" + ALLOWED_TOOLS + " sessionId=" + (process.env.CLAUDE_SESSION_ID || "none") + " mcp=" + (hasMcpConfig ? "yes" : "no")
);
try {
  const taskCommitBaselineHead = REQUIRE_TASK_COMMIT ? readGitHeadSha() : "";
  if (REQUIRE_TASK_COMMIT) {
    log(
      "task commit gate enabled baselineHead=" + (taskCommitBaselineHead || "unavailable")
    );
  }
  const initialSessionMode = prepareProviderSessionState();
  const firstAttempt = await runProviderAttempt(initialSessionMode);
  await flushStreaming();
  let finalCode = firstAttempt.code;
  let finalTimedOutForNoOutput = Boolean(firstAttempt.timedOutForNoOutput);
  let finalTimedOutForMaxRuntime = Boolean(firstAttempt.timedOutForMaxRuntime);
  let finalTimedOutForFirstEvent = Boolean(firstAttempt.timedOutForFirstEvent);
  let finalTimedOutForFirstAssistant = Boolean(
    firstAttempt.timedOutForFirstAssistant
  );
  let finalTimedOutAfterFirstText = Boolean(
    firstAttempt.timedOutAfterFirstText
  );
  let finalTimedOutForZombie = Boolean(firstAttempt.timedOutForZombie);
  const finalTerminatedBySignal = firstAttempt.terminatedBySignal;
  const finalToolStallErrorMessage = firstAttempt.toolStallErrorMessage || "";
  let finalResultEvent = extractResultEvent(firstAttempt.output);
  log(
    "firstAttempt result: code=" + firstAttempt.code + " isError=" + Boolean(finalResultEvent?.isError) + " hasToolActivity=" + hasToolActivity()
  );
  if (!callbackState.resultEventSeen) {
    syncProviderStateToPersist("post-attempt");
  } else {
    log("skipping post-attempt sync because result-event sync already ran");
  }
  if (await setFinalizingState()) {
    process.exit(0);
  }
  const agentWasInterrupted = finalTerminatedBySignal || finalCode === 137 || finalCode === 143;
  const attemptEndedDueToTimeout = finalTimedOutAfterFirstText || finalTimedOutForNoOutput || finalTimedOutForMaxRuntime || finalTimedOutForFirstEvent || finalTimedOutForFirstAssistant || finalTimedOutForZombie || Boolean(finalToolStallErrorMessage);
  const runSucceededWithResult = finalResultEvent != null && !finalResultEvent.isError && !agentWasInterrupted;
  let errorValue = null;
  if (finalResultEvent?.isError) {
    errorValue = finalResultEvent.result;
  } else if (!runSucceededWithResult && finalCode !== 0 || attemptEndedDueToTimeout && !runSucceededWithResult) {
    errorValue = appendDiagnosticTail(
      buildErrorMessage(
        finalCode,
        callbackState.fatalHeartbeatErrorMessage,
        finalToolStallErrorMessage,
        finalTimedOutForMaxRuntime,
        finalTimedOutForNoOutput,
        finalTimedOutForFirstEvent,
        finalTimedOutForFirstAssistant,
        finalTimedOutAfterFirstText,
        finalTimedOutForZombie
      )
    );
  }
  const finalResultText = (finalResultEvent?.result ?? "").trim();
  if (finalResultText) {
    let lastIdx = callbackState.accumulatedSteps.length - 1;
    while (lastIdx >= 0 && callbackState.accumulatedSteps[lastIdx].type === "thinking") {
      lastIdx--;
    }
    const candidate = lastIdx >= 0 ? callbackState.accumulatedSteps[lastIdx] : void 0;
    if (candidate && candidate.type === "response") {
      const detail = (candidate.detail ?? "").trim();
      if (detail && (finalResultText === detail || finalResultText.startsWith(detail) || detail.startsWith(finalResultText))) {
        callbackState.accumulatedSteps.splice(lastIdx, 1);
      }
    }
  }
  for (const step of callbackState.accumulatedSteps) step.status = "complete";
  const activityLog = serializeSteps(callbackState.accumulatedSteps);
  let completionSuccess = agentWasInterrupted ? false : finalResultEvent ? !finalResultEvent.isError : finalCode === 0;
  if (attemptEndedDueToTimeout && !runSucceededWithResult) {
    completionSuccess = false;
  }
  if (completionSuccess && REQUIRE_TASK_COMMIT) {
    if (!hasNewTaskCommitSince(taskCommitBaselineHead)) {
      completionSuccess = false;
      const commitGateMessage = "Agent finished without creating a new git commit. Edit the required files, run git add and git commit locally, then try again.";
      errorValue = errorValue ? errorValue + "\\n\\n" + commitGateMessage : commitGateMessage;
      log(
        "completion: rejected \\u2014 no new commit (baseline=" + (taskCommitBaselineHead || "none") + " current=" + (readGitHeadSha() || "none") + ")"
      );
    }
  }
  log(
    "completion: success=" + completionSuccess + " code=" + finalCode + " hasResult=" + Boolean(finalResultEvent) + " error=" + (errorValue ? errorValue.slice(0, 200) : "none") + " steps=" + callbackState.accumulatedSteps.length
  );
  const completionArgs = {
    [ENTITY_ID_FIELD ?? "entityId"]: ENTITY_ID ?? "",
    success: completionSuccess,
    result: finalResultEvent?.result ?? callbackState.rawOutput,
    error: errorValue,
    activityLog
  };
  if (RUN_ID) completionArgs.runId = RUN_ID;
  const turnId = getCurrentTurnId();
  if (turnId) completionArgs.turnId = turnId;
  if (finalResultEvent?.rawResultEvent) {
    completionArgs.rawResultEvent = finalResultEvent.rawResultEvent;
  }
  if (callbackState.pendingQuestionData) {
    completionArgs.pendingQuestion = callbackState.pendingQuestionData;
  }
  persistTurnWork();
  try {
    await deliverCompletionWithMedia(completionArgs);
    syncProviderStateToPersist("completion");
    await stopStreamingLoops();
    writeDoneFile(completionSuccess ? "success" : "error", {
      exitCode: finalCode,
      error: errorValue
    });
    process.exit(0);
  } catch (e) {
    console.error("Failed to send completion:", e);
    syncProviderStateToPersist("completion-error");
    await stopStreamingLoops();
    writeDoneFile("completion-error", {
      exitCode: finalCode,
      error: e instanceof Error ? e.message : String(e)
    });
    process.exit(1);
  }
} catch (err) {
  syncProviderStateToPersist("fatal-error");
  await stopStreamingLoops();
  writeDoneFile("fatal-error", {
    error: err instanceof Error ? err.message : String(err)
  });
  const errorArgs = {
    [ENTITY_ID_FIELD ?? "entityId"]: ENTITY_ID ?? "",
    success: false,
    result: null,
    error: appendDiagnosticTail(
      err instanceof Error ? err.message : "Failed to run " + (PROVIDER === "codex" ? "Codex" : PROVIDER === "opencode" ? "Opencode" : PROVIDER === "cursor" ? "Cursor" : "Claude") + " CLI"
    ),
    activityLog: serializeSteps(callbackState.accumulatedSteps)
  };
  if (RUN_ID) errorArgs.runId = RUN_ID;
  const turnId = getCurrentTurnId();
  if (turnId) errorArgs.turnId = turnId;
  try {
    await callConvexWithRetry("mutation", COMPLETION_MUTATION ?? "", errorArgs);
  } catch {
  }
  process.exit(1);
}
`.trim();
