"use node";

export const CALLBACK_SCRIPT = `// callback-src/index.ts
import { mkdirSync as mkdirSync10, unlinkSync as unlinkSync4, writeFileSync as writeFileSync14 } from "fs";

// callback-src/config.ts
import { existsSync } from "fs";

// callback-src/evaMcp.ts
function buildEvaMcpServers({
  auth,
  baseUrl
}) {
  if (!auth || !baseUrl) return {};
  return {
    eva: {
      type: "http",
      url: \`\${baseUrl}/mcp\`,
      headers: { Authorization: \`Bearer \${auth}\` }
    }
  };
}
function consumeEvaMcpEnvironment(env) {
  const auth = env.EVA_MCP_AUTH;
  const baseUrl = env.EVA_MCP_BASE_URL;
  const servers = buildEvaMcpServers({ auth, baseUrl });
  delete env.EVA_MCP_AUTH;
  delete env.EVA_MCP_BASE_URL;
  return {
    servers,
    workerHandoffEnv: auth && baseUrl ? { EVA_MCP_AUTH: auth, EVA_MCP_BASE_URL: baseUrl } : {}
  };
}
var consumed = consumeEvaMcpEnvironment(process.env);
var evaMcpServers = consumed.servers;
var evaMcpWorkerHandoffEnv = consumed.workerHandoffEnv;
var hasEvaMcpConfig = Object.keys(evaMcpServers).length > 0;

// ../shared/src/modelPricing.ts
var ANTHROPIC_PRICING_URL = "https://platform.claude.com/docs/en/about-claude/pricing";
var ANTHROPIC_PRICING_AS_OF = "2026-09-01";
function anthropicRow(inputPerMillion, cacheReadPerMillion, cacheWritePerMillion, outputPerMillion) {
  return {
    inputPerMillion,
    cacheReadPerMillion,
    cacheWritePerMillion,
    outputPerMillion,
    source: ANTHROPIC_PRICING_URL,
    asOf: ANTHROPIC_PRICING_AS_OF
  };
}
var CLAUDE_PRICING_PER_MILLION = {
  "claude-fable-5-1": anthropicRow(10, 0.25, 12.5, 50),
  "claude-mythos-5-1": anthropicRow(10, 0.25, 12.5, 50),
  "claude-fable-5": anthropicRow(10, 1, 12.5, 50),
  "claude-mythos-5": anthropicRow(10, 1, 12.5, 50),
  "claude-opus-5": anthropicRow(5, 0.5, 6.25, 25),
  "claude-opus-4-8": anthropicRow(5, 0.5, 6.25, 25),
  "claude-opus-4-7": anthropicRow(5, 0.5, 6.25, 25),
  "claude-opus-4-6": anthropicRow(5, 0.5, 6.25, 25),
  "claude-opus-4-5": anthropicRow(5, 0.5, 6.25, 25),
  "claude-sonnet-5": anthropicRow(2, 0.2, 2.5, 10),
  "claude-sonnet-4-6": anthropicRow(3, 0.3, 3.75, 15),
  "claude-sonnet-4-5": anthropicRow(3, 0.3, 3.75, 15),
  "claude-haiku-4-5": anthropicRow(1, 0.1, 1.25, 5)
};
var CODEX_PRICING_PER_MILLION = {
  // OpenAI API list prices (per 1M tokens).
  // GPT-6 Astra — third-party report of the OpenAI pricing page, read
  // 2026-09-11; verify against https://developers.openai.com/api/docs/pricing.
  "gpt-6-astra": { input: 10, cached: 1, output: 50 },
  "gpt-5.6-sol": { input: 5, cached: 0.5, output: 30 },
  "gpt-5.6-terra": { input: 2, cached: 0.2, output: 12 },
  "gpt-5.6-luna": { input: 0.2, cached: 0.02, output: 1.2 },
  // Legacy — kept so in-flight sandboxes still cost-account correctly.
  "gpt-5.5": { input: 5, cached: 0.5, output: 30 },
  "gpt-5.5-pro": { input: 30, cached: 30, output: 180 },
  "gpt-5.4": { input: 1.25, cached: 0.125, output: 10 },
  "gpt-5.4-mini": { input: 0.25, cached: 0.025, output: 2 },
  "gpt-5.3-codex": { input: 1.25, cached: 0.125, output: 10 },
  "gpt-5.2-codex": { input: 1.25, cached: 0.125, output: 10 },
  "gpt-5-codex": { input: 1.25, cached: 0.125, output: 10 }
};
var CLAUDE_KEYS_BY_LENGTH = Object.keys(CLAUDE_PRICING_PER_MILLION).sort(
  (a, b) => b.length - a.length
);

// callback-src/config.ts
var CONVEX_URL = process.env.CONVEX_URL;
var CONVEX_SITE_URL = process.env.CONVEX_SITE_URL || CONVEX_URL;
var CONVEX_TOKEN = process.env.CONVEX_TOKEN;
var STREAMING_HMAC = process.env.STREAMING_HMAC || "";
var HARNESS_CATALOG_TOKEN = process.env.HARNESS_CATALOG_TOKEN || "";
var HARNESS_CATALOG_SANDBOX_ID = process.env.HARNESS_CATALOG_SANDBOX_ID || "";
var ENTITY_ID = process.env.ENTITY_ID;
var STREAMING_ENTITY_ID = process.env.STREAMING_ENTITY_ID || ENTITY_ID;
var RUN_ID = process.env.RUN_ID || null;
var TURN_ID = process.env.TURN_ID || null;
var parsedTurnLeaseGeneration = Number(process.env.TURN_LEASE_GENERATION);
var TURN_LEASE_GENERATION = Number.isSafeInteger(parsedTurnLeaseGeneration) && parsedTurnLeaseGeneration > 0 ? parsedTurnLeaseGeneration : null;
var ENTITY_ID_FIELD = process.env.ENTITY_ID_FIELD;
var ROOT_DIRECTORY = process.env.ROOT_DIRECTORY || "";
var COMPLETION_MUTATION = process.env.COMPLETION_MUTATION;
var CLAIM_MUTATION = process.env.CLAIM_MUTATION;
var OPEN_SYNTHETIC_TURN_MUTATION = process.env.OPEN_SYNTHETIC_TURN_MUTATION;
var COMPLETE_SYNTHETIC_TURN_MUTATION = process.env.COMPLETE_SYNTHETIC_TURN_MUTATION;
var UPDATE_BACKGROUND_AGENTS_MUTATION = process.env.UPDATE_BACKGROUND_AGENTS_MUTATION;
var REQUIRE_TASK_COMMIT = process.env.REQUIRE_TASK_COMMIT === "true";
var PROVIDER = process.env.AI_PROVIDER || "claude";
var MODEL = process.env.AI_MODEL || process.env.CLAUDE_MODEL || "claude:sonnet";
var ALLOWED_TOOLS = process.env.ALLOWED_TOOLS || "Read,Glob,Grep";
var NO_WRITES = process.env.EVA_NO_WRITES === "1";
var BLOCKING_QUESTIONS_ENABLED = process.env.ENTITY_ID_FIELD === "sessionId";
var CALLBACK_SCRIPT_FP = process.env.CALLBACK_SCRIPT_FP || "";
var DAEMON_OPTS_SIG = process.env.EVA_DAEMON_OPTS || "";
var CURSOR_TURN_WORKER_PROMPT_FILE = process.env.EVA_CURSOR_TURN_WORKER_PROMPT_FILE || "";
var CURSOR_TURN_WORKER_LIFECYCLE = process.env.EVA_CURSOR_TURN_WORKER_LIFECYCLE || "";
var CURSOR_TURN_WORKER_TURN_ID = process.env.EVA_CURSOR_TURN_WORKER_TURN_ID || "";
var parsedCursorWorkerLeaseGeneration = Number(
  process.env.EVA_CURSOR_TURN_WORKER_LEASE_GENERATION
);
var CURSOR_TURN_WORKER_LEASE_GENERATION = Number.isSafeInteger(
  parsedCursorWorkerLeaseGeneration
) ? parsedCursorWorkerLeaseGeneration : 0;
var IS_CURSOR_TURN_WORKER = CURSOR_TURN_WORKER_PROMPT_FILE.length > 0;
var SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "";
var WORK_DIR = existsSync("/tmp/repo") ? "/tmp/repo" : existsSync("/workspace/repo") ? "/workspace/repo" : "/tmp/repo";
var NO_OUTPUT_TIMEOUT_MS = Number(
  process.env.CLAUDE_NO_OUTPUT_TIMEOUT_MS || "60000"
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
var READY_FILE = "/tmp/run-design.ready";
var RAW_LOG_FILE = "/tmp/run-design.raw.jsonl";
var DONE_FILE = "/tmp/run-design.done";
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
var OPENCODE_SERVER_PORT = Number(
  process.env.OPENCODE_SERVER_PORT || "4096"
);
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
var PROVIDER_ACCOUNT_ID = process.env.PROVIDER_ACCOUNT_ID || "";
var REASONING_EFFORT = process.env.AI_REASONING_EFFORT || "";
var AI_THINKING_ENABLED = process.env.AI_THINKING_ENABLED || "";
var AI_CONTEXT_1M = process.env.AI_CONTEXT_1M || "";
var AI_FAST_MODE = process.env.AI_FAST_MODE || "";
var CLAUDE_EFFORT_LEVELS = /* @__PURE__ */ new Set(["low", "medium", "high", "xhigh", "max"]);
var claudeEffort = PROVIDER === "claude" && CLAUDE_EFFORT_LEVELS.has(REASONING_EFFORT) ? REASONING_EFFORT : "";
var CODEX_REASONING_EFFORT = {
  // GPT-5.6 Sol/Terra/Luna: none through \`max\`. GPT-6 Astra accepts
  // low through \`max\` — the picker never offers "off" for it.
  off: "none",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max"
};
var codexReasoningEffort = PROVIDER === "codex" ? CODEX_REASONING_EFFORT[REASONING_EFFORT] ?? "" : "";
var codexFastMode = PROVIDER === "codex" && AI_FAST_MODE === "1";
var cursorFastMode = PROVIDER === "cursor" && AI_FAST_MODE === "1";
var cursorUse1mContext = PROVIDER === "cursor" && AI_CONTEXT_1M === "1";
var claudeThinkingDisabled = AI_THINKING_ENABLED === "0" || PROVIDER === "claude" && REASONING_EFFORT === "off";
function buildSettingsJson() {
  const settings = {
    attribution: { commit: "", pr: "" }
  };
  if (claudeThinkingDisabled) {
    settings.alwaysThinkingEnabled = false;
  }
  return JSON.stringify(settings);
}
var settingsJson = buildSettingsJson();
var hasMcpConfig = hasEvaMcpConfig;
var claudeModelBase = MODEL.startsWith("claude:") ? MODEL.slice("claude:".length) : MODEL;
var normalizedClaudeModel = PROVIDER === "claude" && AI_CONTEXT_1M === "1" ? \`\${claudeModelBase}[1m]\` : claudeModelBase;
var normalizedCodexModel = MODEL.startsWith("codex:") ? MODEL.slice("codex:".length) : MODEL;
var normalizedOpencodeModel = MODEL.startsWith("opencode:") ? MODEL.slice("opencode:".length) : MODEL;
var CURSOR_REASONING_LEVELS = ["xhigh", "medium", "low", "high"];
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
  xhigh: "xhigh",
  max: "high"
};
var cursorReasoningLevel = PROVIDER === "cursor" && REASONING_EFFORT in CURSOR_REASONING_EFFORT ? CURSOR_REASONING_EFFORT[REASONING_EFFORT] : cursorModelParts.level;
var opencodeCommand = existsSync(OPENCODE_BIN_PATH) ? OPENCODE_BIN_PATH : "opencode";
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
var completedLabels = {
  "Preparing Claude session...": "Prepared Claude session",
  "Preparing Codex session...": "Prepared Codex session",
  "Preparing Opencode session...": "Prepared Opencode session",
  "Preparing Cursor session...": "Prepared Cursor session",
  "Starting Claude CLI...": "Started Claude CLI",
  "Starting Codex SDK...": "Started Codex SDK",
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
import { unlinkSync, writeFileSync as writeFileSync9, readFileSync as readFileSync6, readdirSync as readdirSync3 } from "fs";
import { homedir } from "os";

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
  const path3 = value.path;
  const step = {
    type,
    label,
    detail: typeof detail === "string" ? detail : void 0,
    path: typeof path3 === "string" ? path3 : void 0,
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
  transientThinkingStep: null,
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
  fatalHeartbeatErrorMessage: "",
  consecutiveHeartbeatFailures: 0,
  heartbeatFailureStreakStartedAt: 0,
  inFlightToolUses: 0,
  codexToolItemIds: /* @__PURE__ */ new Set(),
  cursorKnownToolIds: /* @__PURE__ */ new Set(),
  cursorTerminalToolIds: /* @__PURE__ */ new Set(),
  todoState: [],
  awaitingQuestionAnswer: false,
  usageLimitSnapshot: null,
  lastReportedUsageLimits: "",
  lastReportedUsageLimitsAt: 0,
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
function resetAttemptState() {
  callbackState.transientThinkingStep = null;
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
var turnOwnership = TURN_ID !== null && TURN_LEASE_GENERATION !== null ? {
  status: "owned",
  owner: "provider",
  turnLease: { turnId: TURN_ID, leaseGeneration: TURN_LEASE_GENERATION }
} : { status: "idle" };
var terminalReason = null;
function getTurnOwnership() {
  return turnOwnership;
}
function beginTurnOwnership(owner, turnLease) {
  turnOwnership = { status: "owned", owner, turnLease };
  terminalReason = null;
}
function endTurnOwnership() {
  turnOwnership = { status: "idle" };
  terminalReason = null;
}
function getCurrentTurnLease() {
  return turnOwnership.status === "owned" ? turnOwnership.turnLease : null;
}
function canSendTurnHeartbeat(input) {
  return input.claimMutation === void 0 || input.ownership.status === "owned";
}
function appendCurrentTurnLease(args) {
  const identity = getCurrentTurnLease();
  if (identity === null) return;
  args.turnId = identity.turnId;
  args.leaseGeneration = identity.leaseGeneration;
}
function getLeaseTerminalReason() {
  return terminalReason;
}
function decideTurnLeaseExit(input) {
  if (input.terminalReason === null) return { action: "continue" };
  if (input.exitScheduled) return { action: "wait" };
  return { action: "exit", reason: input.terminalReason };
}
function parseTerminalReason(value) {
  if (value === "unknown_turn" || value === "closed" || value === "superseded" || value === "timeout" || value === "cancelled") {
    return value;
  }
  return null;
}
function noteHeartbeatResponse(response) {
  if (terminalReason !== null) return true;
  let parsed;
  if (typeof response === "string") {
    try {
      parsed = JSON.parse(response);
    } catch {
      return false;
    }
  } else {
    parsed = response;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return false;
  }
  const responseValue = parsed.value;
  const payload = typeof responseValue === "object" && responseValue !== null && !Array.isArray(responseValue) ? responseValue : parsed;
  const lease = payload.lease;
  if (typeof lease !== "object" || lease === null || Array.isArray(lease)) {
    return false;
  }
  if (lease.status !== "terminal") return false;
  terminalReason = parseTerminalReason(lease.reason) ?? "closed";
  log(
    "turn lease terminal (" + terminalReason + ") turnId=" + String(getCurrentTurnLease()?.turnId)
  );
  return true;
}

// callback-src/http/convexClient.ts
function appendTurnLease(body) {
  const identity = getCurrentTurnLease();
  if (identity === null) return;
  body.set("turnId", identity.turnId);
  body.set("leaseGeneration", String(identity.leaseGeneration));
}
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
async function withRetries(label, maxRetries, run, shouldRetry = () => true) {
  let attempt = 0;
  while (true) {
    try {
      return await run();
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      attempt++;
      if (attempt > maxRetries || !shouldRetry(error)) throw e;
      const delayMs = buildRetryDelayMs(attempt);
      log(
        label + " attempt " + attempt + " failed, retrying in " + delayMs + "ms: " + String(e)
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
var HttpResponseError = class extends Error {
  status;
  constructor(label, status, body) {
    super(label + " failed: " + status + " " + body);
    this.name = "HttpResponseError";
    this.status = status;
  }
};
function shouldRetryHttpError(error) {
  return !(error instanceof HttpResponseError) || error.status >= 500;
}
async function postSignedForm(url, body, label) {
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!res.ok) {
    const text = await res.text();
    throw new HttpResponseError(label, res.status, text);
  }
  return res.text();
}
async function callConvex(type, path3, args) {
  const endpoint = type === "mutation" ? "/api/mutation" : "/api/action";
  const headers = {
    "Content-Type": "application/json"
  };
  if (CONVEX_TOKEN) headers["Authorization"] = "Bearer " + CONVEX_TOKEN;
  const res = await fetchWithTimeout(CONVEX_URL + endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ path: path3, args, format: "json" })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      "Convex " + type + " " + path3 + " failed: " + res.status + " " + text
    );
  }
  return await readResponseJson(res) ?? null;
}
async function callConvexWithRetry(type, path3, args, maxRetries = CALLBACK_HTTP_MAX_RETRIES) {
  return await withRetries(
    "callConvex(" + type + ")",
    maxRetries,
    () => callConvex(type, path3, args)
  );
}
async function callHarnessSkillCatalogReport(provider, cliVersion, skills) {
  if (!CONVEX_SITE_URL || !HARNESS_CATALOG_TOKEN || !HARNESS_CATALOG_SANDBOX_ID || !REPO_ID) {
    return null;
  }
  const url = CONVEX_SITE_URL + "/api/harness-skills/report";
  const body = new URLSearchParams();
  body.set("provider", provider);
  body.set("cliVersion", cliVersion);
  body.set("skills", JSON.stringify(skills));
  body.set("token", HARNESS_CATALOG_TOKEN);
  body.set("sandboxId", HARNESS_CATALOG_SANDBOX_ID);
  body.set("repoId", REPO_ID);
  return await withRetries(
    "harness skill catalog report",
    CALLBACK_HTTP_MAX_RETRIES,
    () => postSignedForm(url, body, "Harness skill catalog report"),
    shouldRetryHttpError
  );
}
async function callStreamingHeartbeatTouchOnce(entityId) {
  if (CONVEX_SITE_URL && STREAMING_HMAC) {
    const body = new URLSearchParams();
    body.set("entityId", entityId);
    body.set("hmac", STREAMING_HMAC);
    body.set("touchOnly", "1");
    appendTurnLease(body);
    const response2 = await postSignedForm(
      CONVEX_SITE_URL + "/api/streaming/heartbeat",
      body,
      "Streaming heartbeat touch"
    );
    noteHeartbeatResponse(response2);
    return response2;
  }
  const identity = getCurrentTurnLease();
  const response = identity === null ? await callConvex("mutation", "turns:legacyHeartbeatFromCallback", {
    entityId,
    touchOnly: true
  }) : await callConvex("mutation", "turns:heartbeatFromCallback", {
    entityId,
    touchOnly: true,
    turnId: identity.turnId,
    leaseGeneration: identity.leaseGeneration
  });
  noteHeartbeatResponse(response);
  return response;
}
async function callStreamingHeartbeatOnce(entityId, currentActivity, currentContent, pendingQuestion) {
  if (CONVEX_SITE_URL && STREAMING_HMAC) {
    const body = new URLSearchParams();
    body.set("entityId", entityId);
    body.set("hmac", STREAMING_HMAC);
    body.set("currentActivity", currentActivity);
    body.set("currentContent", currentContent || "");
    appendTurnLease(body);
    if (pendingQuestion) {
      body.set("pendingQuestion", pendingQuestion);
    }
    const response2 = await postSignedForm(
      CONVEX_SITE_URL + "/api/streaming/heartbeat",
      body,
      "Streaming heartbeat"
    );
    noteHeartbeatResponse(response2);
    return response2;
  }
  const args = {
    entityId,
    touchOnly: false,
    currentActivity,
    currentContent
  };
  if (pendingQuestion) {
    args.pendingQuestion = pendingQuestion;
  }
  const identity = getCurrentTurnLease();
  const path3 = identity === null ? "turns:legacyHeartbeatFromCallback" : "turns:heartbeatFromCallback";
  if (identity !== null) {
    args.turnId = identity.turnId;
    args.leaseGeneration = identity.leaseGeneration;
  }
  const response = await callConvex("mutation", path3, args);
  noteHeartbeatResponse(response);
  return response;
}
async function callStreamingHeartbeat(entityId, currentActivity, currentContent, pendingQuestion) {
  return await withRetries(
    "streaming heartbeat",
    STREAMING_HEARTBEAT_MAX_RETRIES,
    () => callStreamingHeartbeatOnce(
      entityId,
      currentActivity,
      currentContent,
      pendingQuestion
    )
  );
}
async function callStreamingHeartbeatTouch(entityId) {
  return await withRetries(
    "streaming heartbeat touch",
    STREAMING_HEARTBEAT_MAX_RETRIES,
    () => callStreamingHeartbeatTouchOnce(entityId)
  );
}

// callback-src/parse/stepBudget.ts
var STEP_FIELD_CAPS = {
  command: 600,
  output: 1200,
  editSide: 1e3,
  editsMax: 4,
  filesMax: 10,
  contentPreview: 1e3,
  /** Reasoning prose per burst; head-capped so one turn's thinking cannot
   * dominate the payload. Prose rides \`detail\` (see applyReasoningSnapshot). */
  reasoning: 6e3,
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
  pushText(obj.aggregatedOutput);
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
  const paths2 = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (path3) => {
    const trimmed = path3.trim();
    if (!trimmed || seen.has(trimmed)) return;
    if (paths2.length >= STEP_FIELD_CAPS.filesMax) return;
    seen.add(trimmed);
    paths2.push(trimmed);
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
  return paths2;
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
  const path3 = rawPath ? shortenPath(rawPath) : "";
  const toolUseId = pickToolCallId(part) ?? (typeof part.callID === "string" && part.callID.trim() ? part.callID.trim() : void 0);
  let step;
  switch (tool) {
    case "read":
      step = {
        type: "read",
        label: "Reading file...",
        detail: path3 || void 0,
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
        detail: path3 || void 0,
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
        detail: path3 || void 0,
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
  const path3 = rawPath ? shortenPath(rawPath) : "";
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
        detail: path3 || void 0,
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
        detail: path3 || void 0,
        path: rawPath || void 0,
        contentPreview: fileText ? capContentPreview(fileText) : void 0,
        status: "active"
      };
    }
    case "edit":
      return {
        type: "edit",
        label: "Editing file...",
        detail: path3 || void 0,
        path: rawPath || void 0,
        edits: extractClaudeEdits(args),
        status: "active"
      };
    case "delete":
      return {
        type: "edit",
        label: "Deleting file...",
        detail: path3 || void 0,
        path: rawPath || void 0,
        status: "active"
      };
    case "glob":
      return {
        type: "search_files",
        label: "Searching files...",
        detail: query || path3 || void 0,
        status: "active"
      };
    case "ls":
      return {
        type: "search_files",
        label: "Searching files...",
        detail: path3 || void 0,
        status: "active"
      };
    case "grep":
    case "semSearch":
      return {
        type: "search_code",
        label: "Searching code...",
        detail: query || path3 || void 0,
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
      detail: path3 || void 0,
      path: rawPath || void 0,
      status: "active"
    };
  }
  if (tool.includes("write") || tool.includes("create")) {
    return {
      type: "write",
      label: "Creating file...",
      detail: path3 || void 0,
      path: rawPath || void 0,
      status: "active"
    };
  }
  if (tool.includes("edit") || tool.includes("patch") || tool.includes("apply") || tool.includes("replace")) {
    return {
      type: "edit",
      label: "Editing file...",
      detail: path3 || void 0,
      path: rawPath || void 0,
      status: "active",
      edits: extractClaudeEdits(args)
    };
  }
  if (tool.includes("delete") || tool.includes("remove")) {
    return {
      type: "edit",
      label: "Deleting file...",
      detail: path3 || void 0,
      path: rawPath || void 0,
      status: "active"
    };
  }
  if (tool.includes("glob") || tool.includes("list")) {
    return {
      type: "search_files",
      label: "Searching files...",
      detail: query || path3 || void 0,
      status: "active"
    };
  }
  if (tool.includes("grep") || tool.includes("search")) {
    return {
      type: tool.includes("file") ? "search_files" : "search_code",
      label: tool.includes("file") ? "Searching files..." : "Searching code...",
      detail: query || path3 || void 0,
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
  const path3 = rawPath ? shortenPath(rawPath) : "";
  switch (name) {
    case "Read":
      return {
        type: "read",
        label: "Reading file...",
        detail: path3 || void 0,
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
        detail: path3 || void 0,
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
        detail: path3 || void 0,
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
  if (item.type !== "agent_message" && item.type !== "agentMessage") {
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
  if (normalizedType === "mcp_tool_call" || normalizedType === "mcptoolcall") {
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
  if (normalizedType.includes("agent") || normalizedType === "collabtoolcall") {
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

// callback-src/runtime/sandboxMedia.ts
function mediaCandidateRoots(workDir, rootDirectory) {
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
function mediaSearchDirs(workDir, rootDirectory) {
  const roots = mediaCandidateRoots(workDir, rootDirectory);
  return {
    recordings: roots.map((root) => \`\${root}/recordings\`),
    screenshots: roots.map((root) => \`\${root}/screenshots\`)
  };
}

// callback-src/runtime/turnCheckpoint.ts
import { spawnSync as spawnSync2 } from "child_process";
var turnStartSha = "";
function beginTurnCheckpoint() {
  turnStartSha = readGitHeadSha();
}
function resetTurnCheckpoint() {
  turnStartSha = "";
}
function currentBranch() {
  const result = spawnSync2(
    "git",
    ["-C", WORK_DIR, "rev-parse", "--abbrev-ref", "HEAD"],
    { encoding: "utf8", timeout: 2e4 }
  );
  return result.status === 0 ? (result.stdout || "").trim() : "";
}
function appendTurnCheckpoint(args) {
  if (ENTITY_ID_FIELD !== "sessionId") return;
  if (RUN_ID || turnStartSha === "") return;
  if (!currentBranch().startsWith("eva/")) return;
  const afterSha = readGitHeadSha();
  if (afterSha === "") return;
  args.beforeSha = turnStartSha;
  args.afterSha = afterSha;
}

// callback-src/runtime/completion.ts
import {
  existsSync as existsSync3,
  mkdirSync as mkdirSync2,
  readFileSync as readFileSync2,
  readdirSync as readdirSync2,
  renameSync,
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
function readSyntheticResult(output) {
  const found = {
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
    assistantText: ""
  };
  const readNumberField2 = (source, key) => {
    const value = source[key];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  };
  const assistantParts = [];
  for (const line of output.split("\\n")) {
    const clean = line.trim();
    if (!clean) continue;
    try {
      const parsed = parseJsonObject(clean);
      if (!parsed) continue;
      if (parsed.type === "result") {
        found.sawResult = true;
        found.isError = Boolean(parsed.is_error);
        found.durationMs = readNumberField2(parsed, "duration_ms");
        found.totalCostUsd = readNumberField2(parsed, "total_cost_usd");
        found.model = typeof parsed.model === "string" ? parsed.model : "";
        if (typeof parsed.result === "string") {
          found.resultText = parsed.result;
        } else if (parsed.result !== void 0) {
          found.resultText = JSON.stringify(parsed.result);
        }
        if (parsed.usage && typeof parsed.usage === "object" && !Array.isArray(parsed.usage)) {
          found.inputTokens = readNumberField2(parsed.usage, "input_tokens");
          found.outputTokens = readNumberField2(parsed.usage, "output_tokens");
          found.cacheReadTokens = readNumberField2(
            parsed.usage,
            "cache_read_input_tokens"
          );
          found.cacheWriteTokens = readNumberField2(
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
  found.assistantText = assistantParts.join("");
  return found;
}
function extractResultEvent(output) {
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
          model: found.model || (PROVIDER === "opencode" ? normalizedOpencodeModel : normalizedCursorModel)
        })
      };
    }
    if (found.assistantText) {
      return {
        result: found.assistantText,
        isError: false,
        rawResultEvent: ""
      };
    }
    return null;
  }
  if (PROVIDER === "codex") {
    let finalText2 = "";
    let lastInputTokens = 0;
    let lastCachedInputTokens = 0;
    let lastCacheWriteInputTokens = 0;
    let lastOutputTokens = 0;
    for (const line of output.split("\\n")) {
      const clean = line.trim();
      if (!clean) continue;
      try {
        const parsed = parseJsonObject(clean);
        if (!parsed) continue;
        if (parsed.type === "item.completed" && parsed.item && typeof parsed.item === "object" && !Array.isArray(parsed.item) && parsed.item.type === "agent_message") {
          const messageText = getCodexAgentMessageText(parsed.item);
          if (messageText) finalText2 = messageText;
          continue;
        }
        if (parsed.type === "turn.completed" && parsed.usage && typeof parsed.usage === "object" && !Array.isArray(parsed.usage)) {
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
      }
    }
    if (!finalText2) return null;
    const nonCachedInput = Math.max(0, lastInputTokens - lastCachedInputTokens);
    return {
      result: finalText2,
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
        cacheCreationInputTokens: lastCacheWriteInputTokens,
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
  const agentName = PROVIDER === "codex" ? "Codex SDK" : PROVIDER === "opencode" ? "Opencode SDK" : PROVIDER === "cursor" ? "Cursor SDK" : "Claude CLI";
  if (fatalHeartbeatError) return fatalHeartbeatError;
  if (toolStallError) return toolStallError;
  if (timedOutForZombie) {
    return agentName + " terminated because the agent process entered zombie state (likely a grandchild held stdio open after the agent exited)";
  }
  if (timedOutForMaxRuntime) {
    return agentName + " terminated after max runtime of " + MAX_TOTAL_RUNTIME_MS + "ms";
  }
  if (timedOutForFirstEvent) {
    return agentName + " produced no parseable stream-json events within " + FIRST_EVENT_TIMEOUT_MS + "ms";
  }
  if (timedOutForFirstAssistant) {
    return agentName + " initialized but produced no assistant response within " + FIRST_ASSISTANT_EVENT_TIMEOUT_MS + "ms \\u2014 likely MCP initialization or API congestion";
  }
  if (timedOutAfterFirstText) {
    return agentName + " stalled after first text block for " + POST_TEXT_STALL_TIMEOUT_MS + "ms";
  }
  if (timedOutForNoOutput) {
    return agentName + " terminated after no stdout for " + NO_OUTPUT_TIMEOUT_MS + "ms";
  }
  if (code === 137 || code === 143) {
    return agentName + (code === 137 ? " was killed before it finished \\u2014 the sandbox ran out of memory." : " was stopped before it finished \\u2014 the run was interrupted.") + " This usually means the sandbox was stopped or a new message cancelled the run, so nothing was completed. Send the request again on a running sandbox.";
  }
  return agentName + " exited with code " + code;
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
async function attachChatMediaIfAny(uploaded, target) {
  if (uploaded.length === 0) return;
  const mediaArgs = {
    parentId: ENTITY_ID ?? "",
    mediaStorageIds: uploaded.map((item) => item.storageId)
  };
  if (target.messageId) mediaArgs.messageId = target.messageId;
  await callConvexWithRetry("action", "screenshots:attachMedia", mediaArgs, 3);
}
async function deliverCompletionWithMedia(completionArgs) {
  appendTurnCheckpoint(completionArgs);
  await callConvexWithRetry(
    "mutation",
    COMPLETION_MUTATION ?? "",
    completionArgs
  );
  await uploadAndAttachSandboxMedia({});
}
function archivePostedFile(dir, file) {
  const postedDir = dir + "/.posted";
  mkdirSync2(postedDir, { recursive: true });
  renameSync(dir + "/" + file, postedDir + "/" + file);
}
async function uploadAndAttachSandboxMedia(target) {
  if (RUN_ID) return;
  const uploaded = [];
  const seenDigests = /* @__PURE__ */ new Set();
  const isDuplicate = (filePath) => {
    const digest = createHash("sha256").update(readFileSync2(filePath)).digest("hex");
    if (seenDigests.has(digest)) return true;
    seenDigests.add(digest);
    return false;
  };
  const { recordings, screenshots } = mediaSearchDirs(WORK_DIR, ROOT_DIRECTORY);
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
        archivePostedFile(recDir, file);
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
        archivePostedFile(ssDir, file);
      } catch {
      }
    }
  }
  try {
    await attachChatMediaIfAny(uploaded, target);
  } catch (e) {
    console.error("Failed to attach sandbox media:", e);
  }
}
function hasToolActivity() {
  return callbackState.accumulatedSteps.some((step) => TOOL_STEP_TYPES.has(step.type));
}

// callback-src/session/claudeSession.ts
import { existsSync as existsSync4, mkdirSync as mkdirSync3, readFileSync as readFileSync3, writeFileSync as writeFileSync3 } from "fs";
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
  mkdirSync3(CLAUDE_RUNTIME_CONFIG_DIR, { recursive: true });
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
  mkdirSync3(CLAUDE_LOCAL_PROJECT_DIR, { recursive: true });
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
  mkdirSync3(CLAUDE_RUNTIME_CONFIG_DIR, { recursive: true });
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

// callback-src/runtime/usageLimits.ts
var REPORT_MUTATION = "usageLimits:report";
var NOTE_REFRESH_MUTATION = "usageLimits:noteRefreshAttempt";
var REPORT_MAX_RETRIES = 1;
var USAGE_LOOKUP_TIMEOUT_MS = 5e3;
var FORCE_USAGE_LOOKUP_TIMEOUT_MS = 2e4;
var USAGE_REPORT_EXIT_GRACE_MS = 7e3;
var USAGE_REPORT_REFRESH_MS = 6 * 60 * 60 * 1e3;
var pendingClaudeUsageReport = null;
var CLAUDE_WINDOW_LABELS = {
  five_hour: "5h",
  seven_day: "Weekly (all models)",
  seven_day_oauth_apps: "Weekly (apps)",
  seven_day_opus: "Weekly (Opus)",
  seven_day_sonnet: "Weekly (Sonnet)",
  seven_day_overage_included: "Weekly (overage included)",
  overage: "Extra usage"
};
function readFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function readNonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function readStatus(value) {
  return value === "allowed" || value === "allowed_warning" || value === "rejected" ? value : void 0;
}
function readIsoMs(value) {
  const text = readNonEmptyString(value);
  if (!text) return void 0;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : void 0;
}
function buildWindow(key, label, utilization, resetsAt) {
  return {
    key,
    label,
    ...utilization === void 0 ? {} : { utilization },
    ...resetsAt === void 0 ? {} : { resetsAt }
  };
}
function mergeWindow(snapshot, window) {
  const windows = snapshot.windows ?? [];
  const index = windows.findIndex((existing) => existing.key === window.key);
  if (index >= 0) {
    windows[index] = window;
  } else {
    windows.push(window);
  }
  snapshot.windows = windows;
}
function ensureSnapshot() {
  const existing = callbackState.usageLimitSnapshot;
  if (existing) return existing;
  const created = { completeness: "partial" };
  callbackState.usageLimitSnapshot = created;
  return created;
}
function normalizeWindowKey(key) {
  if (key === "seven_day_oi") return "model_scoped:Fable";
  return key;
}
function labelForWindowKey(key) {
  if (CLAUDE_WINDOW_LABELS[key]) return CLAUDE_WINDOW_LABELS[key];
  if (key.startsWith("model_scoped:")) {
    return \`Weekly (\${key.slice("model_scoped:".length)})\`;
  }
  return key;
}
function mergeClaudeRateLimitEvent(event) {
  const info = event.rate_limit_info;
  if (typeof info !== "object" || info === null || Array.isArray(info)) return;
  const status = readStatus(info.status);
  const rawKey = readNonEmptyString(info.rateLimitType);
  if (!status && !rawKey) return;
  const snapshot = ensureSnapshot();
  snapshot.completeness = "partial";
  if (status) snapshot.status = status;
  if (!rawKey) return;
  const key = normalizeWindowKey(rawKey);
  const resetsAtSeconds = readFiniteNumber(info.resetsAt);
  mergeWindow(
    snapshot,
    buildWindow(
      key,
      labelForWindowKey(key),
      readFiniteNumber(info.utilization),
      resetsAtSeconds === void 0 ? void 0 : Math.round(resetsAtSeconds * 1e3)
    )
  );
}
function pushUsageWindow(windows, key, entry, label) {
  if (!entry) return;
  const utilization = readFiniteNumber(entry.utilization);
  const resetsAt = readIsoMs(entry.resets_at);
  if (utilization === void 0 && resetsAt === void 0) return;
  windows.push(
    buildWindow(
      key,
      label ?? CLAUDE_WINDOW_LABELS[key] ?? key,
      utilization,
      resetsAt
    )
  );
}
function readClaudeUsageWindows(response) {
  const limits = response?.rate_limits;
  if (!limits) return [];
  const windows = [];
  pushUsageWindow(windows, "five_hour", limits.five_hour);
  pushUsageWindow(windows, "seven_day", limits.seven_day);
  pushUsageWindow(windows, "seven_day_opus", limits.seven_day_opus);
  pushUsageWindow(windows, "seven_day_sonnet", limits.seven_day_sonnet);
  pushUsageWindow(windows, "seven_day_oauth_apps", limits.seven_day_oauth_apps);
  pushUsageWindow(
    windows,
    "seven_day_overage_included",
    limits.seven_day_overage_included
  );
  for (const entry of limits.model_scoped ?? []) {
    const name = readNonEmptyString(entry.display_name);
    if (!name) continue;
    pushUsageWindow(windows, "model_scoped:" + name, entry, \`Weekly (\${name})\`);
  }
  pushUsageWindow(windows, "overage", limits.overage);
  return windows;
}
function unwrapUsagePayload(response) {
  const nested = response.value;
  if (nested !== null && nested !== void 0 && (nested.rate_limits_available !== void 0 || nested.rate_limits !== void 0 || nested.subscription_type !== void 0)) {
    return nested;
  }
  return response;
}
function usageAvailability(payload) {
  if (payload.rate_limits_available === true) return true;
  if (payload.rate_limits_available === false) return false;
  if (payload.rate_limits !== void 0 && payload.rate_limits !== null) {
    return true;
  }
  return null;
}
function noteDaemonRefresh(captured, available, detail) {
  void callConvexWithRetry(
    "mutation",
    NOTE_REFRESH_MUTATION,
    {
      captured,
      detail,
      ...available === null ? {} : { available }
    },
    REPORT_MAX_RETRIES
  ).catch(() => {
  });
}
async function captureClaudeUsage(readUsage, recordAttempt = false) {
  let timer;
  const lookupTimeoutMs = recordAttempt ? FORCE_USAGE_LOOKUP_TIMEOUT_MS : USAGE_LOOKUP_TIMEOUT_MS;
  try {
    const response = await Promise.race([
      readUsage(),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve("timeout"), lookupTimeoutMs);
      })
    ]);
    if (response === "timeout") {
      log("usage limits: claude usage lookup timed out");
      if (recordAttempt) noteDaemonRefresh(false, null, "timeout");
      return false;
    }
    if (!response) {
      if (recordAttempt) noteDaemonRefresh(false, null, "null-response");
      return false;
    }
    const payload = unwrapUsagePayload(response);
    const available = usageAvailability(payload);
    if (available === null) {
      log("usage limits: claude usage response omitted availability");
      if (recordAttempt) noteDaemonRefresh(false, null, "omitted-availability");
      return false;
    }
    if (available === false) {
      log(
        "usage limits: claude plan usage unavailable \\u2014 preserving prior reading"
      );
      if (!callbackState.usageLimitSnapshot) {
        callbackState.usageLimitSnapshot = { completeness: "refused" };
      }
      if (recordAttempt) {
        noteDaemonRefresh(false, false, "rate-limits-unavailable");
      }
      return false;
    }
    const snapshot = { completeness: "complete" };
    const subscriptionType = readNonEmptyString(payload.subscription_type);
    if (subscriptionType) snapshot.subscriptionType = subscriptionType;
    snapshot.windows = readClaudeUsageWindows(payload);
    callbackState.usageLimitSnapshot = snapshot;
    if (recordAttempt) {
      noteDaemonRefresh(true, true, subscriptionType ?? "complete");
    }
    return true;
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    log("usage limits: claude usage lookup failed \\u2014 " + messageText);
    if (recordAttempt) {
      noteDaemonRefresh(false, null, "error:" + messageText.slice(0, 120));
    }
    return false;
  } finally {
    if (timer !== void 0) clearTimeout(timer);
  }
}
function captureClaudeUsageLimitError(error) {
  if (!error) return;
  const message = error.toLowerCase();
  if (!message.includes("out of extra usage") && !message.includes("rate limit") && !message.includes("usage limit") && !message.includes("session limit") && !message.includes("spend limit") && !message.includes("token limit exceeded")) {
    return;
  }
  const snapshot = ensureSnapshot();
  snapshot.status = "rejected";
}
function windowToJson(window) {
  return {
    key: window.key,
    label: window.label,
    ...window.utilization === void 0 ? {} : { utilization: window.utilization },
    ...window.resetsAt === void 0 ? {} : { resetsAt: window.resetsAt }
  };
}
function buildUsageLimitReportArgs(repoId, provider, providerAccountId, snapshot) {
  return {
    repoId,
    provider,
    // Stored on the row so the UI can say why a reading has no windows. The
    // server also reads it for merge-vs-replace, and still accepts the older
    // \`snapshotComplete\` boolean from callback bundles baked before this.
    completeness: snapshot.completeness,
    ...providerAccountId ? { providerAccountId } : {},
    ...snapshot.subscriptionType === void 0 ? {} : { subscriptionType: snapshot.subscriptionType },
    ...snapshot.status === void 0 ? {} : { status: snapshot.status },
    ...snapshot.windows === void 0 ? {} : { windows: snapshot.windows.map(windowToJson) }
  };
}
async function reportUsageLimits(provider, force = false) {
  const snapshot = callbackState.usageLimitSnapshot;
  if (!snapshot) return;
  if (!REPO_ID) {
    log("usage limits: no REPO_ID in the environment \\u2014 not reporting");
    return;
  }
  const args = buildUsageLimitReportArgs(
    REPO_ID,
    provider,
    PROVIDER_ACCOUNT_ID,
    snapshot
  );
  const fingerprint = JSON.stringify(args);
  const capturedAt = Date.now();
  if (!force && fingerprint === callbackState.lastReportedUsageLimits && capturedAt - callbackState.lastReportedUsageLimitsAt < USAGE_REPORT_REFRESH_MS) {
    return;
  }
  callbackState.lastReportedUsageLimits = fingerprint;
  try {
    await callConvexWithRetry(
      "mutation",
      REPORT_MUTATION,
      { ...args, capturedAt },
      REPORT_MAX_RETRIES
    );
    callbackState.lastReportedUsageLimitsAt = capturedAt;
  } catch (error) {
    callbackState.lastReportedUsageLimits = "";
    callbackState.lastReportedUsageLimitsAt = 0;
    const messageText = error instanceof Error ? error.message : String(error);
    log("usage limits: report failed \\u2014 " + messageText);
  }
}
async function captureAndReportClaudeUsage(input) {
  const captured = await captureClaudeUsage(
    input.readUsage,
    input.force === true
  );
  captureClaudeUsageLimitError(input.error);
  if (input.force === true && !captured) return;
  await reportUsageLimits("claude", input.force === true);
}
function startClaudeUsageReport(input) {
  const report = captureAndReportClaudeUsage(input);
  pendingClaudeUsageReport = report;
  void report.finally(() => {
    if (pendingClaudeUsageReport === report) pendingClaudeUsageReport = null;
  });
}
async function waitForPendingClaudeUsageReport() {
  const pending = pendingClaudeUsageReport;
  if (!pending) return;
  let timer;
  await Promise.race([
    pending,
    new Promise((resolve) => {
      timer = setTimeout(resolve, USAGE_REPORT_EXIT_GRACE_MS);
    })
  ]);
  if (timer !== void 0) clearTimeout(timer);
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
  if (messageType === "rate_limit_event") {
    mergeClaudeRateLimitEvent(event);
    return [];
  }
  if (messageType === "auth_status") {
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
      if (block.name === "TodoRead" || block.name === "TaskGet" || block.name === "TaskList" || block.name === "ExitPlanMode") {
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
import { mkdirSync as mkdirSync5, writeFileSync as writeFileSync5 } from "fs";

// callback-src/session/createSessionStore.ts
import { existsSync as existsSync5, mkdirSync as mkdirSync4, readFileSync as readFileSync4, writeFileSync as writeFileSync4 } from "fs";
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
    mkdirSync4(config.runtimeHomeDir, { recursive: true });
    const payload = {
      [config.resumeField]: activeId,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    writeFileSync4(config.localStateFile, JSON.stringify(payload, null, 2));
  };
  const hydratePersistedState = (label) => {
    mkdirSync4(config.runtimeHomeDir, { recursive: true });
    copyFileIfPresent(
      config.persistStateFile,
      config.localStateFile,
      label + "(state)"
    );
  };
  const syncStateToPersist = (label) => {
    writeSessionState();
    mkdirSync4(config.persistDir, { recursive: true });
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
  mkdirSync5(CODEX_RUNTIME_HOME_DIR, { recursive: true });
  writeFileSync5(CODEX_RUNTIME_HOME_DIR + "/" + fileName, value);
}
function codexMcpServerSections(servers) {
  return Object.entries(servers).flatMap(([name, server]) => {
    const headers = Object.entries(server.headers).map(
      ([header, value]) => \`\${JSON.stringify(header)} = \${JSON.stringify(value)}\`
    ).join(", ");
    return [
      "",
      \`[mcp_servers.\${JSON.stringify(name)}]\`,
      \`url = \${JSON.stringify(server.url)}\`,
      \`http_headers = { \${headers} }\`
    ];
  });
}
function buildCodexRuntimeConfig(rawValue, encodedValue, fastMode = codexFastMode, mcpServers = evaMcpServers) {
  const configuredValue = rawValue || (encodedValue ? decodeBase64(encodedValue) : "");
  const preservedLines = configuredValue ? configuredValue.split(/\\r?\\n/).filter((line) => {
    const trimmed = line.trim().toLowerCase();
    return !trimmed.startsWith("sandbox_mode") && !trimmed.startsWith("approval_policy") && // Eva owns the Fast toggle; account config must not silently opt in.
    !trimmed.startsWith("service_tier") && // Drop any configured reasoning effort; the session lever wins when set.
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
  if (fastMode) {
    runtimeLines.push('service_tier = "fast"');
  }
  if (normalizedPreservedLines.length > 0) {
    runtimeLines.push(...normalizedPreservedLines);
  }
  runtimeLines.push(...codexMcpServerSections(mcpServers));
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
  mkdirSync5(CODEX_RUNTIME_HOME_DIR, { recursive: true });
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
      label: "Starting Codex SDK...",
      detail: "Restoring saved context..."
    });
    return events;
  }
  if (event.type === "turn.started") {
    events.push({
      kind: "update_thinking",
      label: "Starting Codex SDK...",
      detail: "Codex is reasoning..."
    });
    return events;
  }
  if (event.type === "item.agent_message.delta" && typeof event.delta === "string" && event.delta) {
    events.push({ kind: "stream_text_delta", text: event.delta });
    return events;
  }
  if (event.type === "item.reasoning.delta" && typeof event.delta === "string" && event.delta) {
    events.push({ kind: "update_reasoning", text: event.delta });
    return events;
  }
  if (event.type === "item.started" && event.item && typeof event.item === "object" && !Array.isArray(event.item) && (event.item.type === "agent_message" || event.item.type === "agentMessage")) {
    events.push({ kind: "mark_message_start" });
    return events;
  }
  if ((event.type === "item.started" || event.type === "item.updated" || event.type === "item.completed") && event.item && typeof event.item === "object" && !Array.isArray(event.item) && event.item.type === "reasoning") {
    if (typeof event.item.text === "string" && event.item.text.trim()) {
      events.push({ kind: "update_reasoning", text: event.item.text });
    }
    return events;
  }
  if (event.type === "item.started" && event.item && typeof event.item === "object" && !Array.isArray(event.item) && typeof event.item.type === "string" && event.item.type !== "agent_message" && event.item.type !== "agentMessage") {
    const step = codexItemToStep(event.item);
    const trackingId = step.type !== "thinking" && typeof event.item.id === "string" ? event.item.id : void 0;
    events.push(
      trackingId ? { kind: "push_step", step, trackingId } : { kind: "push_step", step }
    );
    return events;
  }
  if (event.type === "item.completed" && event.item && typeof event.item === "object" && !Array.isArray(event.item) && (event.item.type === "agent_message" || event.item.type === "agentMessage")) {
    const messageText = getCodexAgentMessageText(event.item);
    if (messageText && !callbackState.streamedAssistantTextThisMessage) {
      events.push({ kind: "append_text", text: messageText });
    }
    return events;
  }
  if ((event.type === "item.completed" || event.type === "item.failed") && event.item && typeof event.item === "object" && !Array.isArray(event.item) && typeof event.item.type === "string" && event.item.type !== "agent_message" && event.item.type !== "agentMessage") {
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
  }
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
function cursorCompactionEventPhase(type) {
  if (type === "summary-started" || type === "summary_started") {
    return "started";
  }
  if (type === "summary-completed" || type === "summary_completed") {
    return "completed";
  }
  return null;
}
var SILENT_EVENT_TYPES = /* @__PURE__ */ new Set([
  "user",
  "status",
  "request",
  "task",
  "usage"
]);
var reportedSilentTypes = /* @__PURE__ */ new Set();
function cursorParseLine(event) {
  const events = cursorEventToCanonical(event);
  if (events.length === 0) {
    const type = typeof event.type === "string" ? event.type : "(untyped)";
    if (!SILENT_EVENT_TYPES.has(type) && !reportedSilentTypes.has(type)) {
      reportedSilentTypes.add(type);
      log(
        "cursor stream event '" + type + "' produced no activity steps; parser and SDK may disagree on its shape"
      );
    }
  }
  return events;
}
function cursorEventToCanonical(event) {
  const events = [];
  if (event.type === "system") {
    events.push({
      kind: "update_thinking",
      label: "Cursor agent ready",
      detail: "Model context initialized."
    });
    return events;
  }
  if (event.type === "assistant") {
    const message = event.message && typeof event.message === "object" && !Array.isArray(event.message) ? event.message : null;
    const contentBlocks = message && Array.isArray(message.content) ? message.content : [];
    for (const block of contentBlocks) {
      if (block && typeof block === "object" && !Array.isArray(block) && block.type === "text" && typeof block.text === "string" && block.text) {
        events.push({ kind: "stream_text_delta", text: block.text });
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
  if (typeof event.type === "string") {
    const compactionPhase = cursorCompactionEventPhase(event.type);
    if (compactionPhase === "started") {
      events.push({
        kind: "update_thinking",
        label: "Compacting context...",
        detail: "Cursor is summarizing the conversation in place."
      });
      return events;
    }
    if (compactionPhase === "completed") {
      events.push({
        kind: "update_thinking",
        label: "Context compacted",
        detail: "The agent continues with its history summarized in place."
      });
      return events;
    }
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
import { mkdirSync as mkdirSync6, writeFileSync as writeFileSync6 } from "fs";
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
  mkdirSync6(OPENCODE_AUTH_DIR, { recursive: true });
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
function appendReasoningDetail(step, next) {
  const current = step.detail ?? "";
  const merged = next.startsWith(current) ? next : current + next;
  step.detail = headCap(merged, STEP_FIELD_CAPS.reasoning).text;
}
function applyReasoningSnapshot(text) {
  const next = String(text);
  if (!next) return;
  const last = callbackState.accumulatedSteps[callbackState.accumulatedSteps.length - 1];
  if (last && last.type === "reasoning" && last.status === "active") {
    appendReasoningDetail(last, next);
    callbackState.lastStepType = "thinking";
    return;
  }
  markLastComplete();
  const step = {
    type: "reasoning",
    label: "Thinking...",
    status: "active",
    detail: headCap(next, STEP_FIELD_CAPS.reasoning).text
  };
  callbackState.accumulatedSteps.push(step);
  stepStartedAt.set(step, Date.now());
  callbackState.lastStepType = "thinking";
}
function pushNoticeStep2(label, detail) {
  pushProgressStep({ type: "notice", label, detail, status: "complete" });
}
function updateThinkingStep(label, detail) {
  callbackState.transientThinkingStep = {
    type: "thinking",
    label,
    detail,
    status: "active"
  };
  callbackState.lastStepType = "thinking";
}
function clearThinkingStep() {
  callbackState.transientThinkingStep = null;
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
        clearThinkingStep();
        pushProgressStep(ev.step);
        if (shouldRecordProgressStep(ev.step)) {
          if (ev.trackingId) callbackState.codexToolItemIds.add(ev.trackingId);
          callbackState.inFlightToolUses++;
        }
        break;
      case "complete_tool":
        clearThinkingStep();
        completeToolStep(ev.trackingId, ev.result);
        if (ev.trackingId !== void 0) {
          callbackState.codexToolItemIds.delete(ev.trackingId);
        }
        if (callbackState.inFlightToolUses > 0) {
          callbackState.inFlightToolUses--;
        }
        break;
      case "mark_last_complete":
        clearThinkingStep();
        markLastComplete();
        break;
      case "append_text":
        clearThinkingStep();
        appendStreamedContent(ev.text, true);
        break;
      case "stream_text_delta":
        clearThinkingStep();
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
        clearThinkingStep();
        applyReasoningSnapshot(ev.text);
        break;
      case "set_pending_question":
        clearThinkingStep();
        callbackState.pendingQuestionData = ev.data;
        break;
      case "set_todos":
        clearThinkingStep();
        applyTodosSnapshot(ev.todos);
        break;
      case "set_codex_thread":
        callbackState.activeCodexThreadId = ev.threadId;
        break;
      case "mark_first_assistant":
        clearThinkingStep();
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
import { freemem, loadavg } from "os";

// callback-src/runtime/eventLoopStall.ts
var EVENT_LOOP_STALL_LOG_MS = 3e4;
function measureTickStallMs(input) {
  const lateBy = input.now - input.previousTickAt - input.intervalMs;
  return lateBy > input.toleranceMs ? lateBy : 0;
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
  ":!recordings/",
  ":!plan.md"
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
function localBranchRewroteOwnHistory(branch, remoteRef) {
  const remoteTip = git(["rev-parse", "--verify", remoteRef]);
  const reflog = git(["reflog", "show", "--format=%H", \`refs/heads/\${branch}\`]);
  if (!remoteTip.ok || !reflog.ok || remoteTip.out.length === 0) return false;
  return reflog.out.split("\\n").map((line) => line.trim()).includes(remoteTip.out);
}
function isMissingRemoteRef(message) {
  const lower = message.toLowerCase();
  return lower.includes("couldn't find remote ref") || lower.includes("could not find remote ref");
}
function isNonFastForwardPush(message) {
  const lower = message.toLowerCase();
  return lower.includes("non-fast-forward") || lower.includes("fetch first") || lower.includes("[rejected]") && lower.includes("failed to push");
}
function synchronizeForPush(branch) {
  const remoteRef = \`refs/remotes/origin/\${branch}\`;
  const fetch2 = git(
    [
      "fetch",
      "--no-tags",
      "origin",
      \`+refs/heads/\${branch}:\${remoteRef}\`
    ],
    PUSH_TIMEOUT_MS
  );
  if (!fetch2.ok) {
    if (isMissingRemoteRef(fetch2.out)) {
      git(["update-ref", "-d", remoteRef]);
      return { status: "ready", remoteExists: false };
    }
    log(\`persistTurnWork: fetch failed: \${fetch2.out.slice(0, 200)}\`);
    return { status: "failed" };
  }
  const divergence = git([
    "rev-list",
    "--left-right",
    "--count",
    \`\${remoteRef}...refs/heads/\${branch}\`
  ]);
  if (!divergence.ok) {
    log(
      \`persistTurnWork: divergence check failed: \${divergence.out.slice(0, 200)}\`
    );
    return { status: "failed" };
  }
  if (/^0\\s+\\d+\$/.test(divergence.out)) {
    return { status: "ready", remoteExists: true };
  }
  if (/^[1-9]\\d*\\s+0\$/.test(divergence.out)) {
    const fastForward = git(["merge", "--ff-only", remoteRef]);
    if (fastForward.ok) {
      return { status: "ready", remoteExists: true };
    }
    log(
      \`persistTurnWork: fast-forward failed: \${fastForward.out.slice(0, 200)}\`
    );
    return { status: "failed" };
  }
  if (/^[1-9]\\d*\\s+[1-9]\\d*\$/.test(divergence.out)) {
    if (localBranchRewroteOwnHistory(branch, remoteRef)) {
      log(
        \`persistTurnWork: skipped merge \\u2014 local branch rewrote its own history vs origin/\${branch}; left to the workflow publish\`
      );
      return { status: "failed" };
    }
    const merge = git(["merge", "--no-edit", remoteRef], PUSH_TIMEOUT_MS);
    if (merge.ok) {
      return { status: "ready", remoteExists: true };
    }
    git(["merge", "--abort"]);
    log(\`persistTurnWork: merge failed: \${merge.out.slice(0, 200)}\`);
    return { status: "failed" };
  }
  log(\`persistTurnWork: unexpected divergence: \${divergence.out}\`);
  return { status: "failed" };
}
function tipAlreadyPublished(exclusion) {
  const unpushed = git(["rev-list", "--count", "HEAD", "--not", ...exclusion]);
  return unpushed.ok && unpushed.out === "0";
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
  if (tipAlreadyPublished([\`refs/remotes/origin/\${branch.out}\`])) return;
  const refspec = \`refs/heads/\${branch.out}:refs/heads/\${branch.out}\`;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const sync = synchronizeForPush(branch.out);
    if (sync.status === "failed") return;
    const exclusion = sync.remoteExists ? [\`refs/remotes/origin/\${branch.out}\`] : ["--remotes=origin"];
    if (tipAlreadyPublished(exclusion)) return;
    const push = git(["push", "origin", refspec], PUSH_TIMEOUT_MS);
    if (push.ok) {
      log(
        \`persistTurnWork: push ok branch=\${branch.out} in \${Date.now() - startedAt}ms\`
      );
      return;
    }
    if (attempt < 2 && isNonFastForwardPush(push.out)) {
      log(
        \`persistTurnWork: remote moved during push; refetching branch=\${branch.out}\`
      );
      continue;
    }
    log(
      \`persistTurnWork: push failed: \${push.out.slice(0, 200)} branch=\${branch.out} in \${Date.now() - startedAt}ms\`
    );
    return;
  }
}

// callback-src/runtime/heartbeats.ts
var flushInterval = null;
var heartbeatInterval = null;
var activeFlush = null;
var flushRequested = false;
function ownsHeartbeatLease() {
  return canSendTurnHeartbeat({
    claimMutation: CLAIM_MUTATION,
    ownership: getTurnOwnership()
  });
}
function buildStreamingPayload() {
  return serializeSteps(
    callbackState.transientThinkingStep ? [...callbackState.accumulatedSteps, callbackState.transientThinkingStep] : callbackState.accumulatedSteps
  );
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
  log(
    "Heartbeat failed (consecutive: " + callbackState.consecutiveHeartbeatFailures + "): " + message
  );
  if (callbackState.consecutiveHeartbeatFailures === 2 || callbackState.consecutiveHeartbeatFailures === 4) {
    log(
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
  }
}
async function sendStreamingHeartbeatUpdate(payload) {
  if (!ownsHeartbeatLease()) return true;
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
async function flushStreamingPass() {
  if (!ownsHeartbeatLease()) {
    void flushBackgroundShellQueue();
    return;
  }
  let hasNew = false;
  if (callbackState.rawOutput.length > callbackState.lastProcessed) {
    const pending = callbackState.rawOutput.slice(callbackState.lastProcessed);
    const lastNewline = pending.lastIndexOf("\\n");
    if (lastNewline >= 0) {
      callbackState.lastProcessed += lastNewline + 1;
      for (const line of pending.slice(0, lastNewline).split("\\n")) {
        const clean = line.trim();
        if (!clean) continue;
        if (parseStreamEvent(clean)) {
          hasNew = true;
          callbackState.parsedStreamEventCount++;
        }
      }
    }
  }
  const payload = buildStreamingPayload();
  const contentChanged = callbackState.currentStreamedContent !== callbackState.lastSentContent;
  const activityChanged = payload !== callbackState.lastSentPayload;
  if (hasNew || contentChanged || activityChanged) {
    await sendStreamingHeartbeatUpdate(payload);
  } else if (callbackState.inFlightToolUses > 0 && Date.now() - callbackState.lastStreamingSentAt > 15e3) {
    const entityId = STREAMING_ENTITY_ID ?? "";
    if (entityId) {
      await callStreamingHeartbeatTouch(entityId);
      callbackState.lastStreamingSentAt = Date.now();
    }
  }
  void flushBackgroundShellQueue();
}
async function drainRequestedFlushes() {
  callbackState.flushInProgress = true;
  try {
    do {
      flushRequested = false;
      await flushStreamingPass();
    } while (flushRequested);
  } finally {
    callbackState.flushInProgress = false;
  }
}
function flushStreaming() {
  flushRequested = true;
  if (activeFlush) return activeFlush;
  const flush = drainRequestedFlushes();
  activeFlush = flush;
  const clearActiveFlush = () => {
    if (activeFlush === flush) activeFlush = null;
  };
  void flush.then(clearActiveFlush, clearActiveFlush);
  return flush;
}
var PING_STUCK_MS = 45e3;
async function heartbeatPing() {
  if (!ownsHeartbeatLease()) return;
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
    if (callbackState.transientThinkingStep) {
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
  if (!ownsHeartbeatLease()) {
    log("initialHeartbeat skipped: daemon is waiting to claim a turn");
    return;
  }
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
var HEARTBEAT_TICK_MS = 1e4;
var lastHeartbeatTickAt = 0;
function logEventLoopStall(now) {
  const stalledMs = measureTickStallMs({
    previousTickAt: lastHeartbeatTickAt,
    now,
    intervalMs: HEARTBEAT_TICK_MS,
    toleranceMs: EVENT_LOOP_STALL_LOG_MS
  });
  lastHeartbeatTickAt = now;
  if (stalledMs === 0) return;
  const mb = (bytes) => String(Math.round(bytes / 1024 / 1024));
  const memory = process.memoryUsage();
  log(
    "event loop stalled for " + stalledMs + "ms (rss=" + mb(memory.rss) + "MB heapUsed=" + mb(memory.heapUsed) + "MB freemem=" + mb(freemem()) + "MB loadavg=" + loadavg().map((n) => n.toFixed(2)).join(",") + ")"
  );
}
function startStreamingLoops() {
  flushInterval = setInterval(() => {
    void flushStreaming().then(enforceTurnLease);
  }, 150);
  lastHeartbeatTickAt = Date.now();
  heartbeatInterval = setInterval(() => {
    logEventLoopStall(Date.now());
    void heartbeatPing().then(enforceTurnLease);
  }, HEARTBEAT_TICK_MS);
}
async function stopStreamingLoops() {
  if (callbackState.streamingLoopsStopped) return;
  callbackState.streamingLoopsStopped = true;
  if (flushInterval) clearInterval(flushInterval);
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  await flushStreaming();
}
var LEASE_EXIT_GRACE_MS = 500;
var leaseExitScheduled = false;
function enforceTurnLease() {
  const decision = decideTurnLeaseExit({
    terminalReason: getLeaseTerminalReason(),
    exitScheduled: leaseExitScheduled
  });
  if (decision.action === "continue") return false;
  if (decision.action === "wait") return true;
  leaseExitScheduled = true;
  log("exiting: turn lease terminal (" + decision.reason + ")");
  if (flushInterval) clearInterval(flushInterval);
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  callbackState.streamingLoopsStopped = true;
  if (decision.reason !== "superseded") {
    log(
      "persisting turn work before lease-terminal exit (" + decision.reason + ")"
    );
    persistTurnWork();
  }
  setTimeout(() => process.exit(0), LEASE_EXIT_GRACE_MS).unref();
  return true;
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
      writeFileSync7(READY_FILE, String(Date.now()));
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
    void flushStreaming();
  }
}
function handleRealtimeStreamLine(line) {
  const parsed = tryParseJson(line);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return;
  }
  getProviderAdapter(PROVIDER).onStreamLine(line, parsed);
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
import { dirname } from "path";

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
    if (toolName !== "AskUserQuestion") {
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

// callback-src/providers/claudeResult.ts
function isZeroWorkTaskNotificationResult(message) {
  const origin = message.origin;
  return message.type === "result" && message.subtype === "success" && message.is_error !== true && message.num_turns === 0 && typeof message.result === "string" && message.result.trim() === "" && typeof origin === "object" && origin !== null && !Array.isArray(origin) && origin.kind === "task-notification";
}

// callback-src/providers/claudeSdk.ts
var SDK_PACKAGE = "@anthropic-ai/claude-agent-sdk";
var SDK_VERSION = "0.3.258";
async function readSdkPlanUsage(handle) {
  if (typeof handle.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET !== "function") {
    log("usage limits: this SDK query handle exposes no usage method");
    return null;
  }
  if (typeof handle.initializationResult === "function") {
    try {
      await handle.initializationResult();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      log("usage limits: initialization wait failed \\u2014 " + messageText);
    }
  }
  return await handle.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET();
}
var cachedGlobalNpmRoots = null;
function globalNpmRoots() {
  if (cachedGlobalNpmRoots !== null) return cachedGlobalNpmRoots;
  const roots = [
    dirname(dirname(process.execPath)) + "/lib/node_modules"
  ];
  try {
    const npmRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    if (npmRoot) roots.push(npmRoot);
  } catch {
  }
  cachedGlobalNpmRoots = roots.filter(
    (root, index) => roots.indexOf(root) === index
  );
  return cachedGlobalNpmRoots;
}
var SDK_LOCAL_PREFIX = "/home/eva/.eva-agent-sdk";
function installedPackageVersion(packageRoot) {
  try {
    const manifest = JSON.parse(
      readFileSync5(packageRoot + "/package.json", "utf8")
    );
    if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
      return null;
    }
    const version = manifest.version;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}
function resolvePinnedSdkEntry(pin) {
  const localRoot = SDK_LOCAL_PREFIX + "/node_modules/" + pin.packageName;
  let driftedVersion = null;
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
      "sdk version drift: global " + pin.packageName + " is " + driftedVersion + ", need " + pin.version + "; falling back to the pinned user-local copy"
    );
  }
  if (installedPackageVersion(localRoot) !== pin.version) {
    log(
      "installing " + pin.packageName + "@" + pin.version + " to " + SDK_LOCAL_PREFIX
    );
    execSync(
      "mkdir -p " + SDK_LOCAL_PREFIX + " && npm install --prefix " + SDK_LOCAL_PREFIX + " " + pin.packageName + "@" + pin.version,
      { encoding: "utf8", timeout: 18e4 }
    );
  }
  return localRoot + pin.entryRelPath;
}
function sdkMessageJson(serialized) {
  const parsed = tryParseJson(serialized);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  return parsed;
}
async function loadSdk() {
  const mod = await import(resolvePinnedSdkEntry({
    packageName: SDK_PACKAGE,
    version: SDK_VERSION,
    entryRelPath: "/sdk.mjs"
  }));
  return mod;
}
var CLAUDE_CODE_PACKAGE = "@anthropic-ai/claude-code";
function globalClaudeCliVersion() {
  for (const root of globalNpmRoots()) {
    const version = installedPackageVersion(root + "/" + CLAUDE_CODE_PACKAGE);
    if (version !== null) return version;
  }
  return null;
}
function claudeExecutablePath() {
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
      "cli version drift: global claude is " + (globalVersion ?? "unknown") + ", need " + pinned + "; preferring the pinned fallback install"
    );
  }
  if (fallback && existsSync6(fallback)) {
    const fallbackRoot = dirname(dirname(fallback)) + "/lib/node_modules/" + CLAUDE_CODE_PACKAGE;
    const fallbackVersion = installedPackageVersion(fallbackRoot);
    if (pinned === null || fallbackVersion === pinned) return fallback;
    log(
      "cli version drift: fallback claude is " + (fallbackVersion ?? "unknown") + ", need " + pinned + "; no pinned binary available"
    );
    if (!globalBin) return fallback;
  }
  return globalBin || "claude";
}
function readPromptText() {
  return readFileSync5("/tmp/design-prompt.txt", "utf8");
}
function buildSdkOptions(sessionMode) {
  const extraArgs = { settings: settingsJson };
  return buildSdkOptionsFromParts(sessionMode, extraArgs);
}
var EVA_SDK_SYSTEM_APPEND = "You are running inside Eva, a platform that runs coding agents in remote sandboxes against GitHub repos. Treat the workspace as the active repo checkout.";
function buildSdkOptionsFromParts(sessionMode, extraArgs, tools = "agent") {
  const allowedToolsOption = tools === "agent" && ALLOWED_TOOLS ? { allowedTools: ALLOWED_TOOLS.split(",") } : { allowedTools: [] };
  const permissionOption = tools === "agent" && BLOCKING_QUESTIONS_ENABLED ? {
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
  const thinkingOption = claudeThinkingDisabled ? {} : { thinking: { type: "adaptive", display: "summarized" } };
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
    ...Object.keys(evaMcpServers).length > 0 ? { mcpServers: evaMcpServers } : {},
    ...effortOption,
    ...thinkingOption
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
  let resultErrorMessage = "";
  let queryErrorMessage = "";
  let sawZeroWorkTaskNotification = false;
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
    if (callbackState.inFlightToolUses > 0) {
      lastMessageAt = now;
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
      const json = sdkMessageJson(line);
      if (json !== null && isZeroWorkTaskNotificationResult(json)) {
        sawZeroWorkTaskNotification = true;
        log("runClaudeSdkAttempt: ignored zero-work task notification result");
        continue;
      }
      appendToRawLogFile(line);
      attemptOutput = trimBufferHead(attemptOutput + line);
      appendToRawOutput(line);
      processRealtimeStdoutChunk(line);
      if (message.type === "result") {
        sawResult = true;
        resultIsError = message.is_error === true;
        if (resultIsError) {
          resultErrorMessage = message.subtype === "success" ? message.result : message.errors.join("\\n");
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
          "runClaudeSdkAttempt: retrying prompt after zero-work task notification"
        );
        sawZeroWorkTaskNotification = false;
        q = sdk.query({
          prompt: readPromptText(),
          options: buildSdkOptions(effectiveMode)
        });
        await consumeQuery();
      }
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
  startClaudeUsageReport({
    readUsage: () => readSdkPlanUsage(q),
    error: resultErrorMessage || queryErrorMessage || void 0
  });
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

// callback-src/runtime/turnAttachments.ts
import { writeFileSync as writeFileSync8 } from "fs";
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
      return type.startsWith("image/") ? ".png" : ".bin";
  }
}
async function materializeTurnAttachments(turn) {
  if (turn.attachmentUrls.length === 0) return;
  const paths2 = [];
  for (let index = 0; index < turn.attachmentUrls.length; index++) {
    const url = turn.attachmentUrls[index];
    if (!url) continue;
    try {
      const response = await fetchWithTimeout(url, { method: "GET" });
      if (!response.ok) {
        log(\`daemon: attachment download failed status=\${response.status}\`);
        continue;
      }
      const path3 = \`/tmp/eva-attachment-\${index}\${attachmentExtensionForMimeType(
        response.headers.get("content-type") ?? ""
      )}\`;
      writeFileSync8(path3, new Uint8Array(await response.arrayBuffer()));
      paths2.push(path3);
    } catch (error) {
      log(
        \`daemon: attachment download error \${error instanceof Error ? error.message : String(error)}\`
      );
    }
  }
  if (paths2.length === 0) return;
  turn.prompt += "\\n\\n---\\nThe user attached the following file(s). Read them with your file-reading tool before responding:\\n" + paths2.map((path3) => \`- \${path3}\`).join("\\n");
}

// callback-src/providers/githubToken.ts
function tokenFromActionResponse(data) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  const value = data.value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return typeof value.token === "string" ? value.token : null;
}
async function fetchInstallationToken(params) {
  try {
    const fetchFn = params.fetchFn ?? fetchWithTimeout;
    const response = await fetchFn(params.convexUrl + "/api/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + params.convexToken
      },
      body: JSON.stringify({
        path: "github:getInstallationTokenAction",
        args: { repoId: params.repoId },
        format: "json"
      })
    });
    if (!response.ok) return { token: null };
    const token = tokenFromActionResponse(await readResponseJson(response));
    return token ? { token } : { token: null };
  } catch {
    return { token: null };
  }
}
function applyGithubTokenToEnv(env, token) {
  env.GITHUB_TOKEN = token;
  env.GH_TOKEN = token;
}
async function ensureGithubToken(params) {
  const convexUrl = params.convexUrl;
  const convexToken = params.convexToken;
  const repoId = params.repoId;
  if (!convexUrl || !convexToken || !repoId) {
    return { refreshed: false };
  }
  const result = await fetchInstallationToken({
    convexUrl,
    convexToken,
    repoId,
    fetchFn: params.fetchFn
  });
  if (result.token === null) return { refreshed: false };
  applyGithubTokenToEnv(params.env ?? process.env, result.token);
  return { refreshed: true };
}

// callback-src/runtime/daemonSupervisor.ts
var DaemonSupervisor = class {
  active = { phase: "idle" };
  pendingClaimValue = null;
  shutdown = "active";
  get phase() {
    return this.active.phase;
  }
  get currentTurn() {
    switch (this.active.phase) {
      case "running":
      case "starting":
      case "cancelling":
      case "finalizing":
        return this.active.turn;
      case "idle":
      case "opening_synthetic":
        return null;
    }
  }
  get pendingClaim() {
    return this.pendingClaimValue;
  }
  get isStopping() {
    return this.shutdown === "stopping";
  }
  get isCancellationInFlight() {
    return this.active.phase === "cancelling";
  }
  get hasWork() {
    return this.active.phase !== "idle" || this.pendingClaimValue !== null;
  }
  beginSyntheticOpen() {
    if (this.active.phase !== "idle") return false;
    this.active = { phase: "opening_synthetic" };
    return true;
  }
  abandonSyntheticOpen() {
    if (this.active.phase === "opening_synthetic") {
      this.active = { phase: "idle" };
    }
  }
  parkClaim(claim) {
    if (this.pendingClaimValue !== null) return false;
    this.pendingClaimValue = claim;
    return true;
  }
  takeClaim() {
    const claim = this.pendingClaimValue;
    this.pendingClaimValue = null;
    return claim;
  }
  startTurn(turn) {
    if (this.active.phase !== "idle" && this.active.phase !== "opening_synthetic") {
      return false;
    }
    this.active = { phase: "running", turn };
    return true;
  }
  beginStarting(turn) {
    if (this.active.phase !== "idle") return false;
    this.active = { phase: "starting", turn };
    return true;
  }
  markRunning(turn) {
    if (this.active.phase !== "starting") return false;
    this.active = { phase: "running", turn };
    return true;
  }
  beginCancellation() {
    if (this.active.phase !== "running") return false;
    this.active = { phase: "cancelling", turn: this.active.turn };
    return true;
  }
  beginFinalizing() {
    if (this.active.phase !== "running") return false;
    this.active = { phase: "finalizing", turn: this.active.turn };
    return true;
  }
  settleTurn() {
    if (this.active.phase !== "opening_synthetic") {
      this.active = { phase: "idle" };
    }
  }
  noticeRefresh() {
    if (this.shutdown === "active") this.shutdown = "refresh_pending";
  }
  stop() {
    this.shutdown = "stopping";
  }
  decideRefresh(input) {
    if (this.shutdown === "stopping") return { action: "exit" };
    if (this.shutdown !== "refresh_pending") return { action: "continue" };
    if (input.watchedTurnActive) {
      return { action: "defer", blocker: "watched turn" };
    }
    if (this.active.phase === "opening_synthetic") {
      return { action: "defer", blocker: "synthetic turn opening" };
    }
    if (this.active.phase !== "idle") {
      return { action: "defer", blocker: this.active.phase };
    }
    if (this.pendingClaimValue !== null) {
      return { action: "defer", blocker: "claimed turn" };
    }
    if (input.backgroundAgentCount > 0) {
      return { action: "defer", blocker: "background agent" };
    }
    if (input.sdkMessagePending) {
      return { action: "defer", blocker: "queued SDK message" };
    }
    return { action: "exit" };
  }
};

// callback-src/providers/claimPendingTurnParse.ts
function claimPayload(result) {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    return null;
  }
  const inner = result.value;
  return typeof inner === "object" && inner !== null && !Array.isArray(inner) ? inner : result;
}
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
  const payload = claimPayload(result);
  if (!payload) return false;
  return payload.cancelRequested === true;
}
function readUsageRefreshRequested(result) {
  const payload = claimPayload(result);
  if (!payload) return false;
  return payload.usageRefreshRequested === true;
}
function readTurnLeaseIdentity(result) {
  const payload = claimPayload(result);
  if (!payload) return null;
  const turnId = payload.turnId;
  const leaseGeneration = payload.leaseGeneration;
  if (typeof turnId !== "string" || typeof leaseGeneration !== "number" || !Number.isSafeInteger(leaseGeneration) || leaseGeneration <= 0) {
    return null;
  }
  return { turnId, leaseGeneration };
}

// callback-src/providers/claimedTurnLifecycle.ts
function claimPayload2(result) {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    return null;
  }
  const inner = result.value;
  return typeof inner === "object" && inner !== null && !Array.isArray(inner) ? inner : result;
}
function readClaimedTurn(result) {
  const payload = claimPayload2(result);
  if (!payload || typeof payload.prompt !== "string") return null;
  const lifecycle = payload.turnLifecycle;
  if (lifecycle !== void 0 && lifecycle !== "legacy" && lifecycle !== "durable") {
    throw new Error("Claimed turn returned an invalid lifecycle discriminator");
  }
  const attachmentUrls = Array.isArray(payload.attachmentUrls) ? payload.attachmentUrls.filter(
    (url) => typeof url === "string"
  ) : [];
  const interactionMode = "default";
  const turnLease = readTurnLeaseIdentity(result);
  if (lifecycle === "durable" && turnLease === null) {
    throw new Error("Durable claimed turn did not include a lease identity");
  }
  if (lifecycle === "legacy" && turnLease !== null) {
    throw new Error("Legacy claimed turn unexpectedly included a lease identity");
  }
  if (turnLease !== null) {
    return {
      lifecycle: "durable",
      prompt: payload.prompt,
      attachmentUrls,
      interactionMode,
      turnLease
    };
  }
  return {
    lifecycle: "legacy",
    prompt: payload.prompt,
    attachmentUrls,
    interactionMode,
    turnLease: null
  };
}
function startClaimedTurn(turn) {
  if (claimedTurnLifecycleStatus() === "active") {
    throw new Error("Cannot start a claimed turn while another claim is active");
  }
  beginTurnOwnership("claim", turn.turnLease);
  beginTurnCheckpoint();
}
function appendClaimedTurnCompletion(args) {
  const ownership = getTurnOwnership();
  if (ownership.status !== "owned" || ownership.owner !== "claim") {
    throw new Error("Cannot complete a claimed turn before it starts");
  }
  if (ownership.turnLease !== null) {
    args.turnId = ownership.turnLease.turnId;
    args.leaseGeneration = ownership.turnLease.leaseGeneration;
  }
}
function finishClaimedTurn() {
  endTurnOwnership();
  resetTurnCheckpoint();
}
function claimedTurnLifecycleStatus() {
  const ownership = getTurnOwnership();
  return ownership.status === "owned" && ownership.owner === "claim" ? "active" : "idle";
}
function shouldParkClaimedTurn(input) {
  if (!input.hasActiveRealTurn || input.isCancellationInFlight) return true;
  if (input.isFinalizing) return true;
  return input.claimedLeaseTurnId !== null && input.claimedLeaseTurnId !== input.currentLeaseTurnId;
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
var PROMPT_POLL_IDLE_INTERVAL_MS = 1e3;
var PROMPT_POLL_FAST_WINDOW_MS = 3e4;
var NO_MESSAGE_TIMEOUT_MS = NO_OUTPUT_TIMEOUT_MS * 5;
var WATCHDOG_TICK_MS = 5e3;
var CANCEL_SETTLE_TIMEOUT_MS = 3e4;
var turnActive = false;
var turnStartedAtMs = 0;
var lastMessageAtMs = 0;
var supervisor = new DaemonSupervisor();
var callbackRefreshDeferralLogged = false;
var lastIdleActivityAtMs = Date.now();
var agentTurnOutput = "";
var agentTurnStartedAt = 0;
var sawFirstMessageThisTurn = { value: false };
var sawAssistantThisTurn = { value: false };
var turnCancelRequestedAtMs = 0;
var recognisedSubagentToolUseIds = /* @__PURE__ */ new Set();
var settledSubagentToolUseIds = /* @__PURE__ */ new Set();
var unsettledBackgroundAgents = /* @__PURE__ */ new Map();
var pendingAgentStops = /* @__PURE__ */ new Set();
var currentAgentRunner = null;
var usageRefreshInFlight = false;
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
async function failTurnAndExit(error) {
  log("daemon: failing turn \\u2014 " + error);
  persistTurnWork();
  try {
    const completionArgs = {
      [ENTITY_ID_FIELD ?? "sessionId"]: ENTITY_ID ?? "",
      success: false,
      result: null,
      error,
      activityLog: serializeSteps(callbackState.accumulatedSteps),
      ...RUN_ID ? { runId: RUN_ID } : {}
    };
    appendClaimedTurnCompletion(completionArgs);
    appendTurnCheckpoint(completionArgs);
    await callConvexWithRetry(
      "mutation",
      COMPLETION_MUTATION ?? "",
      completionArgs
    );
  } catch {
  }
  if (readDaemonPidFile() === process.pid) {
    try {
      unlinkSync(DAEMON_PID_FILE);
    } catch {
    }
  }
  await stopStreamingLoops();
  process.exit(1);
}
async function exitWithoutCompletion(reason) {
  log("daemon: exiting without completion \\u2014 " + reason);
  persistTurnWork();
  if (readDaemonPidFile() === process.pid) {
    try {
      unlinkSync(DAEMON_PID_FILE);
    } catch {
    }
  }
  await stopStreamingLoops();
}
function startTurnWatchdog() {
  const timer = setInterval(() => {
    const now = Date.now();
    if (supervisor.isCancellationInFlight) {
      if (now - turnCancelRequestedAtMs > CANCEL_SETTLE_TIMEOUT_MS) {
        log("daemon: cancelled turn did not settle in time \\u2014 exiting");
        persistTurnWork();
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
    if (callbackState.inFlightToolUses > 0) {
      lastMessageAtMs = now;
    }
    if (now - turnStartedAtMs > MAX_TOTAL_RUNTIME_MS) {
      turnActive = false;
      if (supervisor.currentTurn?.kind === "synthetic") {
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
      if (supervisor.currentTurn?.kind === "synthetic") {
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
async function refreshGithubToken() {
  await ensureGithubToken({
    convexUrl: CONVEX_URL,
    convexToken: CONVEX_TOKEN,
    repoId: REPO_ID
  });
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
}
async function finalizeTurn(output, readUsage) {
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
  appendClaimedTurnCompletion(completionArgs);
  if (await setFinalizingState()) return;
  persistTurnWork();
  const completionSentAt = Date.now();
  await deliverCompletionWithMedia(completionArgs);
  finishClaimedTurn();
  log(
    "daemon: turn finalized success=" + success + " steps=" + activityLog.length + " (completion mutation " + (Date.now() - completionSentAt) + "ms)"
  );
  const bookkeepingAt = Date.now();
  syncClaudeStateToPersist("daemon-turn");
  void captureAndReportClaudeUsage({
    readUsage,
    error: resultEvent?.isError ? resultEvent.result : void 0
  });
  log(
    "daemon: post-turn bookkeeping took " + (Date.now() - bookkeepingAt) + "ms"
  );
}
function readSyntheticTurnMessageId(result) {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    return null;
  }
  const inner = result.value;
  const payload = typeof inner === "object" && inner !== null && !Array.isArray(inner) ? inner : result;
  const messageId = payload.messageId;
  return typeof messageId === "string" ? messageId : null;
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
var harnessCatalogReportStarted = false;
var CATALOG_MAX_COMMANDS = 100;
var CATALOG_MAX_NAME_LENGTH = 100;
var CATALOG_MAX_DESCRIPTION_LENGTH = 2e3;
var CATALOG_MAX_ARGUMENT_HINT_LENGTH = 400;
function collectLocalCommandNames() {
  const names = /* @__PURE__ */ new Set();
  for (const root of [WORK_DIR, homedir()]) {
    try {
      for (const entry of readdirSync3(root + "/.claude/skills", {
        withFileTypes: true
      })) {
        if (entry.isDirectory()) names.add(entry.name);
      }
    } catch {
    }
    try {
      for (const entry of readdirSync3(root + "/.claude/commands", {
        withFileTypes: true
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
function catalogDescription(description) {
  const firstLine = description.split("\\n").map((line) => line.trim()).find((line) => line.length > 0);
  return (firstLine ?? "").slice(0, CATALOG_MAX_DESCRIPTION_LENGTH);
}
async function reportHarnessSkillCatalog(cliVersion, query) {
  try {
    if (!HARNESS_CATALOG_TOKEN) return;
    if (typeof query.initializationResult !== "function") {
      log("daemon: initializationResult unavailable \\u2014 skipping skill report");
      return;
    }
    const init = await query.initializationResult();
    const localNames = collectLocalCommandNames();
    const commands = [];
    for (const command of init.commands) {
      if (localNames.has(command.name)) continue;
      if (command.name.length === 0) continue;
      if (command.name.length > CATALOG_MAX_NAME_LENGTH) continue;
      const argumentHint = (command.argumentHint ?? "").slice(
        0,
        CATALOG_MAX_ARGUMENT_HINT_LENGTH
      );
      commands.push({
        name: command.name,
        description: catalogDescription(command.description),
        ...argumentHint ? { argumentHint } : {}
      });
    }
    if (commands.length === 0) return;
    if (commands.length > CATALOG_MAX_COMMANDS) {
      log(
        "daemon: harness skill report truncated from " + commands.length + " to " + CATALOG_MAX_COMMANDS + " commands"
      );
      commands.length = CATALOG_MAX_COMMANDS;
    }
    await callHarnessSkillCatalogReport("claude", cliVersion, commands);
    log(
      "daemon: reported " + commands.length + " built-in skills from CLI " + cliVersion
    );
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    log("daemon: harness skill report failed \\u2014 " + messageText);
  }
}
function noteHarnessInitMessage(message, query) {
  if (harnessCatalogReportStarted) return;
  if (message.type !== "system" || message.subtype !== "init") return;
  const cliVersion = readStringField2(message, "claude_code_version");
  if (!cliVersion) return;
  harnessCatalogReportStarted = true;
  void reportHarnessSkillCatalog(cliVersion, query);
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
  const turn = supervisor.currentTurn;
  if (turn?.kind !== "synthetic") {
    return;
  }
  log("daemon: failing synthetic turn \\u2014 " + error);
  const messageId = turn.messageId;
  persistTurnWork();
  try {
    await flushStreaming();
    for (const step of callbackState.accumulatedSteps) {
      step.status = "complete";
    }
    const turnLease = getCurrentTurnLease();
    const completionArgs = entityMutationArgs({
      messageId,
      success: false,
      result: null,
      error,
      activityLog: serializeSteps(callbackState.accumulatedSteps),
      ...turnLease
    });
    appendTurnCheckpoint(completionArgs);
    await callConvexWithRetry(
      "mutation",
      COMPLETE_SYNTHETIC_TURN_MUTATION ?? "",
      completionArgs
    );
  } catch {
  }
  endWatchedTurn();
  resetTurnState();
  endTurnOwnership();
  supervisor.settleTurn();
  agentTurnOutput = "";
}
async function ensureSyntheticTurn() {
  if (!supervisor.beginSyntheticOpen()) return;
  try {
    const result = await callConvexWithRetry(
      "mutation",
      OPEN_SYNTHETIC_TURN_MUTATION ?? "",
      // This daemon's own model, so the server stamps the synthetic reply's
      // provider checkpoint from what actually ran the turn — the sticky
      // composer pick can move to another provider while this turn is open.
      entityMutationArgs({ model: MODEL })
    );
    const messageId = readSyntheticTurnMessageId(result);
    if (messageId === null) {
      log("daemon: openSyntheticTurn returned no messageId");
      return;
    }
    resetTurnState();
    beginTurnOwnership("provider", readTurnLeaseIdentity(result));
    beginTurnCheckpoint();
    if (!supervisor.startTurn({ kind: "synthetic", messageId })) {
      log("daemon: synthetic turn opened after lifecycle moved; ignoring");
      endTurnOwnership();
      return;
    }
    agentTurnStartedAt = Date.now();
    sawFirstMessageThisTurn = { value: false };
    sawAssistantThisTurn = { value: false };
    callbackState.activeAttemptStartedAt = agentTurnStartedAt;
    beginWatchedTurn();
    log("daemon: synthetic turn opened messageId=" + messageId);
  } finally {
    supervisor.abandonSyntheticOpen();
  }
}
async function finalizeSyntheticTurn(output) {
  const turn = supervisor.currentTurn;
  if (turn?.kind !== "synthetic") {
    return;
  }
  supervisor.beginFinalizing();
  const messageId = turn.messageId;
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
  const turnLease = getCurrentTurnLease();
  if (turnLease) {
    completionArgs.turnId = turnLease.turnId;
    completionArgs.leaseGeneration = turnLease.leaseGeneration;
  }
  persistTurnWork();
  appendTurnCheckpoint(completionArgs);
  await callConvexWithRetry(
    "mutation",
    COMPLETE_SYNTHETIC_TURN_MUTATION ?? "",
    completionArgs
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
async function startRealAgentTurn(turn, agentRunner) {
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
  callbackState.activeAttemptStartedAt = agentTurnStartedAt;
  agentTurnOutput = "";
  log("daemon: real turn started");
}
function handleCancelRequested(agentRunner) {
  if (supervisor.currentTurn === null) {
    log("daemon: cancelRequested with no active turn \\u2014 ignored");
    return;
  }
  if (!supervisor.beginCancellation()) return;
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
    while (!supervisor.isStopping) {
      if (callbackScriptWentStaleOnDisk()) {
        supervisor.noticeRefresh();
      }
      const refreshDecision = supervisor.decideRefresh({
        watchedTurnActive: turnActive,
        backgroundAgentCount: unsettledBackgroundAgents.size,
        sdkMessagePending: agentRunner.hasPending()
      });
      if (refreshDecision.action === "defer") {
        if (!callbackRefreshDeferralLogged) {
          log(
            "daemon: callback script updated on disk \\u2014 deferring respawn until active work settles (" + refreshDecision.blocker + ")"
          );
          callbackRefreshDeferralLogged = true;
        }
        await sleep2(PROMPT_POLL_INTERVAL_MS);
        continue;
      }
      if (refreshDecision.action === "exit") {
        log("daemon: callback script updated on disk \\u2014 exiting for respawn");
        supervisor.stop();
        process.exit(0);
      }
      const acceptTurn = supervisor.phase === "idle" && supervisor.pendingClaim === null;
      try {
        const claimed = await callConvexWithRetry(
          "mutation",
          CLAIM_MUTATION ?? "",
          entityMutationArgs({ model: MODEL, acceptTurn })
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
          log("daemon: usage refresh requested \\u2014 reading SDK plan usage");
          const report = captureAndReportClaudeUsage({
            readUsage: agentRunner.readUsage,
            force: true
          });
          void report.finally(() => {
            usageRefreshInFlight = false;
          });
        }
        const turn = readClaimedTurn(claimed);
        if (turn !== null) {
          await materializeTurnAttachments(turn);
          lastIdleActivityAtMs = Date.now();
          const currentTurn = supervisor.currentTurn;
          const currentLease = getCurrentTurnLease();
          if (shouldParkClaimedTurn({
            hasActiveRealTurn: currentTurn?.kind === "real",
            isCancellationInFlight: supervisor.isCancellationInFlight,
            isFinalizing: false,
            currentLeaseTurnId: currentLease?.turnId ?? null,
            claimedLeaseTurnId: turn.turnLease?.turnId ?? null
          })) {
            if (!supervisor.parkClaim(turn)) {
              log("daemon: duplicate claimed turn ignored");
            }
          } else {
            log(
              "daemon: claim discarded while real turn active (prompt lost; pendingTurn was already cleared)"
            );
          }
        }
      } catch {
      }
      const turnInFlight = supervisor.hasWork;
      const recentlyActive = Date.now() - lastIdleActivityAtMs < PROMPT_POLL_FAST_WINDOW_MS;
      await sleep2(
        turnInFlight || recentlyActive ? PROMPT_POLL_INTERVAL_MS : PROMPT_POLL_IDLE_INTERVAL_MS
      );
    }
  })();
}
async function runDaemonMessagePump(agentRunner) {
  while (!supervisor.isStopping) {
    if (supervisor.currentTurn === null && supervisor.pendingClaim !== null) {
      const turn = supervisor.takeClaim();
      if (turn === null) continue;
      await startRealAgentTurn(turn, agentRunner);
      continue;
    }
    if (!supervisor.hasWork && unsettledBackgroundAgents.size === 0 && Date.now() - lastIdleActivityAtMs > IDLE_EXIT_MS) {
      log("daemon: idle timeout \\u2014 exiting");
      return;
    }
    if (supervisor.currentTurn === null && !agentRunner.hasPending()) {
      await sleep2(PROMPT_POLL_INTERVAL_MS);
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
      log("daemon: result with no live turn \\u2014 ignored");
      continue;
    }
    if (isZeroWorkTaskNotificationResult(message)) {
      log(
        "daemon: zero-work task notification result ignored; active turn preserved"
      );
      continue;
    }
    if (supervisor.currentTurn === null) {
      if (!shouldMintSyntheticTurn(message)) {
        const messageType = typeof message.type === "string" ? message.type : "?";
        log(
          "daemon: between-turn " + messageType + " consumed without minting a synthetic turn"
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
    if (supervisor.currentTurn?.kind === "synthetic") {
      await finalizeSyntheticTurn(agentTurnOutput);
    } else {
      supervisor.beginFinalizing();
      await finalizeTurn(agentTurnOutput, agentRunner.readUsage);
      log(
        "daemon[timing]: finalizeTurn took " + (Date.now() - resultAt) + "ms"
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
        const message = sdkMessageJson(JSON.stringify(raw));
        if (message === null) continue;
        noteHarnessInitMessage(message, query);
        pending.push(message);
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
  const setPermissionMode = async (mode) => {
    if (typeof query.setPermissionMode !== "function") {
      log("daemon: setPermissionMode unavailable on SDK query handle");
      return;
    }
    try {
      await query.setPermissionMode(mode === "plan" ? "plan" : "default");
      log("daemon: permission mode set to " + mode);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("daemon: setPermissionMode failed \\u2014 " + message);
    }
  };
  const readUsage = () => readSdkPlanUsage(query);
  return {
    push,
    waitMessage,
    drainPending,
    hasPending,
    stopTask,
    interrupt,
    readUsage,
    setPermissionMode
  };
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
    if (supervisor.hasWork) {
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
  await refreshGithubToken();
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
    persistTurnWork();
    try {
      const completionArgs = {
        [ENTITY_ID_FIELD ?? "sessionId"]: ENTITY_ID ?? "",
        success: false,
        result: null,
        error: "Agent SDK daemon failed: " + messageText,
        activityLog: serializeSteps(callbackState.accumulatedSteps),
        ...getCurrentTurnLease()
      };
      appendTurnCheckpoint(completionArgs);
      await callConvexWithRetry(
        "mutation",
        COMPLETION_MUTATION ?? "",
        completionArgs
      );
    } catch {
    }
  } finally {
    if (readDaemonPidFile() === process.pid) {
      try {
        unlinkSync(DAEMON_PID_FILE);
        unlinkSync(DAEMON_ENTITY_FILE);
        unlinkSync(DAEMON_OPTS_FILE);
        if (ENTITY_ID_FIELD === "sessionId") {
          const legacy = resolveLegacySessionDaemonPaths();
          try {
            unlinkSync(legacy.pid);
          } catch {
          }
          try {
            unlinkSync(legacy.entity);
          } catch {
          }
          try {
            unlinkSync(legacy.opts);
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

// callback-src/providers/codexAppServerDaemon.ts
import { readFileSync as readFileSync7, unlinkSync as unlinkSync2, writeFileSync as writeFileSync10 } from "fs";

// callback-src/providers/codexAppServerClient.ts
import { spawn } from "child_process";
import { existsSync as existsSync7 } from "fs";
import { createInterface } from "readline";
function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function responseErrorMessage(message) {
  const error = objectValue(message.error);
  return typeof error.message === "string" ? error.message : "Codex App Server request failed";
}
var CodexAppServerClient = class {
  child = null;
  nextId = 1;
  pending = /* @__PURE__ */ new Map();
  notifications = [];
  terminalError = null;
  start() {
    const command = existsSync7(CODEX_BIN_PATH) ? CODEX_BIN_PATH : "codex";
    this.child = spawn(command, ["app-server"], {
      cwd: WORK_DIR,
      env: { ...process.env, CODEX_HOME: CODEX_RUNTIME_HOME_DIR },
      stdio: ["pipe", "pipe", "pipe"]
    });
    const stdout = createInterface({ input: this.child.stdout });
    stdout.on("line", (line) => this.handleLine(line));
    this.child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8").trim();
      if (text) log("codex app-server stderr: " + text);
    });
    this.child.on("error", (error) => this.fail(error));
    this.child.on("exit", (code, signal) => {
      this.fail(
        new Error(
          "Codex App Server exited (code=" + String(code) + ", signal=" + String(signal ?? "none") + ")"
        )
      );
    });
  }
  async initialize() {
    await this.request("initialize", {
      clientInfo: { name: "eva", title: "Eva", version: "1.0.0" }
    });
    this.notify("initialized", {});
  }
  request(method, params) {
    if (this.terminalError) return Promise.reject(this.terminalError);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Codex App Server request timed out: " + method));
      }, 9e4);
      this.pending.set(id, { resolve, reject, timeout });
      this.write({ id, method, params });
    });
  }
  notify(method, params) {
    this.write({ method, params });
  }
  drainNotifications() {
    const drained = this.notifications;
    this.notifications = [];
    return drained;
  }
  hasNotifications() {
    return this.notifications.length > 0;
  }
  getError() {
    return this.terminalError;
  }
  stop() {
    this.child?.kill("SIGTERM");
  }
  write(message) {
    if (!this.child || !this.child.stdin.writable) {
      throw this.terminalError ?? new Error("Codex App Server is not running");
    }
    this.child.stdin.write(JSON.stringify(message) + "\\n");
  }
  handleLine(line) {
    const parsed = tryParseJson(line);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    const message = parsed;
    if (typeof message.id === "number" && typeof message.method !== "string") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error !== void 0) {
        pending.reject(new Error(responseErrorMessage(message)));
      } else {
        pending.resolve(message.result ?? null);
      }
      return;
    }
    if (typeof message.method !== "string") return;
    if (typeof message.id === "number") {
      this.write({
        id: message.id,
        error: {
          code: -32601,
          message: "Eva does not handle App Server requests: " + message.method
        }
      });
      return;
    }
    this.notifications.push({
      method: message.method,
      params: objectValue(message.params)
    });
  }
  fail(error) {
    if (this.terminalError) return;
    this.terminalError = error;
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    this.pending.clear();
  }
};

// callback-src/providers/codexAppServerDaemon.ts
var IDLE_EXIT_MS2 = 45 * 60 * 1e3;
var POLL_INTERVAL_MS2 = 50;
var FENCE_POLL_INTERVAL_MS2 = 5e3;
var NO_EVENT_TIMEOUT_MS = 5 * 60 * 1e3;
var paths = resolveDaemonPaths();
var supervisor2 = new DaemonSupervisor();
var activeTurnStartedAt = 0;
var lastEventAt = 0;
var lastIdleActivityAt = Date.now();
var finalText = "";
var exitWithError = false;
var threadTotalUsage = null;
var turnStartUsage = null;
function sleep3(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function objectValue2(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function stringField(value, field) {
  const object = objectValue2(value);
  return typeof object[field] === "string" ? object[field] : "";
}
function nestedId(value, field) {
  return stringField(objectValue2(value)[field], "id");
}
function entityArgs(fields) {
  return { [ENTITY_ID_FIELD ?? "sessionId"]: ENTITY_ID ?? "", ...fields };
}
function pidAlive2(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function readOwnerPid() {
  try {
    return Number(readFileSync7(paths.pid, "utf8").trim());
  } catch {
    return Number.NaN;
  }
}
function callbackWentStale() {
  if (!CALLBACK_SCRIPT_FP) return false;
  try {
    return readFileSync7("/tmp/eva-callback-fp", "utf8").trim() !== CALLBACK_SCRIPT_FP;
  } catch {
    return false;
  }
}
function resetTurnState2() {
  callbackState.accumulatedSteps.length = 0;
  callbackState.currentStreamedContent = "";
  callbackState.streamedAssistantTextThisMessage = false;
  callbackState.pendingParagraphBreak = false;
  callbackState.resultEventSeen = false;
  callbackState.rawOutput = "";
  callbackState.lastProcessed = 0;
  callbackState.realtimeOutputBuffer = "";
  callbackState.inFlightToolUses = 0;
  callbackState.codexToolItemIds.clear();
  callbackState.pendingQuestionData = "";
  callbackState.todoState.length = 0;
  callbackState.lastStepType = "thinking";
  activeTurnStartedAt = 0;
  finalText = "";
}
function emitEvent(event) {
  const line = JSON.stringify(event) + "\\n";
  appendToRawLogFile(line);
  appendToRawOutput(line);
  processRealtimeStdoutChunk(line);
}
function normalizeAppServerNotification(notification) {
  const { method, params } = notification;
  if (method === "turn/started") return { type: "turn.started" };
  if (method === "turn/completed") return { type: "turn.completed" };
  if (method === "item/started") {
    return { type: "item.started", item: objectValue2(params.item) };
  }
  if (method === "item/completed") {
    return { type: "item.completed", item: objectValue2(params.item) };
  }
  if (method === "item/agentMessage/delta" && typeof params.delta === "string") {
    return { type: "item.agent_message.delta", delta: params.delta };
  }
  if (method === "item/reasoning/textDelta" && typeof params.delta === "string") {
    return { type: "item.reasoning.delta", delta: params.delta };
  }
  if (method === "item/reasoning/summaryTextDelta" && typeof params.delta === "string") {
    return { type: "item.reasoning.delta", delta: params.delta };
  }
  return null;
}
function readTokenCount(source, key) {
  const value = source ? source[key] : 0;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function computeTurnUsageDelta(start, end) {
  if (!end) return null;
  const delta = (key) => Math.max(0, readTokenCount(end, key) - readTokenCount(start, key));
  return {
    inputTokens: delta("inputTokens"),
    cachedInputTokens: delta("cachedInputTokens"),
    cacheWriteInputTokens: delta("cacheWriteInputTokens"),
    outputTokens: delta("outputTokens")
  };
}
function turnError(params) {
  const turn = objectValue2(params.turn);
  const error = objectValue2(turn.error);
  return typeof error.message === "string" ? error.message : null;
}
async function finalizeTurn2(success, error) {
  await flushStreaming();
  for (const step of callbackState.accumulatedSteps) step.status = "complete";
  const result = finalText || callbackState.currentStreamedContent || callbackState.rawOutput;
  if (await setFinalizingState()) return;
  persistTurnWork();
  const usage = computeTurnUsageDelta(turnStartUsage, threadTotalUsage);
  const completionArgs = {
    [ENTITY_ID_FIELD ?? "sessionId"]: ENTITY_ID ?? "",
    success,
    result,
    error,
    activityLog: serializeSteps(callbackState.accumulatedSteps),
    ...RUN_ID ? { runId: RUN_ID } : {},
    ...usage ? {
      rawResultEvent: buildClaudeShapedResult({
        provider: "codex",
        totalCostUsd: computeCodexCostUsd(
          normalizedCodexModel,
          usage.inputTokens,
          usage.cachedInputTokens,
          usage.outputTokens
        ),
        durationMs: attemptElapsedMs(),
        inputTokens: Math.max(
          0,
          usage.inputTokens - usage.cachedInputTokens
        ),
        outputTokens: usage.outputTokens,
        cacheReadInputTokens: usage.cachedInputTokens,
        cacheCreationInputTokens: usage.cacheWriteInputTokens,
        model: normalizedCodexModel
      })
    } : {}
  };
  appendClaimedTurnCompletion(completionArgs);
  await deliverCompletionWithMedia(completionArgs);
  finishClaimedTurn();
  syncCodexStateToPersist();
  log("codex daemon: turn finalized success=" + success);
}
async function failActiveTurn(error) {
  if (supervisor2.currentTurn === null && activeTurnStartedAt === 0) return;
  supervisor2.beginFinalizing();
  try {
    await finalizeTurn2(false, error);
  } catch {
  }
  exitWithError = true;
  supervisor2.stop();
}
function processNotification(notification) {
  lastEventAt = Date.now();
  if (notification.method === "thread/tokenUsage/updated") {
    const total = objectValue2(
      objectValue2(notification.params.tokenUsage).total
    );
    if (Object.keys(total).length > 0) threadTotalUsage = total;
  }
  const event = normalizeAppServerNotification(notification);
  if (event) emitEvent(event);
  if (notification.method === "item/completed") {
    const item = objectValue2(notification.params.item);
    const text = getCodexAgentMessageText(item);
    if (text) finalText = text;
  }
  if (notification.method !== "turn/completed") return null;
  const turn = objectValue2(notification.params.turn);
  const status = typeof turn.status === "string" ? turn.status : "failed";
  lastIdleActivityAt = Date.now();
  if (supervisor2.isCancellationInFlight || status === "interrupted") {
    finishClaimedTurn();
    resetTurnState2();
    supervisor2.settleTurn();
    return null;
  }
  supervisor2.beginFinalizing();
  return finalizeTurn2(
    status === "completed",
    turnError(notification.params)
  ).then(() => {
    resetTurnState2();
    supervisor2.settleTurn();
  });
}
async function refreshGithubToken2() {
  await ensureGithubToken({
    convexUrl: CONVEX_URL,
    convexToken: CONVEX_TOKEN,
    repoId: REPO_ID
  });
}
async function establishThread(client, sessionMode) {
  if (sessionMode.sessionId) {
    try {
      const resumed = await client.request("thread/resume", {
        threadId: sessionMode.sessionId
      });
      const resumedId = nestedId(resumed, "thread") || sessionMode.sessionId;
      log("codex daemon: resumed thread " + resumedId);
      return resumedId;
    } catch (error) {
      log(
        "codex daemon: resume failed, starting fresh: " + (error instanceof Error ? error.message : String(error))
      );
    }
  }
  const started = await client.request("thread/start", {
    model: normalizedCodexModel,
    cwd: WORK_DIR,
    approvalPolicy: "never",
    serviceName: "eva"
  });
  const threadId = nestedId(started, "thread");
  if (!threadId) throw new Error("Codex App Server did not return a thread id");
  return threadId;
}
async function startTurn(client, turn) {
  resetTurnState2();
  if (!supervisor2.beginStarting({ providerTurnId: "" })) {
    throw new Error("Codex daemon could not enter starting state");
  }
  startClaimedTurn(turn);
  await materializeTurnAttachments(turn);
  const text = SYSTEM_PROMPT ? SYSTEM_PROMPT + "\\n\\n" + turn.prompt : turn.prompt;
  activeTurnStartedAt = Date.now();
  lastEventAt = activeTurnStartedAt;
  turnStartUsage = threadTotalUsage;
  const result = await client.request("turn/start", {
    threadId: callbackState.activeCodexThreadId,
    input: [{ type: "text", text }],
    cwd: WORK_DIR,
    model: normalizedCodexModel,
    approvalPolicy: "never",
    sandboxPolicy: { type: "externalSandbox", networkAccess: "enabled" },
    ...codexReasoningEffort ? { effort: codexReasoningEffort } : {}
  });
  const providerTurnId = nestedId(result, "turn");
  if (!providerTurnId)
    throw new Error("Codex App Server did not return a turn id");
  if (!supervisor2.markRunning({ providerTurnId })) {
    throw new Error("Codex daemon could not enter running state");
  }
  lastIdleActivityAt = activeTurnStartedAt;
  callbackState.activeAttemptStartedAt = activeTurnStartedAt;
  log("codex daemon: turn started " + providerTurnId);
}
function cleanMarkers() {
  if (readOwnerPid() !== process.pid) return;
  for (const path3 of [paths.pid, paths.entity, paths.opts]) {
    try {
      unlinkSync2(path3);
    } catch {
    }
  }
  if (ENTITY_ID_FIELD === "sessionId") {
    const legacy = resolveLegacySessionDaemonPaths();
    for (const path3 of [legacy.pid, legacy.entity, legacy.opts]) {
      try {
        unlinkSync2(path3);
      } catch {
      }
    }
  }
}
async function runCodexAppServerDaemon() {
  if (!CLAIM_MUTATION)
    throw new Error("CLAIM_MUTATION is required for Codex App Server mode");
  const rivalPid = readOwnerPid();
  if (!Number.isNaN(rivalPid) && rivalPid !== process.pid && pidAlive2(rivalPid)) {
    log("codex daemon: live rival already owns entity; exiting");
    process.exit(0);
  }
  writeFileSync10(paths.pid, String(process.pid));
  writeFileSync10(paths.entity, ENTITY_ID ?? "");
  writeFileSync10(paths.opts, DAEMON_OPTS_SIG);
  const fence = setInterval(() => {
    if (readOwnerPid() !== process.pid && !supervisor2.hasWork) {
      exitWithError = true;
      supervisor2.stop();
    }
  }, FENCE_POLL_INTERVAL_MS2);
  fence.unref?.();
  const preflightOk2 = await runPreflightHeartbeat();
  if (!preflightOk2) process.exit(1);
  startStreamingLoops();
  await refreshGithubToken2();
  const client = new CodexAppServerClient();
  try {
    const sessionMode = prepareCodexSessionState();
    client.start();
    await client.initialize();
    callbackState.activeCodexThreadId = await establishThread(client, sessionMode);
    writeCodexSessionState();
    syncCodexStateToPersist();
    emitEvent({ type: "thread.started", thread_id: callbackState.activeCodexThreadId });
    log("codex daemon: app-server ready thread=" + callbackState.activeCodexThreadId);
    while (!supervisor2.isStopping) {
      if (callbackWentStale()) supervisor2.noticeRefresh();
      const refreshDecision = supervisor2.decideRefresh({
        watchedTurnActive: supervisor2.currentTurn !== null,
        backgroundAgentCount: 0,
        sdkMessagePending: client.hasNotifications()
      });
      if (refreshDecision.action === "exit") break;
      const terminalError = client.getError();
      if (terminalError) throw terminalError;
      for (const notification of client.drainNotifications()) {
        const completion = processNotification(notification);
        if (completion) await completion;
      }
      const acceptTurn = supervisor2.phase === "idle" && supervisor2.pendingClaim === null;
      const claimed = await callConvexWithRetry(
        "mutation",
        CLAIM_MUTATION,
        entityArgs({ model: MODEL, acceptTurn })
      );
      const providerTurnId = supervisor2.currentTurn?.providerTurnId ?? "";
      if (readCancelRequested(claimed) && providerTurnId && supervisor2.beginCancellation()) {
        void client.request("turn/interrupt", {
          threadId: callbackState.activeCodexThreadId,
          turnId: providerTurnId
        }).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          log("codex daemon: interrupt failed \\u2014 " + message);
        });
      }
      const claimedTurn = readClaimedTurn(claimed);
      if (claimedTurn) {
        const currentLease = getCurrentTurnLease();
        if (shouldParkClaimedTurn({
          hasActiveRealTurn: supervisor2.currentTurn !== null,
          isCancellationInFlight: supervisor2.isCancellationInFlight,
          isFinalizing: false,
          currentLeaseTurnId: currentLease?.turnId ?? null,
          claimedLeaseTurnId: claimedTurn.turnLease?.turnId ?? null
        })) {
          if (!supervisor2.parkClaim(claimedTurn)) {
            log("codex daemon: duplicate claimed turn ignored");
          }
        } else {
          log(
            "codex daemon: claim discarded while real turn active (prompt lost; pendingTurn was already cleared)"
          );
        }
      }
      if (supervisor2.currentTurn === null && supervisor2.pendingClaim !== null) {
        const next = supervisor2.takeClaim();
        if (next === null) continue;
        await startTurn(client, next);
      }
      const now = Date.now();
      if (supervisor2.currentTurn !== null && now - activeTurnStartedAt > MAX_TOTAL_RUNTIME_MS) {
        await failActiveTurn(
          "The assistant exceeded the maximum turn runtime."
        );
      } else if (supervisor2.currentTurn !== null && now - lastEventAt > NO_EVENT_TIMEOUT_MS) {
        await failActiveTurn(
          "The assistant stopped responding. Please try again."
        );
      } else if (!supervisor2.hasWork && now - lastIdleActivityAt > IDLE_EXIT_MS2) {
        break;
      }
      await sleep3(POLL_INTERVAL_MS2);
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

// callback-src/providers/cursorSdkDaemon.ts
import { spawn as spawn2 } from "child_process";
import { readFileSync as readFileSync9, unlinkSync as unlinkSync3, writeFileSync as writeFileSync11 } from "fs";

// callback-src/providers/cursorSdk.ts
import { mkdirSync as mkdirSync7, readFileSync as readFileSync8 } from "fs";
var SDK_PACKAGE2 = "@cursor/sdk";
var SDK_VERSION2 = "1.0.28";
var SDK_ENTRY_RELPATH = "/dist/esm/index.js";
var SDK_SQLITE_ENTRY_RELPATH = "/dist/esm/sqlite.js";
var CURSOR_AGENT_SETUP_TIMEOUT_MS = 3e4;
var CURSOR_SDK_LOCAL_MODEL_CATALOG_ENV = "CURSOR_SDK_LOCAL_MODEL_CATALOG_JSON";
var CURSOR_SEND_START_TIMEOUT_MS = 6e4;
var CURSOR_FIRST_VISIBLE_EVENT_TIMEOUT_MS = NO_OUTPUT_TIMEOUT_MS * 5;
var CURSOR_POST_EVENT_SILENCE_TIMEOUT_MS = NO_OUTPUT_TIMEOUT_MS * 5;
var CURSOR_RESULT_SETTLE_TIMEOUT_MS = 3e4;
var CursorPhaseTimeoutError = class extends Error {
  constructor(phase, timeoutMs) {
    super(
      "Cursor stalled while " + phase + " for " + Math.round(timeoutMs / 1e3) + " seconds."
    );
    this.phase = phase;
    this.timeoutMs = timeoutMs;
    this.name = "CursorPhaseTimeoutError";
  }
};
async function waitForCursorPhase(args) {
  let timer = null;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      try {
        args.onTimeout?.();
      } catch {
      }
      reject(new CursorPhaseTimeoutError(args.phase, args.timeoutMs));
    }, args.timeoutMs);
  });
  try {
    return await Promise.race([args.task, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function shouldRetryStalledCursorResume(error) {
  return error instanceof CursorPhaseTimeoutError && (error.phase === "starting the model run" || error.phase === "waiting for the first model event");
}
function shouldRetryStalledCursorCreate(error) {
  return error instanceof CursorPhaseTimeoutError && error.phase === "creating a fresh agent";
}
function canReplaceCursorAgent(error) {
  return isAgentNotFound(error);
}
function cursorEventHasVisibleActivity(type) {
  return type === "thinking" || type === "assistant" || type === "tool_call";
}
function cursorEventWaitTimeoutMs(args) {
  if (args.toolInFlight || args.compactionInFlight) return MAX_TOTAL_RUNTIME_MS;
  if (args.sawVisibleActivity) return CURSOR_POST_EVENT_SILENCE_TIMEOUT_MS;
  return Math.max(
    1,
    args.lastEventAt + CURSOR_FIRST_VISIBLE_EVENT_TIMEOUT_MS - args.now
  );
}
function cursorModeParams(model, fastMode, use1mContext) {
  const params = [];
  if (model === "grok-4.6" || model === "grok-4.5" || model === "composer-2.5") {
    params.push({ id: "fast", value: fastMode ? "true" : "false" });
  }
  if (use1mContext) {
    params.push({ id: "context", value: "1m" });
  }
  return params;
}
function filterModeParamsByModel(candidates, model, opted) {
  if (!model) {
    return candidates.filter(
      (param) => param.id === "fast" ? opted.fastMode : opted.use1mContext
    );
  }
  const definitions = Array.isArray(model.parameters) ? model.parameters : [];
  return candidates.filter(
    (param) => definitions.some((definition) => {
      if (!definition || definition.id !== param.id) return false;
      const values = Array.isArray(definition.values) ? definition.values : [];
      return values.length === 0 || values.some((entry) => entry && entry.value === param.value);
    })
  );
}
var CURSOR_WRITE_TOOLS = [
  "edit",
  "delete",
  "applyAgentDiff"
];
var loadedSdk = null;
var loadedSdkSqlite = null;
async function loadCursorSdk() {
  if (loadedSdk) return loadedSdk;
  const mod = await import(resolvePinnedSdkEntry({
    packageName: SDK_PACKAGE2,
    version: SDK_VERSION2,
    entryRelPath: SDK_ENTRY_RELPATH
  }));
  loadedSdk = mod;
  return mod;
}
async function loadCursorSdkSqlite() {
  if (loadedSdkSqlite) return loadedSdkSqlite;
  const mod = await import(resolvePinnedSdkEntry({
    packageName: SDK_PACKAGE2,
    version: SDK_VERSION2,
    entryRelPath: SDK_SQLITE_ENTRY_RELPATH
  }));
  loadedSdkSqlite = mod;
  return mod;
}
function readPromptText2() {
  return readFileSync8("/tmp/design-prompt.txt", "utf8");
}
function cursorModelCatalogJson(models) {
  if (models.length === 0) return null;
  const valid = models.every(
    (entry) => entry !== null && typeof entry === "object" && typeof entry.id === "string"
  );
  if (!valid) return null;
  return JSON.stringify(
    models.map(
      (entry) => Array.isArray(entry.aliases) ? { id: entry.id, aliases: entry.aliases } : { id: entry.id }
    )
  );
}
async function resolveCursorModelSelection(sdk) {
  const base = normalizedCursorModel;
  const level = cursorReasoningLevel;
  const candidates = cursorModeParams(base, cursorFastMode, cursorUse1mContext);
  const opted = { fastMode: cursorFastMode, use1mContext: cursorUse1mContext };
  if (candidates.length === 0 && !level) {
    return { id: base };
  }
  let model;
  let listUnavailable = false;
  try {
    const list = sdk.Cursor?.models?.list;
    if (list) {
      const models = await waitForCursorPhase({
        task: list(),
        phase: "fetching the model list",
        timeoutMs: CURSOR_AGENT_SETUP_TIMEOUT_MS
      });
      if (Array.isArray(models)) {
        const catalog = cursorModelCatalogJson(models);
        if (catalog) process.env[CURSOR_SDK_LOCAL_MODEL_CATALOG_ENV] = catalog;
      }
      model = Array.isArray(models) ? models.find(
        (entry) => entry && typeof entry === "object" && entry.id === base
      ) : void 0;
      if (!model) {
        log(
          "resolveCursorModelSelection: model " + base + " not in Cursor.models.list \\u2014 keeping opted-in params only"
        );
      }
    } else {
      listUnavailable = true;
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    listUnavailable = true;
    log(
      "resolveCursorModelSelection: model list failed \\u2014 keeping opted-in params only (" + messageText + ")"
    );
  }
  const params = filterModeParamsByModel(candidates, model, opted);
  if (params.length < candidates.length && model) {
    log(
      "resolveCursorModelSelection: " + base + " does not declare " + candidates.filter((candidate) => !params.some((p) => p.id === candidate.id)).map((candidate) => candidate.id).join(", ") + " \\u2014 dropped"
    );
  }
  if (!level || listUnavailable || !model) {
    return params.length > 0 ? { id: base, params } : { id: base };
  }
  for (const definition of model.parameters ?? []) {
    if (!definition || typeof definition.id !== "string") continue;
    const values = Array.isArray(definition.values) ? definition.values : [];
    if (values.some((entry) => entry && entry.value === level)) {
      log(
        "resolveCursorModelSelection: " + base + " reasoning level " + level + " via parameter " + definition.id
      );
      params.push({ id: definition.id, value: level });
      return { id: base, params };
    }
  }
  for (const variant of model.variants ?? []) {
    const variantParams = Array.isArray(variant?.params) ? variant.params : [];
    if (variantParams.some((param) => param && param.value === level)) {
      log(
        "resolveCursorModelSelection: " + base + " reasoning level " + level + " via variant params"
      );
      const remainingVariantParams = variantParams.filter(
        (variantParam) => !params.some((param) => param.id === variantParam.id)
      );
      return { id: base, params: [...params, ...remainingVariantParams] };
    }
  }
  log(
    "resolveCursorModelSelection: " + base + " exposes no parameter accepting '" + level + "' \\u2014 sending base id"
  );
  return params.length > 0 ? { id: base, params } : { id: base };
}
function errorCode(error) {
  const withCode = error;
  return typeof withCode.code === "string" ? withCode.code : "";
}
function isAgentNotFound(error) {
  return errorCode(error) === "agent_not_found" || error.message.includes("agent_not_found");
}
var RESOURCE_EXHAUSTED_RETRY_DELAYS_MS = [15e3, 3e4];
function isResourceExhaustedMessage(text) {
  return text.includes("resource_exhausted");
}
var RESOURCE_EXHAUSTED_CHAT_MESSAGE = "Cursor rejected the request: rate limit or usage quota exhausted (resource_exhausted). No tokens were used. Wait a minute and try again, or switch to a different model.";
var EMPTY_CURSOR_COST_SNAPSHOT = {
  totalRawCents: null,
  entries: []
};
function readCursorCostSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return EMPTY_CURSOR_COST_SNAPSHOT;
  }
  const runs = Array.isArray(value.runs) ? value.runs : [];
  const entries = [];
  for (const run of runs) {
    if (!run || typeof run !== "object" || Array.isArray(run)) continue;
    if (typeof run.runId !== "string" || !run.runId) continue;
    entries.push({ runId: run.runId, rawCents: readRawCents(run.cost) });
  }
  return { totalRawCents: readRawCents(value.cost), entries };
}
function readRawCents(cost) {
  if (!cost || typeof cost !== "object" || Array.isArray(cost)) return null;
  const raw = cost.rawCostCents;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}
function sumKnownRawCents(entries) {
  return entries.reduce((total, entry) => total + (entry.rawCents ?? 0), 0);
}
function attributeCursorTurnRawCents(before, after) {
  const knownRunIds = new Set(before.entries.map((entry) => entry.runId));
  let attributed = 0;
  let attributable = false;
  for (const entry of after.entries) {
    if (entry.rawCents === null || knownRunIds.has(entry.runId)) continue;
    attributed += entry.rawCents;
    attributable = true;
  }
  if (after.totalRawCents !== null) {
    const remainderAfter = after.totalRawCents - sumKnownRawCents(after.entries);
    const remainderBefore = before.totalRawCents === null ? 0 : before.totalRawCents - sumKnownRawCents(before.entries);
    if (remainderAfter - remainderBefore > 0) {
      attributed += remainderAfter - remainderBefore;
      attributable = true;
    }
  }
  return attributable ? attributed : null;
}
var COST_LOOKUP_RETRY_DELAYS_MS = [2e3, 2e3];
async function resolveCursorTurnCostUsd(deps) {
  if (!deps.before) return void 0;
  const delays = deps.retryDelaysMs ?? COST_LOOKUP_RETRY_DELAYS_MS;
  for (let attempt = 0; ; attempt++) {
    const after = await deps.fetchAfter();
    const rawCents = after ? attributeCursorTurnRawCents(deps.before, after) : null;
    if (rawCents !== null) {
      return Math.round(rawCents / 100 * 1e6) / 1e6;
    }
    const delayMs = delays[attempt];
    if (delayMs === void 0) return void 0;
    await deps.sleep(delayMs);
  }
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
async function runTurnWithResourceExhaustedRetries(deps) {
  for (let attempt = 0; ; attempt++) {
    const retryDelayMs = RESOURCE_EXHAUSTED_RETRY_DELAYS_MS[attempt];
    let outcome;
    try {
      outcome = await deps.runTurn();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      if (!isResourceExhaustedMessage(messageText) || retryDelayMs === void 0 || deps.aborted()) {
        throw error;
      }
      outcome = {
        isError: true,
        resultText: messageText,
        durationMs: 0,
        usage: ZERO_USAGE
      };
    }
    if (!outcome.isError || !isResourceExhaustedMessage(outcome.resultText)) {
      return outcome;
    }
    if (retryDelayMs === void 0 || deps.aborted()) {
      return { ...outcome, resultText: RESOURCE_EXHAUSTED_CHAT_MESSAGE };
    }
    deps.onRetry(retryDelayMs, attempt);
    await deps.sleep(retryDelayMs);
  }
}
function readUsageTokens(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    inputTokens: readNum(value.inputTokens),
    outputTokens: readNum(value.outputTokens),
    cacheReadTokens: readNum(value.cacheReadTokens),
    cacheWriteTokens: readNum(value.cacheWriteTokens)
  };
}
async function runCursorSdkAttempt(sessionMode, overrides = {}) {
  resetAttemptState();
  callbackState.activeAttemptStartedAt = Date.now();
  const startupActivity = cursorAgentStartupActivity(sessionMode);
  updateThinkingStep(startupActivity.label, startupActivity.detail);
  log(
    "runCursorSdkAttempt started (mode=" + sessionMode.mode + ", sessionId=" + (sessionMode.sessionId || "none") + ")"
  );
  let attemptOutput = "";
  let lastMessageAt = Date.now();
  let compactionInFlight = false;
  let timedOutForNoOutput = false;
  let timedOutForMaxRuntime = false;
  let sawResult = false;
  let resultIsError = false;
  let attemptErrorMessage = "";
  let lastStreamUsage = null;
  let activeRun = null;
  let abortedByCaller = false;
  const cancelRun = () => {
    if (!activeRun) return;
    activeRun.cancel().catch(() => {
    });
  };
  overrides.onAbortHandle?.(() => {
    abortedByCaller = true;
    cancelRun();
  });
  const sdk = await loadCursorSdk();
  const sqlite = await loadCursorSdkSqlite();
  mkdirSync7(CURSOR_SDK_STORE_DIR, { recursive: true });
  const store4 = await sqlite.SqliteLocalAgentStore.open({
    workspaceRef: WORK_DIR,
    stateRoot: CURSOR_SDK_STORE_DIR
  });
  const options = {
    apiKey: (process.env.CURSOR_API_KEY || "").trim(),
    model: await resolveCursorModelSelection(sdk),
    local: { cwd: WORK_DIR, store: store4 },
    ...Object.keys(evaMcpServers).length > 0 ? { mcpServers: evaMcpServers } : {},
    ...NO_WRITES ? { disallowedTools: [...CURSOR_WRITE_TOOLS] } : {}
  };
  const persistAgentId = (agentId) => {
    callbackState.activeCursorSessionId = agentId;
    writeCursorSessionState();
    syncCursorStateToPersist();
  };
  const createFreshAgent = async () => {
    updateThinkingStep(
      "Starting a fresh Cursor agent...",
      "Creating a clean model context..."
    );
    const create = () => waitForCursorPhase({
      task: sdk.Agent.create(options),
      phase: "creating a fresh agent",
      timeoutMs: CURSOR_AGENT_SETUP_TIMEOUT_MS
    });
    let created;
    try {
      created = await create();
    } catch (error) {
      if (!(error instanceof Error) || !shouldRetryStalledCursorCreate(error)) {
        throw error;
      }
      log(
        "runCursorSdkAttempt: fresh agent creation stalled \\u2014 retrying once (" + error.message + ")"
      );
      appendToRawLogFile("[sdk-retry] " + error.message + "\\n");
      created = await create();
    }
    persistAgentId(created.agentId);
    return created;
  };
  const resumeSavedAgent = async (savedSessionId) => {
    updateThinkingStep(
      "Restoring Cursor context...",
      "Opening the saved agent..."
    );
    const resumed = await waitForCursorPhase({
      task: sdk.Agent.resume(savedSessionId, options),
      phase: "restoring saved context",
      timeoutMs: CURSOR_AGENT_SETUP_TIMEOUT_MS
    });
    persistAgentId(resumed.agentId);
    return resumed;
  };
  let resumedExistingAgent = false;
  let agent;
  if (sessionMode.mode === "resume" && sessionMode.sessionId) {
    try {
      agent = await resumeSavedAgent(sessionMode.sessionId);
      resumedExistingAgent = true;
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      if (error instanceof Error && canReplaceCursorAgent(error)) {
        log(
          "runCursorSdkAttempt: saved agent gone \\u2014 starting a fresh agent (" + messageText + ")"
        );
        appendToRawLogFile("[sdk-retry] resume failed: " + messageText + "\\n");
        agent = await createFreshAgent();
      } else {
        log(
          "runCursorSdkAttempt: resume failed \\u2014 retrying the saved agent (" + messageText + ")"
        );
        appendToRawLogFile("[sdk-retry] resume failed: " + messageText + "\\n");
        try {
          agent = await resumeSavedAgent(sessionMode.sessionId);
          resumedExistingAgent = true;
        } catch (retryError) {
          if (retryError instanceof Error && canReplaceCursorAgent(retryError)) {
            const retryMessageText = retryError.message;
            log(
              "runCursorSdkAttempt: saved agent gone on retry \\u2014 starting a fresh agent (" + retryMessageText + ")"
            );
            appendToRawLogFile(
              "[sdk-retry] resume retry failed: " + retryMessageText + "\\n"
            );
            agent = await createFreshAgent();
          } else {
            throw retryError;
          }
        }
      }
    }
  } else {
    agent = await createFreshAgent();
  }
  const promptText = overrides.promptText ?? readPromptText2();
  const combinedPrompt = SYSTEM_PROMPT ? SYSTEM_PROMPT + "\\n\\n" + promptText : promptText;
  const healthTimer = setInterval(() => {
    const now = Date.now();
    if (now - callbackState.activeAttemptStartedAt > MAX_TOTAL_RUNTIME_MS) {
      timedOutForMaxRuntime = true;
      log("runCursorSdkAttempt: max runtime exceeded \\u2014 cancelling run");
      cancelRun();
      return;
    }
    if (callbackState.inFlightToolUses > 0 || compactionInFlight) {
      lastMessageAt = now;
    }
    if (!sawResult && now - lastMessageAt > CURSOR_POST_EVENT_SILENCE_TIMEOUT_MS) {
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
  const readCostSnapshot = async (activeAgent) => {
    try {
      return readCursorCostSnapshot(await activeAgent.getUsage());
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      log(
        "runCursorSdkAttempt: getUsage failed \\u2014 turn cost unavailable (" + messageText + ")"
      );
      return null;
    }
  };
  const runTurn = async (activeAgent, agentIsFresh) => {
    const costBefore = agentIsFresh ? Promise.resolve(EMPTY_CURSOR_COST_SNAPSHOT) : readCostSnapshot(activeAgent);
    updateThinkingStep(
      "Waiting for Cursor...",
      "Starting the Grok model run..."
    );
    const run = await waitForCursorPhase({
      task: activeAgent.send(combinedPrompt, {
        local: { force: true }
      }),
      phase: "starting the model run",
      timeoutMs: CURSOR_SEND_START_TIMEOUT_MS,
      onTimeout: () => activeAgent.close()
    });
    activeRun = run;
    if (abortedByCaller) cancelRun();
    updateThinkingStep("Waiting for Grok...", "The model is thinking...");
    const messages = run.stream()[Symbol.asyncIterator]();
    let sawVisibleActivity = false;
    lastMessageAt = Date.now();
    compactionInFlight = false;
    while (true) {
      const phase = sawVisibleActivity ? "waiting for the next model event" : "waiting for the first model event";
      const next = await waitForCursorPhase({
        task: messages.next(),
        phase,
        timeoutMs: cursorEventWaitTimeoutMs({
          sawVisibleActivity,
          lastEventAt: lastMessageAt,
          now: Date.now(),
          toolInFlight: callbackState.inFlightToolUses > 0,
          compactionInFlight
        }),
        onTimeout: () => {
          timedOutForNoOutput = true;
          cancelRun();
        }
      });
      if (next.done) break;
      const message = next.value;
      if (cursorEventHasVisibleActivity(message.type)) {
        sawVisibleActivity = true;
      }
      const compactionPhase = cursorCompactionEventPhase(message.type);
      if (compactionPhase !== null) {
        compactionInFlight = compactionPhase === "started";
      }
      lastMessageAt = Date.now();
      pushLine(JSON.stringify(message) + "\\n");
      if (message.type === "usage") {
        lastStreamUsage = readUsageTokens(message.usage) ?? lastStreamUsage;
      }
      if (timedOutForMaxRuntime || timedOutForNoOutput || abortedByCaller)
        break;
    }
    const result = await waitForCursorPhase({
      task: run.wait(),
      phase: "finishing the model run",
      timeoutMs: CURSOR_RESULT_SETTLE_TIMEOUT_MS,
      onTimeout: cancelRun
    });
    const costUsd = await resolveCursorTurnCostUsd({
      before: await costBefore,
      fetchAfter: () => readCostSnapshot(activeAgent),
      sleep: (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs))
    });
    return {
      isError: result.status !== "finished",
      resultText: typeof result.result === "string" && result.result ? result.result : result.error && typeof result.error.message === "string" ? result.error.message : "",
      durationMs: readNum(result.durationMs),
      usage: readUsageTokens(result.usage) ?? lastStreamUsage ?? ZERO_USAGE,
      ...costUsd === void 0 ? {} : { costUsd }
    };
  };
  const emitTurnResult = (outcome) => {
    const syntheticResult = {
      type: "result",
      is_error: outcome.isError,
      result: outcome.resultText,
      duration_ms: outcome.durationMs,
      // Omitted when Cursor reported no cost; the parser then defaults to 0.
      ...outcome.costUsd === void 0 ? {} : { total_cost_usd: outcome.costUsd },
      usage: {
        input_tokens: outcome.usage.inputTokens,
        output_tokens: outcome.usage.outputTokens,
        cache_read_input_tokens: outcome.usage.cacheReadTokens,
        cache_creation_input_tokens: outcome.usage.cacheWriteTokens
      }
    };
    pushLine(JSON.stringify(syntheticResult) + "\\n");
    sawResult = true;
    resultIsError = outcome.isError;
  };
  const runTurnWithRetries = async (activeAgent, agentIsFresh) => {
    emitTurnResult(
      await runTurnWithResourceExhaustedRetries({
        runTurn: () => runTurn(activeAgent, agentIsFresh),
        aborted: () => timedOutForMaxRuntime || timedOutForNoOutput || abortedByCaller,
        onRetry: (retryDelayMs, attempt) => {
          log(
            "runCursorSdkAttempt: resource_exhausted \\u2014 retrying in " + retryDelayMs + "ms (attempt " + (attempt + 1) + " of " + (RESOURCE_EXHAUSTED_RETRY_DELAYS_MS.length + 1) + ")"
          );
          appendToRawLogFile(
            "[sdk-retry] resource_exhausted \\u2014 waiting " + retryDelayMs + "ms before retry\\n"
          );
          updateThinkingStep(
            "Cursor is rate-limited...",
            "Retrying in " + Math.round(retryDelayMs / 1e3) + "s..."
          );
        },
        sleep: (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs))
      })
    );
  };
  const resetForRecovery = (failedAgent) => {
    try {
      failedAgent.close();
    } catch {
    }
    activeRun = null;
    timedOutForNoOutput = false;
    lastMessageAt = Date.now();
    compactionInFlight = false;
  };
  try {
    try {
      await runTurnWithRetries(agent, !resumedExistingAgent);
    } catch (error) {
      if (!resumedExistingAgent || !(error instanceof Error)) {
        throw error;
      }
      const savedSessionId = callbackState.activeCursorSessionId || sessionMode.sessionId;
      if (canReplaceCursorAgent(error)) {
        log(
          "runCursorSdkAttempt: saved agent gone mid-run \\u2014 starting a fresh agent (" + error.message + ")"
        );
        appendToRawLogFile("[sdk-retry] " + error.message + "\\n");
        resetForRecovery(agent);
        pushNoticeStep2(
          "Started a fresh Cursor agent",
          "The saved agent could not be restored, so Eva recovered with a clean context."
        );
        agent = await createFreshAgent();
        await runTurnWithRetries(agent, true);
      } else if (shouldRetryStalledCursorResume(error) && savedSessionId) {
        log(
          "runCursorSdkAttempt: resumed agent run stalled \\u2014 retrying the same agent (" + error.message + ")"
        );
        appendToRawLogFile("[sdk-retry] " + error.message + "\\n");
        resetForRecovery(agent);
        pushNoticeStep2(
          "Retrying the saved Cursor agent",
          "The run stalled before any output, so Eva reopened the same agent to keep its context."
        );
        try {
          agent = await resumeSavedAgent(savedSessionId);
          await runTurnWithRetries(agent, false);
        } catch (retryError) {
          if (retryError instanceof Error && canReplaceCursorAgent(retryError)) {
            log(
              "runCursorSdkAttempt: saved agent gone on stall retry \\u2014 starting a fresh agent (" + retryError.message + ")"
            );
            appendToRawLogFile("[sdk-retry] " + retryError.message + "\\n");
            resetForRecovery(agent);
            pushNoticeStep2(
              "Started a fresh Cursor agent",
              "The saved agent could not be restored, so Eva recovered with a clean context."
            );
            agent = await createFreshAgent();
            await runTurnWithRetries(agent, true);
          } else {
            throw retryError;
          }
        }
      } else {
        throw error;
      }
    }
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const messageText = isResourceExhaustedMessage(rawMessage) ? RESOURCE_EXHAUSTED_CHAT_MESSAGE : rawMessage;
    attemptErrorMessage = messageText;
    log("runCursorSdkAttempt: run failed \\u2014 " + rawMessage);
    appendToRawLogFile("[sdk-error] " + rawMessage + "\\n");
    callbackState.stderrOutput = trimBufferHead(callbackState.stderrOutput + messageText + "\\n");
  } finally {
    clearInterval(healthTimer);
    try {
      agent.close();
    } catch {
    }
    try {
      await store4.dispose();
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
function cursorAgentStartupActivity(sessionMode) {
  return sessionMode.mode === "resume" ? {
    label: "Resuming Cursor agent...",
    detail: "Restoring saved context..."
  } : {
    label: "Creating Cursor agent...",
    detail: "Creating a new model context..."
  };
}

// callback-src/providers/cursorSdkDaemon.ts
var IDLE_EXIT_MS3 = 45 * 60 * 1e3;
var FENCE_POLL_INTERVAL_MS3 = 5e3;
var PROMPT_POLL_INTERVAL_MS2 = 50;
var PROMPT_POLL_IDLE_INTERVAL_MS2 = 1e3;
var PROMPT_POLL_FAST_WINDOW_MS2 = 3e4;
var WATCHDOG_TICK_MS2 = 5e3;
var TURN_HARD_TIMEOUT_MS = MAX_TOTAL_RUNTIME_MS + 5 * 60 * 1e3;
var CANCEL_SETTLE_TIMEOUT_MS2 = 3e4;
var CURSOR_TURN_WORKER_FILE_PREFIX = "/tmp/eva-cursor-turn-";
var CURSOR_TURN_WORKER_HEAP_MB = 8192;
var CURSOR_TURN_WORKER_OOM_SCORE = "300";
var daemonPaths2 = resolveDaemonPaths();
var daemonExiting = false;
var callbackRefreshPending = false;
var callbackRefreshDeferralLogged2 = false;
var pendingClaimedTurn = null;
var turnActive2 = false;
var turnStartedAtMs2 = 0;
var lastIdleActivityAtMs2 = Date.now();
var cancelInFlight = false;
var cancelRequestedAtMs = 0;
var abortActiveTurn = null;
function sleep4(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function cursorTurnWorkerEntryPath() {
  const entryPath = process.argv[1];
  if (!entryPath) {
    throw new Error(
      "Cursor turn worker could not resolve the callback entrypoint"
    );
  }
  return entryPath;
}
function readCursorTurnWorkerClaim() {
  if (!CURSOR_TURN_WORKER_PROMPT_FILE) {
    throw new Error("Cursor turn worker prompt file is missing");
  }
  const prompt = readFileSync9(CURSOR_TURN_WORKER_PROMPT_FILE, "utf8");
  if (CURSOR_TURN_WORKER_LIFECYCLE === "legacy") {
    return {
      lifecycle: "legacy",
      prompt,
      attachmentUrls: [],
      interactionMode: "default",
      turnLease: null
    };
  }
  if (CURSOR_TURN_WORKER_LIFECYCLE !== "durable" || !CURSOR_TURN_WORKER_TURN_ID || CURSOR_TURN_WORKER_LEASE_GENERATION <= 0) {
    throw new Error("Cursor turn worker received an invalid durable lease");
  }
  return {
    lifecycle: "durable",
    prompt,
    attachmentUrls: [],
    interactionMode: "default",
    turnLease: {
      turnId: CURSOR_TURN_WORKER_TURN_ID,
      leaseGeneration: CURSOR_TURN_WORKER_LEASE_GENERATION
    }
  };
}
function cursorTurnWorkerFailureMessage(outcome) {
  if (outcome.status === "spawn_error") {
    return "Cursor turn worker could not start: " + outcome.message;
  }
  const exit = outcome.signal !== null ? \`signal \${outcome.signal}\` : \`exit code \${String(outcome.code)}\`;
  const oom = outcome.signal === "SIGABRT" || outcome.code === 134;
  return oom ? \`Cursor turn worker ran out of memory (\${exit}). The daemon remained healthy and is ready for the next message.\` : \`Cursor turn worker stopped unexpectedly (\${exit}). The daemon remained healthy and is ready for the next message.\`;
}
function waitForCursorTurnWorker(child) {
  return new Promise((resolve) => {
    child.once("error", (error) => {
      resolve({ status: "spawn_error", message: error.message });
    });
    child.once("exit", (code, signal) => {
      resolve({ status: "exited", code, signal });
    });
  });
}
function buildCursorTurnWorkerEnv(baseEnv, mcpHandoffEnv, turn, promptFile) {
  const workerEnv = {
    ...baseEnv,
    ...mcpHandoffEnv,
    EVA_CURSOR_TURN_WORKER_PROMPT_FILE: promptFile,
    EVA_CURSOR_TURN_WORKER_LIFECYCLE: turn.lifecycle
  };
  if (turn.lifecycle === "durable") {
    workerEnv.EVA_CURSOR_TURN_WORKER_TURN_ID = turn.turnLease.turnId;
    workerEnv.EVA_CURSOR_TURN_WORKER_LEASE_GENERATION = String(
      turn.turnLease.leaseGeneration
    );
  } else {
    delete workerEnv.EVA_CURSOR_TURN_WORKER_TURN_ID;
    delete workerEnv.EVA_CURSOR_TURN_WORKER_LEASE_GENERATION;
  }
  return workerEnv;
}
function spawnCursorTurnWorker(turn, promptFile) {
  const workerEnv = buildCursorTurnWorkerEnv(
    process.env,
    evaMcpWorkerHandoffEnv,
    turn,
    promptFile
  );
  const child = spawn2(
    process.execPath,
    [
      \`--max-old-space-size=\${CURSOR_TURN_WORKER_HEAP_MB}\`,
      cursorTurnWorkerEntryPath()
    ],
    {
      cwd: process.cwd(),
      env: workerEnv,
      stdio: "inherit"
    }
  );
  if (child.pid !== void 0) {
    try {
      writeFileSync11(
        \`/proc/\${child.pid}/oom_score_adj\`,
        CURSOR_TURN_WORKER_OOM_SCORE
      );
    } catch {
    }
  }
  return child;
}
function pidAlive3(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function readDaemonPidFile2() {
  try {
    return Number(readFileSync9(daemonPaths2.pid, "utf8").trim());
  } catch {
    return Number.NaN;
  }
}
function entityMutationArgs2(fields) {
  return { [ENTITY_ID_FIELD ?? "sessionId"]: ENTITY_ID ?? "", ...fields };
}
function callbackScriptWentStaleOnDisk2() {
  if (!CALLBACK_SCRIPT_FP) return false;
  try {
    return readFileSync9("/tmp/eva-callback-fp", "utf8").trim() !== CALLBACK_SCRIPT_FP;
  } catch {
    return false;
  }
}
function resetTurnState3() {
  callbackState.accumulatedSteps.length = 0;
  callbackState.currentStreamedContent = "";
  callbackState.streamedAssistantTextThisMessage = false;
  callbackState.pendingParagraphBreak = false;
  callbackState.resultEventSeen = false;
  callbackState.rawOutput = "";
  callbackState.lastProcessed = 0;
  callbackState.realtimeOutputBuffer = "";
  callbackState.inFlightToolUses = 0;
  callbackState.pendingQuestionData = "";
  callbackState.todoState.length = 0;
  callbackState.lastStepType = "thinking";
}
async function refreshGithubToken3() {
  await ensureGithubToken({
    convexUrl: CONVEX_URL,
    convexToken: CONVEX_TOKEN,
    repoId: REPO_ID
  });
}
function buildTurnCompletion(attempt) {
  const resultEvent = extractResultEvent(attempt.output);
  const attemptEndedDueToTimeout = attempt.timedOutForMaxRuntime || attempt.timedOutForNoOutput || Boolean(attempt.toolStallErrorMessage);
  const finalTerminatedBySignal = attempt.terminatedBySignal;
  const finalCode = attempt.code;
  const agentWasInterrupted = finalTerminatedBySignal || finalCode === 137 || finalCode === 143;
  const runSucceededWithResult = resultEvent !== null && !resultEvent.isError && !agentWasInterrupted;
  if (resultEvent?.isError) {
    return { success: false, error: resultEvent.result };
  }
  if (!runSucceededWithResult && attempt.code !== 0 || attemptEndedDueToTimeout && !runSucceededWithResult) {
    return {
      success: false,
      error: appendDiagnosticTail(
        buildErrorMessage(
          attempt.code,
          callbackState.fatalHeartbeatErrorMessage,
          attempt.toolStallErrorMessage,
          attempt.timedOutForMaxRuntime,
          attempt.timedOutForNoOutput,
          attempt.timedOutForFirstEvent,
          attempt.timedOutForFirstAssistant,
          attempt.timedOutAfterFirstText,
          attempt.timedOutForZombie
        )
      )
    };
  }
  return { success: runSucceededWithResult, error: null };
}
async function finalizeTurn3(attempt) {
  await flushStreaming();
  const resultEvent = extractResultEvent(attempt.output);
  for (const step of callbackState.accumulatedSteps) step.status = "complete";
  const { success, error } = buildTurnCompletion(attempt);
  const completionArgs = {
    [ENTITY_ID_FIELD ?? "sessionId"]: ENTITY_ID ?? "",
    success,
    result: resultEvent?.result ?? callbackState.rawOutput,
    error,
    activityLog: serializeSteps(callbackState.accumulatedSteps)
  };
  if (RUN_ID) completionArgs.runId = RUN_ID;
  if (resultEvent?.rawResultEvent) {
    completionArgs.rawResultEvent = resultEvent.rawResultEvent;
  }
  if (callbackState.pendingQuestionData) {
    completionArgs.pendingQuestion = callbackState.pendingQuestionData;
  }
  appendClaimedTurnCompletion(completionArgs);
  if (await setFinalizingState()) return;
  persistTurnWork();
  await deliverCompletionWithMedia(completionArgs);
  syncCursorStateToPersist();
  log("cursor daemon: turn finalized success=" + success);
}
async function failTurnAndExit2(error) {
  log("cursor daemon: failing turn \\u2014 " + error);
  persistTurnWork();
  try {
    const completionArgs = entityMutationArgs2({
      success: false,
      result: null,
      error,
      // The disposable worker owns the live steps. A null log tells Convex to
      // preserve the last streaming snapshot when the worker cannot report.
      activityLog: null,
      ...RUN_ID ? { runId: RUN_ID } : {}
    });
    appendClaimedTurnCompletion(completionArgs);
    appendTurnCheckpoint(completionArgs);
    await callConvexWithRetry(
      "mutation",
      COMPLETION_MUTATION ?? "",
      completionArgs
    );
  } catch {
  }
  cleanOwnedMarkers();
  await stopStreamingLoops();
  process.exit(1);
}
function cleanOwnedMarkers() {
  if (readDaemonPidFile2() !== process.pid) return;
  const legacy = ENTITY_ID_FIELD === "sessionId" ? resolveLegacySessionDaemonPaths() : null;
  const targets = [
    daemonPaths2.pid,
    daemonPaths2.entity,
    daemonPaths2.opts,
    ...legacy ? [legacy.pid, legacy.entity, legacy.opts] : []
  ];
  for (const path3 of targets) {
    try {
      unlinkSync3(path3);
    } catch {
    }
  }
}
function startTurnWatchdog2() {
  const timer = setInterval(() => {
    const now = Date.now();
    if (cancelInFlight) {
      if (now - cancelRequestedAtMs > CANCEL_SETTLE_TIMEOUT_MS2) {
        log("cursor daemon: cancelled turn did not settle in time \\u2014 exiting");
        cleanOwnedMarkers();
        process.exit(1);
      }
      return;
    }
    if (!turnActive2) return;
    if (now - turnStartedAtMs2 > TURN_HARD_TIMEOUT_MS) {
      turnActive2 = false;
      abortActiveTurn?.();
      void failTurnAndExit2("The assistant exceeded the maximum turn runtime.");
    }
  }, WATCHDOG_TICK_MS2);
  timer.unref?.();
}
function startClaimWatcher2() {
  void (async () => {
    while (!daemonExiting) {
      if (callbackScriptWentStaleOnDisk2()) callbackRefreshPending = true;
      if (callbackRefreshPending) {
        if (turnActive2 || pendingClaimedTurn !== null || cancelInFlight) {
          if (!callbackRefreshDeferralLogged2) {
            callbackRefreshDeferralLogged2 = true;
            log(
              "cursor daemon: callback script updated on disk \\u2014 deferring respawn until active work settles"
            );
          }
          await sleep4(PROMPT_POLL_INTERVAL_MS2);
          continue;
        }
        log(
          "cursor daemon: callback script updated on disk \\u2014 exiting for respawn"
        );
        daemonExiting = true;
        return;
      }
      try {
        const claimed = await callConvexWithRetry(
          "mutation",
          CLAIM_MUTATION ?? "",
          entityMutationArgs2({
            model: MODEL,
            acceptTurn: !turnActive2 && pendingClaimedTurn === null && !cancelInFlight
          })
        );
        if (readCancelRequested(claimed)) handleCancelRequested2();
        const turn = readClaimedTurn(claimed);
        if (turn !== null) {
          await materializeTurnAttachments(turn);
          lastIdleActivityAtMs2 = Date.now();
          const currentLease = getCurrentTurnLease();
          if (shouldParkClaimedTurn({
            hasActiveRealTurn: turnActive2,
            isCancellationInFlight: cancelInFlight,
            isFinalizing: false,
            currentLeaseTurnId: currentLease?.turnId ?? null,
            claimedLeaseTurnId: turn.turnLease?.turnId ?? null
          })) {
            if (pendingClaimedTurn === null) {
              pendingClaimedTurn = turn;
            } else {
              log("cursor daemon: duplicate claimed turn ignored");
            }
          } else {
            log(
              "cursor daemon: claim discarded while real turn active (prompt lost; pendingTurn was already cleared)"
            );
          }
        }
      } catch {
      }
      const busy = turnActive2 || pendingClaimedTurn !== null || cancelInFlight;
      const recentlyActive = Date.now() - lastIdleActivityAtMs2 < PROMPT_POLL_FAST_WINDOW_MS2;
      await sleep4(
        busy || recentlyActive ? PROMPT_POLL_INTERVAL_MS2 : PROMPT_POLL_IDLE_INTERVAL_MS2
      );
    }
  })();
}
function handleCancelRequested2() {
  if (!turnActive2) {
    log("cursor daemon: cancelRequested with no active turn \\u2014 ignored");
    return;
  }
  if (cancelInFlight) return;
  cancelInFlight = true;
  cancelRequestedAtMs = Date.now();
  log("cursor daemon: cancel requested \\u2014 cancelling the in-flight run");
  abortActiveTurn?.();
}
async function executeClaimedTurn(turn) {
  turnActive2 = true;
  turnStartedAtMs2 = Date.now();
  abortActiveTurn = null;
  log("cursor turn worker: turn started");
  try {
    if (!process.env.CURSOR_API_KEY?.trim()) {
      throw new Error(
        "CURSOR_API_KEY is missing in the sandbox environment \\u2014 the Cursor SDK cannot authenticate"
      );
    }
    const sessionMode = prepareCursorSessionState();
    const attempt = await runCursorSdkAttempt(sessionMode, {
      promptText: turn.prompt,
      onAbortHandle: (abort) => {
        abortActiveTurn = abort;
        if (cancelInFlight) abort();
      }
    });
    turnActive2 = false;
    if (cancelInFlight) {
      log("cursor daemon: cancelled turn settled \\u2014 no completion posted");
      return;
    }
    await finalizeTurn3(attempt);
  } catch (error) {
    turnActive2 = false;
    const message = error instanceof Error ? error.message : String(error);
    log("cursor daemon: turn failed \\u2014 " + message);
    if (cancelInFlight) return;
    try {
      await flushStreaming();
      for (const step of callbackState.accumulatedSteps) step.status = "complete";
      if (await setFinalizingState()) return;
      persistTurnWork();
      const completionArgs = {
        [ENTITY_ID_FIELD ?? "sessionId"]: ENTITY_ID ?? "",
        success: false,
        result: null,
        error: appendDiagnosticTail(message),
        activityLog: serializeSteps(callbackState.accumulatedSteps),
        ...RUN_ID ? { runId: RUN_ID } : {}
      };
      appendClaimedTurnCompletion(completionArgs);
      await deliverCompletionWithMedia(completionArgs);
    } catch {
    }
  } finally {
    turnActive2 = false;
    abortActiveTurn = null;
    cancelInFlight = false;
    lastIdleActivityAtMs2 = Date.now();
  }
}
async function runCursorTurnWorker() {
  const turn = readCursorTurnWorkerClaim();
  resetTurnState3();
  startClaimedTurn(turn);
  try {
    const preflightOk2 = await runPreflightHeartbeat();
    if (!preflightOk2) {
      throw new Error("Cursor turn worker preflight failed");
    }
    startStreamingLoops();
    await refreshGithubToken3();
    await executeClaimedTurn(turn);
  } finally {
    await stopStreamingLoops();
    finishClaimedTurn();
  }
}
async function reportCursorTurnWorkerFailure(outcome) {
  const error = cursorTurnWorkerFailureMessage(outcome);
  log("cursor daemon: " + error);
  persistTurnWork();
  const completionArgs = entityMutationArgs2({
    success: false,
    result: null,
    error,
    // Convex falls back to the last streamed activity so a hard worker crash
    // cannot erase the reasoning/tools the user already saw.
    activityLog: null,
    ...RUN_ID ? { runId: RUN_ID } : {}
  });
  appendClaimedTurnCompletion(completionArgs);
  appendTurnCheckpoint(completionArgs);
  await callConvexWithRetry(
    "mutation",
    COMPLETION_MUTATION ?? "",
    completionArgs
  );
}
async function runClaimedTurn(turn) {
  const promptFile = CURSOR_TURN_WORKER_FILE_PREFIX + String(process.pid) + "-" + String(Date.now()) + ".txt";
  writeFileSync11(promptFile, turn.prompt);
  startClaimedTurn(turn);
  turnActive2 = true;
  turnStartedAtMs2 = Date.now();
  log("cursor daemon: starting isolated turn worker");
  try {
    const child = spawnCursorTurnWorker(turn, promptFile);
    abortActiveTurn = () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
      }
    };
    const outcome = await waitForCursorTurnWorker(child);
    turnActive2 = false;
    if (cancelInFlight) {
      log("cursor daemon: cancelled worker settled \\u2014 no completion posted");
      return;
    }
    if (outcome.status === "exited" && outcome.code === 0 && outcome.signal === null) {
      log("cursor daemon: isolated turn worker finished");
      return;
    }
    try {
      await reportCursorTurnWorkerFailure(outcome);
    } catch (error) {
      log(
        "cursor daemon: worker failure completion could not be delivered \\u2014 " + (error instanceof Error ? error.message : String(error))
      );
    }
  } finally {
    turnActive2 = false;
    abortActiveTurn = null;
    cancelInFlight = false;
    finishClaimedTurn();
    lastIdleActivityAtMs2 = Date.now();
    try {
      unlinkSync3(promptFile);
    } catch {
    }
  }
}
async function runCursorDaemon() {
  if (!CLAIM_MUTATION) {
    log("cursor daemon: CLAIM_MUTATION env is required in daemon mode");
    process.exit(1);
  }
  const rivalPid = readDaemonPidFile2();
  if (!Number.isNaN(rivalPid) && rivalPid !== process.pid && pidAlive3(rivalPid)) {
    log(
      \`cursor daemon: rival daemon pid=\${rivalPid} already owns \${daemonPaths2.pid} \\u2014 exiting\`
    );
    process.exit(0);
  }
  writeFileSync11(daemonPaths2.pid, String(process.pid));
  writeFileSync11(daemonPaths2.entity, ENTITY_ID ?? "");
  writeFileSync11(daemonPaths2.opts, DAEMON_OPTS_SIG);
  let deposedLogged = false;
  const fence = setInterval(() => {
    const owner = readDaemonPidFile2();
    if (owner === process.pid) {
      deposedLogged = false;
      return;
    }
    const ownerLabel = Number.isNaN(owner) ? "none" : String(owner);
    if (turnActive2) {
      if (!deposedLogged) {
        deposedLogged = true;
        log(
          \`cursor daemon: deposed (pidfile owner=\${ownerLabel}) \\u2014 exiting after active turn\`
        );
      }
      return;
    }
    log(\`cursor daemon: deposed (pidfile owner=\${ownerLabel}) \\u2014 exiting\`);
    process.exit(0);
  }, FENCE_POLL_INTERVAL_MS3);
  fence.unref?.();
  const preflightOk2 = await runPreflightHeartbeat();
  if (!preflightOk2) {
    log("cursor daemon: preflight failed");
    process.exit(1);
  }
  await refreshGithubToken3();
  log(
    "runCursorDaemon started (entityId=" + (ENTITY_ID ?? "none") + ", model=" + MODEL + ")"
  );
  startTurnWatchdog2();
  startClaimWatcher2();
  try {
    while (!daemonExiting) {
      if (pendingClaimedTurn !== null) {
        const turn = pendingClaimedTurn;
        pendingClaimedTurn = null;
        await runClaimedTurn(turn);
        continue;
      }
      if (Date.now() - lastIdleActivityAtMs2 > IDLE_EXIT_MS3) {
        log("cursor daemon: idle timeout \\u2014 exiting");
        break;
      }
      await sleep4(PROMPT_POLL_INTERVAL_MS2);
    }
  } finally {
    daemonExiting = true;
    cleanOwnedMarkers();
  }
  process.exit(0);
}

// callback-src/runtime/systemSkills.ts
import {
  existsSync as existsSync8,
  mkdirSync as mkdirSync8,
  readdirSync as readdirSync4,
  readFileSync as readFileSync10,
  rmSync,
  writeFileSync as writeFileSync12
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
  if (!existsSync8(skillFile)) return false;
  try {
    return readFileSync10(skillFile, "utf8").includes(SYSTEM_SKILL_MARKER);
  } catch {
    return false;
  }
}
function writeStub(skill) {
  const directory = \`\${skillsRoot()}/\${skill.name}\`;
  if (existsSync8(\`\${directory}/SKILL.md\`) && !isEvaStub(skill.name)) {
    log(\`[system-skills] \${skill.name} exists in the repo \\u2014 leaving it alone\`);
    return false;
  }
  mkdirSync8(directory, { recursive: true });
  writeFileSync12(\`\${directory}/SKILL.md\`, skill.stub);
  return true;
}
function pruneStaleStubs(keep) {
  const root = skillsRoot();
  if (!existsSync8(root)) return;
  for (const entry of readdirSync4(root, { withFileTypes: true })) {
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
  if (!existsSync8(gitDir)) return;
  const infoDir = \`\${gitDir}/info\`;
  const excludeFile = \`\${infoDir}/exclude\`;
  const existing = existsSync8(excludeFile) ? readFileSync10(excludeFile, "utf8") : "";
  const next = renderExcludeContent(existing, names);
  if (next === existing) return;
  mkdirSync8(infoDir, { recursive: true });
  writeFileSync12(excludeFile, next);
}
function materializeSystemSkills() {
  try {
    if (!existsSync8(SYSTEM_SKILLS_STATE_FILE)) return;
    if (!existsSync8(WORK_DIR)) {
      log("[system-skills] no checkout yet \\u2014 skipping");
      return;
    }
    const skills = parseSystemSkillsFile(
      readFileSync10(SYSTEM_SKILLS_STATE_FILE, "utf8")
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

// ../../node_modules/.pnpm/@openai+codex-sdk@0.146.0/node_modules/@openai/codex-sdk/dist/index.js
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { spawn as spawn3 } from "child_process";
import { statSync as statSync2 } from "fs";
import path2 from "path";
import readline from "readline";
import { createRequire } from "module";
async function createOutputSchemaFile(schema) {
  if (schema === void 0) {
    return { cleanup: async () => {
    } };
  }
  if (!isJsonObject(schema)) {
    throw new Error("outputSchema must be a plain JSON object");
  }
  const schemaDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-output-schema-"));
  const schemaPath = path.join(schemaDir, "schema.json");
  const cleanup = async () => {
    try {
      await fs.rm(schemaDir, { recursive: true, force: true });
    } catch {
    }
  };
  try {
    await fs.writeFile(schemaPath, JSON.stringify(schema), "utf8");
    return { schemaPath, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
function isJsonObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var Thread = class {
  _exec;
  _options;
  _id;
  _threadOptions;
  /** Returns the ID of the thread. Populated after the first turn starts. */
  get id() {
    return this._id;
  }
  /* @internal */
  constructor(exec, options, threadOptions, id = null) {
    this._exec = exec;
    this._options = options;
    this._id = id;
    this._threadOptions = threadOptions;
  }
  /** Provides the input to the agent and streams events as they are produced during the turn. */
  async runStreamed(input, turnOptions = {}) {
    return { events: this.runStreamedInternal(input, turnOptions) };
  }
  async *runStreamedInternal(input, turnOptions = {}) {
    const { schemaPath, cleanup } = await createOutputSchemaFile(turnOptions.outputSchema);
    const options = this._threadOptions;
    const { prompt, images } = normalizeInput(input);
    const generator = this._exec.run({
      input: prompt,
      baseUrl: this._options.baseUrl,
      apiKey: this._options.apiKey,
      threadId: this._id,
      images,
      model: options?.model,
      sandboxMode: options?.sandboxMode,
      workingDirectory: options?.workingDirectory,
      skipGitRepoCheck: options?.skipGitRepoCheck,
      outputSchemaFile: schemaPath,
      modelReasoningEffort: options?.modelReasoningEffort,
      signal: turnOptions.signal,
      networkAccessEnabled: options?.networkAccessEnabled,
      webSearchMode: options?.webSearchMode,
      webSearchEnabled: options?.webSearchEnabled,
      approvalPolicy: options?.approvalPolicy,
      additionalDirectories: options?.additionalDirectories
    });
    try {
      for await (const item of generator) {
        let parsed;
        try {
          parsed = JSON.parse(item);
        } catch (error) {
          throw new Error(\`Failed to parse item: \${item}\`, { cause: error });
        }
        if (parsed.type === "thread.started") {
          this._id = parsed.thread_id;
        } else if (parsed.type === "turn.completed") {
          parsed.usage.cache_write_input_tokens ??= 0;
        }
        yield parsed;
      }
    } finally {
      await cleanup();
    }
  }
  /** Provides the input to the agent and returns the completed turn. */
  async run(input, turnOptions = {}) {
    const generator = this.runStreamedInternal(input, turnOptions);
    const items = [];
    let finalResponse = "";
    let usage = null;
    let turnFailure = null;
    for await (const event of generator) {
      if (event.type === "item.completed") {
        if (event.item.type === "agent_message") {
          finalResponse = event.item.text;
        }
        items.push(event.item);
      } else if (event.type === "turn.completed") {
        usage = event.usage;
      } else if (event.type === "turn.failed") {
        turnFailure = event.error;
        break;
      }
    }
    if (turnFailure) {
      throw new Error(turnFailure.message);
    }
    return { items, finalResponse, usage };
  }
};
function normalizeInput(input) {
  if (typeof input === "string") {
    return { prompt: input, images: [] };
  }
  const promptParts = [];
  const images = [];
  for (const item of input) {
    if (item.type === "text") {
      promptParts.push(item.text);
    } else if (item.type === "local_image") {
      images.push(item.path);
    }
  }
  return { prompt: promptParts.join("\\n\\n"), images };
}
var INTERNAL_ORIGINATOR_ENV = "CODEX_INTERNAL_ORIGINATOR_OVERRIDE";
var TYPESCRIPT_SDK_ORIGINATOR = "codex_sdk_ts";
var CODEX_NPM_NAME = "@openai/codex";
var PLATFORM_PACKAGE_BY_TARGET = {
  "x86_64-unknown-linux-musl": "@openai/codex-linux-x64",
  "aarch64-unknown-linux-musl": "@openai/codex-linux-arm64",
  "x86_64-apple-darwin": "@openai/codex-darwin-x64",
  "aarch64-apple-darwin": "@openai/codex-darwin-arm64",
  "x86_64-pc-windows-msvc": "@openai/codex-win32-x64",
  "aarch64-pc-windows-msvc": "@openai/codex-win32-arm64"
};
var moduleRequire = createRequire(import.meta.url);
var CodexExec = class {
  executablePath;
  pathDirs;
  envOverride;
  configOverrides;
  constructor(executablePath = null, env, configOverrides) {
    if (executablePath) {
      this.executablePath = executablePath;
      this.pathDirs = [];
    } else {
      const resolved = findCodexPath();
      this.executablePath = resolved.executablePath;
      this.pathDirs = resolved.pathDirs;
    }
    this.envOverride = env;
    this.configOverrides = configOverrides;
  }
  async *run(args) {
    const commandArgs = ["exec", "--experimental-json"];
    if (this.configOverrides) {
      for (const override of serializeConfigOverrides(this.configOverrides)) {
        commandArgs.push("--config", override);
      }
    }
    if (args.baseUrl) {
      commandArgs.push(
        "--config",
        \`openai_base_url=\${toTomlValue(args.baseUrl, "openai_base_url")}\`
      );
    }
    if (args.model) {
      commandArgs.push("--model", args.model);
    }
    if (args.sandboxMode) {
      commandArgs.push("--sandbox", args.sandboxMode);
    }
    if (args.workingDirectory) {
      commandArgs.push("--cd", args.workingDirectory);
    }
    if (args.additionalDirectories?.length) {
      for (const dir of args.additionalDirectories) {
        commandArgs.push("--add-dir", dir);
      }
    }
    if (args.skipGitRepoCheck) {
      commandArgs.push("--skip-git-repo-check");
    }
    if (args.outputSchemaFile) {
      commandArgs.push("--output-schema", args.outputSchemaFile);
    }
    if (args.modelReasoningEffort) {
      commandArgs.push("--config", \`model_reasoning_effort="\${args.modelReasoningEffort}"\`);
    }
    if (args.networkAccessEnabled !== void 0) {
      commandArgs.push(
        "--config",
        \`sandbox_workspace_write.network_access=\${args.networkAccessEnabled}\`
      );
    }
    if (args.webSearchMode) {
      commandArgs.push("--config", \`web_search="\${args.webSearchMode}"\`);
    } else if (args.webSearchEnabled === true) {
      commandArgs.push("--config", \`web_search="live"\`);
    } else if (args.webSearchEnabled === false) {
      commandArgs.push("--config", \`web_search="disabled"\`);
    }
    if (args.approvalPolicy) {
      commandArgs.push("--config", \`approval_policy="\${args.approvalPolicy}"\`);
    }
    if (args.threadId) {
      commandArgs.push("resume", args.threadId);
    }
    if (args.images?.length) {
      for (const image of args.images) {
        commandArgs.push("--image", image);
      }
    }
    const env = {};
    if (this.envOverride) {
      Object.assign(env, this.envOverride);
    } else {
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== void 0) {
          env[key] = value;
        }
      }
    }
    if (!env[INTERNAL_ORIGINATOR_ENV]) {
      env[INTERNAL_ORIGINATOR_ENV] = TYPESCRIPT_SDK_ORIGINATOR;
    }
    if (args.apiKey) {
      env.CODEX_API_KEY = args.apiKey;
    }
    if (this.pathDirs.length > 0) {
      prependPathDirs(env, this.pathDirs);
    }
    const child = spawn3(this.executablePath, commandArgs, {
      env,
      signal: args.signal
    });
    let spawnError = null;
    child.once("error", (err) => spawnError = err);
    if (!child.stdin) {
      child.kill();
      throw new Error("Child process has no stdin");
    }
    child.stdin.write(args.input);
    child.stdin.end();
    if (!child.stdout) {
      child.kill();
      throw new Error("Child process has no stdout");
    }
    const stderrChunks = [];
    if (child.stderr) {
      child.stderr.on("data", (data) => {
        stderrChunks.push(data);
      });
    }
    const exitPromise = new Promise(
      (resolve) => {
        child.once("exit", (code, signal) => {
          resolve({ code, signal });
        });
      }
    );
    const rl = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity
    });
    try {
      for await (const line of rl) {
        yield line;
      }
      if (spawnError) throw spawnError;
      const { code, signal } = await exitPromise;
      if (code !== 0 || signal) {
        const stderrBuffer = Buffer.concat(stderrChunks);
        const detail = signal ? \`signal \${signal}\` : \`code \${code ?? 1}\`;
        throw new Error(\`Codex Exec exited with \${detail}: \${stderrBuffer.toString("utf8")}\`);
      }
    } finally {
      rl.close();
      child.removeAllListeners();
      try {
        if (!child.killed) child.kill();
      } catch {
      }
    }
  }
};
function serializeConfigOverrides(configOverrides) {
  const overrides = [];
  flattenConfigOverrides(configOverrides, "", overrides);
  return overrides;
}
function flattenConfigOverrides(value, prefix, overrides) {
  if (!isPlainObject(value)) {
    if (prefix) {
      overrides.push(\`\${prefix}=\${toTomlValue(value, prefix)}\`);
      return;
    } else {
      throw new Error("Codex config overrides must be a plain object");
    }
  }
  const entries = Object.entries(value);
  if (!prefix && entries.length === 0) {
    return;
  }
  if (prefix && entries.length === 0) {
    overrides.push(\`\${prefix}={}\`);
    return;
  }
  for (const [key, child] of entries) {
    if (!key) {
      throw new Error("Codex config override keys must be non-empty strings");
    }
    if (child === void 0) {
      continue;
    }
    const path3 = prefix ? \`\${prefix}.\${key}\` : key;
    if (isPlainObject(child)) {
      flattenConfigOverrides(child, path3, overrides);
    } else {
      overrides.push(\`\${path3}=\${toTomlValue(child, path3)}\`);
    }
  }
}
function toTomlValue(value, path3) {
  if (typeof value === "string") {
    return JSON.stringify(value);
  } else if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(\`Codex config override at \${path3} must be a finite number\`);
    }
    return \`\${value}\`;
  } else if (typeof value === "boolean") {
    return value ? "true" : "false";
  } else if (Array.isArray(value)) {
    const rendered = value.map((item, index) => toTomlValue(item, \`\${path3}[\${index}]\`));
    return \`[\${rendered.join(", ")}]\`;
  } else if (isPlainObject(value)) {
    const parts = [];
    for (const [key, child] of Object.entries(value)) {
      if (!key) {
        throw new Error("Codex config override keys must be non-empty strings");
      }
      if (child === void 0) {
        continue;
      }
      parts.push(\`\${formatTomlKey(key)} = \${toTomlValue(child, \`\${path3}.\${key}\`)}\`);
    }
    return \`{\${parts.join(", ")}}\`;
  } else if (value === null) {
    throw new Error(\`Codex config override at \${path3} cannot be null\`);
  } else {
    const typeName = typeof value;
    throw new Error(\`Unsupported Codex config override value at \${path3}: \${typeName}\`);
  }
}
var TOML_BARE_KEY = /^[A-Za-z0-9_-]+\$/;
function formatTomlKey(key) {
  return TOML_BARE_KEY.test(key) ? key : JSON.stringify(key);
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function findCodexPath() {
  const { platform, arch } = process;
  let targetTriple = null;
  switch (platform) {
    case "linux":
    case "android":
      switch (arch) {
        case "x64":
          targetTriple = "x86_64-unknown-linux-musl";
          break;
        case "arm64":
          targetTriple = "aarch64-unknown-linux-musl";
          break;
        default:
          break;
      }
      break;
    case "darwin":
      switch (arch) {
        case "x64":
          targetTriple = "x86_64-apple-darwin";
          break;
        case "arm64":
          targetTriple = "aarch64-apple-darwin";
          break;
        default:
          break;
      }
      break;
    case "win32":
      switch (arch) {
        case "x64":
          targetTriple = "x86_64-pc-windows-msvc";
          break;
        case "arm64":
          targetTriple = "aarch64-pc-windows-msvc";
          break;
        default:
          break;
      }
      break;
    default:
      break;
  }
  if (!targetTriple) {
    throw new Error(\`Unsupported platform: \${platform} (\${arch})\`);
  }
  const platformPackage = PLATFORM_PACKAGE_BY_TARGET[targetTriple];
  if (!platformPackage) {
    throw new Error(\`Unsupported target triple: \${targetTriple}\`);
  }
  let vendorRoot;
  try {
    const codexPackageJsonPath = moduleRequire.resolve(\`\${CODEX_NPM_NAME}/package.json\`);
    const codexRequire = createRequire(codexPackageJsonPath);
    const platformPackageJsonPath = codexRequire.resolve(\`\${platformPackage}/package.json\`);
    vendorRoot = path2.join(path2.dirname(platformPackageJsonPath), "vendor");
  } catch {
    throw new Error(
      \`Unable to locate Codex CLI binaries. Ensure \${CODEX_NPM_NAME} is installed with optional dependencies.\`
    );
  }
  const codexBinaryName = process.platform === "win32" ? "codex.exe" : "codex";
  const nativePackage = resolveNativePackage(vendorRoot, targetTriple, codexBinaryName);
  if (!nativePackage) {
    throw new Error(
      \`Unable to locate Codex CLI binaries for \${targetTriple}. Ensure \${CODEX_NPM_NAME} is installed with optional dependencies.\`
    );
  }
  return nativePackage;
}
function resolveNativePackage(vendorRoot, targetTriple, codexBinaryName) {
  const packageRoot = path2.join(vendorRoot, targetTriple);
  const packageBinaryPath = path2.join(packageRoot, "bin", codexBinaryName);
  if (isFile(packageBinaryPath) && isFile(path2.join(packageRoot, "codex-package.json"))) {
    return {
      executablePath: packageBinaryPath,
      pathDirs: existingDirs(path2.join(packageRoot, "codex-path"))
    };
  }
  const legacyBinaryPath = path2.join(packageRoot, "codex", codexBinaryName);
  if (isFile(legacyBinaryPath)) {
    return {
      executablePath: legacyBinaryPath,
      pathDirs: existingDirs(path2.join(packageRoot, "path"))
    };
  }
  return null;
}
function existingDirs(...dirs) {
  return dirs.filter(isDirectory);
}
function prependPathDirs(env, pathDirs, platform = process.platform) {
  const pathKey = pathEnvKey(env, platform);
  if (platform === "win32") {
    for (const key of Object.keys(env)) {
      if (key.toLowerCase() === "path" && key !== pathKey) {
        delete env[key];
      }
    }
  }
  const existingEntries = (env[pathKey] ?? "").split(path2.delimiter).filter((entry) => entry.length > 0 && !pathDirs.includes(entry));
  env[pathKey] = [...pathDirs, ...existingEntries].join(path2.delimiter);
}
function pathEnvKey(env, platform) {
  if (platform !== "win32") {
    return "PATH";
  }
  const matchingKeys = Object.keys(env).filter((key) => key.toLowerCase() === "path");
  return matchingKeys.includes("Path") ? "Path" : matchingKeys.at(-1) ?? "PATH";
}
function isFile(filePath) {
  try {
    return statSync2(filePath).isFile();
  } catch {
    return false;
  }
}
function isDirectory(filePath) {
  try {
    return statSync2(filePath).isDirectory();
  } catch {
    return false;
  }
}
var Codex = class {
  exec;
  options;
  constructor(options = {}) {
    const { codexPathOverride, env, config } = options;
    this.exec = new CodexExec(codexPathOverride, env, config);
    this.options = options;
  }
  /**
   * Starts a new conversation with an agent.
   * @returns A new thread instance.
   */
  startThread(options = {}) {
    return new Thread(this.exec, this.options, options);
  }
  /**
   * Resumes a conversation with an agent based on the thread id.
   * Threads are persisted in ~/.codex/sessions.
   *
   * @param id The id of the thread to resume.
   * @returns A new thread instance.
   */
  resumeThread(id, options = {}) {
    return new Thread(this.exec, this.options, options, id);
  }
};

// callback-src/providers/codexSdk.ts
import { existsSync as existsSync9, readFileSync as readFileSync11 } from "fs";
function readPromptText3() {
  const prompt = readFileSync11("/tmp/design-prompt.txt", "utf8");
  return SYSTEM_PROMPT ? SYSTEM_PROMPT + "\\n\\n" + prompt : prompt;
}
function codexEnvironment() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== void 0) env[key] = value;
  }
  env.CODEX_HOME = CODEX_RUNTIME_HOME_DIR;
  return env;
}
function buildCodexSdkThreadOptions() {
  return {
    model: normalizedCodexModel,
    sandboxMode: NO_WRITES ? "read-only" : "danger-full-access",
    workingDirectory: WORK_DIR,
    skipGitRepoCheck: true,
    approvalPolicy: "never"
  };
}
function agentMessageDelta(event, priorTextByItem) {
  if (event.type !== "item.updated" && event.type !== "item.completed" || event.item.type !== "agent_message") {
    return "";
  }
  const previous = priorTextByItem.get(event.item.id) ?? "";
  const current = event.item.text;
  priorTextByItem.set(event.item.id, current);
  if (!current || current === previous) return "";
  return current.startsWith(previous) ? current.slice(previous.length) : current;
}
async function runCodexSdkAttempt(sessionMode) {
  resetAttemptState();
  callbackState.activeAttemptStartedAt = Date.now();
  updateThinkingStep(
    "Starting Codex SDK...",
    sessionMode.mode === "resume" ? "Restoring saved context..." : "Creating Codex thread..."
  );
  log(
    "runCodexSdkAttempt started (mode=" + sessionMode.mode + ", sessionId=" + (sessionMode.sessionId || "none") + ")"
  );
  let attemptOutput = "";
  let lastEventAt2 = Date.now();
  let timedOutForNoOutput = false;
  let timedOutForMaxRuntime = false;
  let sawCompletedTurn = false;
  let turnFailed = false;
  let attemptErrorMessage = "";
  const abortController = new AbortController();
  const agentTextByItem = /* @__PURE__ */ new Map();
  const codex = new Codex({
    codexPathOverride: existsSync9(CODEX_BIN_PATH) ? CODEX_BIN_PATH : "codex",
    env: codexEnvironment()
  });
  const threadOptions = buildCodexSdkThreadOptions();
  const thread = sessionMode.mode === "resume" && sessionMode.sessionId ? codex.resumeThread(sessionMode.sessionId, threadOptions) : codex.startThread(threadOptions);
  const healthTimer = setInterval(() => {
    const now = Date.now();
    if (callbackState.fatalHeartbeatErrorMessage) {
      attemptErrorMessage = callbackState.fatalHeartbeatErrorMessage;
      abortController.abort();
      return;
    }
    if (now - callbackState.activeAttemptStartedAt > MAX_TOTAL_RUNTIME_MS) {
      timedOutForMaxRuntime = true;
      log("runCodexSdkAttempt: max runtime exceeded \\u2014 aborting turn");
      abortController.abort();
      return;
    }
    if (callbackState.inFlightToolUses > 0) {
      lastEventAt2 = now;
    }
    if (!sawCompletedTurn && now - lastEventAt2 > NO_OUTPUT_TIMEOUT_MS * 5) {
      timedOutForNoOutput = true;
      log("runCodexSdkAttempt: no SDK events \\u2014 aborting turn");
      abortController.abort();
    }
  }, NO_OUTPUT_CHECK_INTERVAL_MS);
  const emitLine = (line) => {
    appendToRawLogFile(line);
    attemptOutput = trimBufferHead(attemptOutput + line);
    appendToRawOutput(line);
    processRealtimeStdoutChunk(line);
  };
  try {
    const streamed = await thread.runStreamed(readPromptText3(), {
      signal: abortController.signal
    });
    for await (const event of streamed.events) {
      lastEventAt2 = Date.now();
      const delta = agentMessageDelta(event, agentTextByItem);
      if (delta) {
        emitLine(
          JSON.stringify({ type: "item.agent_message.delta", delta }) + "\\n"
        );
        if (callbackState.firstTextBlockAt === 0) callbackState.firstTextBlockAt = Date.now();
      }
      emitLine(JSON.stringify(event) + "\\n");
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
    log("runCodexSdkAttempt: turn failed \\u2014 " + message);
  } finally {
    clearInterval(healthTimer);
  }
  if (attemptErrorMessage) {
    appendToRawLogFile("[sdk-error] " + attemptErrorMessage + "\\n");
    callbackState.stderrOutput = trimBufferHead(
      callbackState.stderrOutput + attemptErrorMessage + "\\n"
    );
  }
  const code = sawCompletedTurn && !turnFailed && !attemptErrorMessage && !timedOutForMaxRuntime && !timedOutForNoOutput ? 0 : 1;
  log(
    "runCodexSdkAttempt finished in " + String(Date.now() - callbackState.activeAttemptStartedAt) + "ms (code=" + code + ", sawCompletedTurn=" + sawCompletedTurn + ", turnFailed=" + turnFailed + ", timedOutForNoOutput=" + timedOutForNoOutput + ", timedOutForMaxRuntime=" + timedOutForMaxRuntime + ", outputBytes=" + attemptOutput.length + (attemptErrorMessage ? ", error=" + attemptErrorMessage : "") + ")"
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

// callback-src/providers/opencodeSdk.ts
import { readFileSync as readFileSync13 } from "fs";

// callback-src/providers/opencodeServer.ts
import { spawn as spawn4 } from "child_process";
import {
  closeSync,
  existsSync as existsSync10,
  mkdirSync as mkdirSync9,
  openSync,
  readFileSync as readFileSync12,
  rmSync as rmSync2,
  statSync as statSync3,
  writeFileSync as writeFileSync13
} from "fs";
var SERVER_STATE_FILE = OPENCODE_RUNTIME_HOME_DIR + "/server.json";
var SERVER_LOCK_DIR = OPENCODE_RUNTIME_HOME_DIR + "/server.lock";
var SERVER_LOG_FILE = OPENCODE_RUNTIME_HOME_DIR + "/server.log";
var HEALTH_PROBE_TIMEOUT_MS = 3e3;
var STARTUP_TIMEOUT_MS = 6e4;
var HEALTH_POLL_INTERVAL_MS = 250;
var LOCK_STALE_MS = 9e4;
var LOG_TAIL_BYTES = 4e3;
var opencodeServerBaseUrl = "http://127.0.0.1:" + String(OPENCODE_SERVER_PORT);
function sleep5(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function readOpencodeServerLogTail(maxBytes = LOG_TAIL_BYTES) {
  try {
    const contents = readFileSync12(SERVER_LOG_FILE, "utf8");
    return contents.length > maxBytes ? contents.slice(-maxBytes) : contents;
  } catch {
    return "";
  }
}
async function probeHealth() {
  try {
    const response = await fetch(opencodeServerBaseUrl + "/config", {
      signal: AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS)
    });
    return response.ok;
  } catch {
    return false;
  }
}
function readRecordedPid() {
  try {
    const parsed = tryParseJson(readFileSync12(SERVER_STATE_FILE, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return 0;
    }
    return typeof parsed.pid === "number" && parsed.pid > 0 ? parsed.pid : 0;
  } catch {
    return 0;
  }
}
function killRecordedServer() {
  const pid = readRecordedPid();
  if (!pid) return;
  let cmdline = "";
  try {
    cmdline = readFileSync12("/proc/" + String(pid) + "/cmdline", "utf8");
  } catch {
    return;
  }
  if (!cmdline.includes("opencode")) return;
  try {
    process.kill(pid, "SIGKILL");
    log("opencode server pid=" + String(pid) + " was unhealthy \\u2014 killed");
  } catch {
  }
}
function spawnServer() {
  const logFd = openSync(SERVER_LOG_FILE, "a");
  try {
    const child = spawn4(
      opencodeCommand,
      [
        "serve",
        "--hostname=127.0.0.1",
        "--port=" + String(OPENCODE_SERVER_PORT)
      ],
      {
        cwd: WORK_DIR,
        env: { ...process.env },
        // Detached: the server must outlive this turn's callback process so the
        // next turn reuses it instead of paying a cold start.
        detached: true,
        stdio: ["ignore", logFd, logFd]
      }
    );
    child.unref();
    const pid = child.pid ?? 0;
    if (pid) {
      try {
        writeFileSync13("/proc/" + String(pid) + "/oom_score_adj", "300");
      } catch {
      }
    }
    writeFileSync13(
      SERVER_STATE_FILE,
      JSON.stringify({ pid, port: OPENCODE_SERVER_PORT })
    );
    return pid;
  } finally {
    closeSync(logFd);
  }
}
function processAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
async function waitForHealth(pid) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await probeHealth()) return;
    if (pid && !processAlive(pid)) {
      throw new Error(
        "opencode serve exited during startup. Server log tail:\\n" + readOpencodeServerLogTail()
      );
    }
    await sleep5(HEALTH_POLL_INTERVAL_MS);
  }
  throw new Error(
    "opencode serve did not become healthy on " + opencodeServerBaseUrl + " within " + String(STARTUP_TIMEOUT_MS) + "ms. Server log tail:\\n" + readOpencodeServerLogTail()
  );
}
function acquireStartupLock() {
  try {
    mkdirSync9(SERVER_LOCK_DIR);
    return true;
  } catch {
    try {
      const ageMs = Date.now() - statSync3(SERVER_LOCK_DIR).mtimeMs;
      if (ageMs > LOCK_STALE_MS) {
        rmSync2(SERVER_LOCK_DIR, { recursive: true, force: true });
        mkdirSync9(SERVER_LOCK_DIR);
        log("opencode server startup lock was stale \\u2014 reclaimed");
        return true;
      }
    } catch {
    }
    return false;
  }
}
function releaseStartupLock() {
  try {
    rmSync2(SERVER_LOCK_DIR, { recursive: true, force: true });
  } catch {
  }
}
async function ensureOpencodeServer() {
  mkdirSync9(OPENCODE_RUNTIME_HOME_DIR, { recursive: true });
  if (await probeHealth()) return opencodeServerBaseUrl;
  if (!acquireStartupLock()) {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep5(HEALTH_POLL_INTERVAL_MS);
      if (await probeHealth()) return opencodeServerBaseUrl;
      if (!existsSync10(SERVER_LOCK_DIR)) break;
    }
    if (await probeHealth()) return opencodeServerBaseUrl;
    releaseStartupLock();
    if (!acquireStartupLock()) {
      throw new Error(
        "could not acquire the opencode server startup lock. Server log tail:\\n" + readOpencodeServerLogTail()
      );
    }
  }
  try {
    if (await probeHealth()) return opencodeServerBaseUrl;
    killRecordedServer();
    const startedAt = Date.now();
    const pid = spawnServer();
    await waitForHealth(pid);
    log(
      "opencode serve ready on " + opencodeServerBaseUrl + " (pid=" + String(pid) + ", " + String(Date.now() - startedAt) + "ms)"
    );
    return opencodeServerBaseUrl;
  } finally {
    releaseStartupLock();
  }
}

// callback-src/providers/opencodeSdk.ts
var SDK_PACKAGE3 = "@opencode-ai/sdk";
var SDK_VERSION3 = "1.18.16";
var SDK_ENTRY_RELPATH2 = "/dist/client.js";
var IDLE_PROBE_AFTER_MS = 6e4;
var IDLE_PROBE_INTERVAL_MS = 15e3;
var IDLE_PROBE_STREAK = 2;
async function loadOpencodeSdk() {
  const mod = await import(resolvePinnedSdkEntry({
    packageName: SDK_PACKAGE3,
    version: SDK_VERSION3,
    entryRelPath: SDK_ENTRY_RELPATH2
  }));
  return mod;
}
function readPromptText4() {
  return readFileSync13("/tmp/design-prompt.txt", "utf8");
}
function splitOpencodeModel(raw) {
  const separator = raw.indexOf("/");
  if (separator <= 0 || separator === raw.length - 1) {
    return { providerID: "", modelID: raw };
  }
  return {
    providerID: raw.slice(0, separator),
    modelID: raw.slice(separator + 1)
  };
}
function createPartEmitState() {
  return { emittedTextLength: /* @__PURE__ */ new Map(), emittedToolStatus: /* @__PURE__ */ new Map() };
}
function opencodePartToCliLine(part, state) {
  if (part.type === "text" || part.type === "reasoning") {
    const emitted = state.emittedTextLength.get(part.id) ?? 0;
    if (part.text.length <= emitted) return null;
    const delta = part.text.slice(emitted);
    state.emittedTextLength.set(part.id, part.text.length);
    return JSON.stringify({
      type: part.type,
      part: { ...part, text: delta },
      sessionID: part.sessionID
    });
  }
  if (part.type === "tool") {
    if (state.emittedToolStatus.get(part.id) === part.state.status) return null;
    state.emittedToolStatus.set(part.id, part.state.status);
    return JSON.stringify({
      type: "tool_use",
      part,
      sessionID: part.sessionID
    });
  }
  if (part.type === "step-start" || part.type === "step-finish") {
    return JSON.stringify({
      type: part.type === "step-start" ? "step_start" : "step_finish",
      part,
      sessionID: part.sessionID
    });
  }
  return null;
}
function opencodeEventSessionId(event) {
  const properties = event.properties;
  if (!properties) return "";
  return properties.part?.sessionID ?? properties.info?.sessionID ?? properties.sessionID ?? "";
}
function opencodeErrorMessage(error) {
  if (!error) return "";
  return error.data?.message || error.name || "Opencode error";
}
var ZERO_USAGE2 = {
  costUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  model: ""
};
function readTurnUsage(info) {
  return {
    costUsd: info.cost,
    inputTokens: info.tokens.input,
    outputTokens: info.tokens.output + info.tokens.reasoning,
    cacheReadTokens: info.tokens.cache.read,
    cacheWriteTokens: info.tokens.cache.write,
    model: info.modelID
  };
}
function readMessageText(parts) {
  let text = "";
  for (const part of parts) {
    if (part.type === "text") text += part.text;
  }
  return text;
}
function resultFailure(result) {
  return opencodeErrorMessage(result.error) || (result.response ? "HTTP " + String(result.response.status) : "no data");
}
async function ensureEvaMcpServers(client, servers = evaMcpServers) {
  const configured = Object.entries(servers);
  if (configured.length === 0) return;
  try {
    const status = await client.mcp.status();
    if (!status.data) {
      log("opencode mcp.status failed: " + resultFailure(status));
      return;
    }
    for (const [name, server] of configured) {
      if (status.data[name]) continue;
      const added = await client.mcp.add({
        body: {
          name,
          config: {
            type: "remote",
            url: server.url,
            headers: server.headers,
            enabled: true
          }
        }
      });
      log(
        added.data ? "opencode mcp server " + name + " registered (" + (added.data[name]?.status ?? "unknown") + ")" : "opencode mcp.add " + name + " failed: " + resultFailure(added)
      );
    }
  } catch (error) {
    log(
      "opencode mcp registration failed: " + (error instanceof Error ? error.message : String(error))
    );
  }
}
function requireData(result, what) {
  if (result.data === void 0) {
    throw new Error("opencode " + what + " failed: " + resultFailure(result));
  }
  return result.data;
}
async function runOpencodeSdkAttempt(sessionMode) {
  resetAttemptState();
  callbackState.activeAttemptStartedAt = Date.now();
  updateThinkingStep(
    "Starting Opencode agent...",
    sessionMode.mode === "resume" ? "Restoring saved context..." : "Creating Opencode session..."
  );
  log(
    "runOpencodeSdkAttempt started (mode=" + sessionMode.mode + ", sessionId=" + (sessionMode.sessionId || "none") + ")"
  );
  let attemptOutput = "";
  let lastEventAt2 = Date.now();
  let watchdogClock = Date.now();
  let timedOutForNoOutput = false;
  let timedOutForMaxRuntime = false;
  let sawResult = false;
  let resultIsError = false;
  let attemptErrorMessage = "";
  const sdk = await loadOpencodeSdk();
  const baseUrl = await ensureOpencodeServer();
  const client = sdk.createOpencodeClient({
    baseUrl,
    directory: WORK_DIR
  });
  await ensureEvaMcpServers(client);
  const persistSessionId = (sessionId2) => {
    callbackState.activeOpencodeSessionId = sessionId2;
    writeOpencodeSessionState();
    syncOpencodeStateToPersist();
  };
  const createFreshSession = async () => {
    const created = requireData(
      await client.session.create(),
      "session.create"
    );
    if (created.version !== SDK_VERSION3) {
      log(
        "opencode server version " + created.version + " differs from the SDK pin " + SDK_VERSION3
      );
    }
    persistSessionId(created.id);
    return created.id;
  };
  let sessionId = "";
  if (sessionMode.mode === "resume" && sessionMode.sessionId) {
    const existing = await client.session.get({
      path: { id: sessionMode.sessionId }
    });
    if (existing.data) {
      sessionId = existing.data.id;
      persistSessionId(sessionId);
    } else {
      log(
        "runOpencodeSdkAttempt: session " + sessionMode.sessionId + " unknown to the server \\u2014 starting a fresh session"
      );
      appendToRawLogFile(
        "[sdk-retry] resume session not found: " + sessionMode.sessionId + "\\n"
      );
      sessionId = await createFreshSession();
    }
  } else {
    sessionId = await createFreshSession();
  }
  const promptText = readPromptText4();
  const combinedPrompt = SYSTEM_PROMPT ? SYSTEM_PROMPT + "\\n\\n" + promptText : promptText;
  const model = splitOpencodeModel(normalizedOpencodeModel);
  const emitState = createPartEmitState();
  const streamAbort = new AbortController();
  let terminalReached = false;
  let resolveTerminal = () => {
  };
  const terminal = new Promise((resolve) => {
    resolveTerminal = resolve;
  });
  const markTerminal = () => {
    if (terminalReached) return;
    terminalReached = true;
    resolveTerminal();
  };
  let assistantMessageId = "";
  let usage = ZERO_USAGE2;
  let turnErrorMessage = "";
  let sawSessionEvent = false;
  let idleProbeStreak = 0;
  let idleProbeInFlight = false;
  let lastIdleProbeAt = 0;
  const pushLine = (line) => {
    appendToRawLogFile(line);
    attemptOutput = trimBufferHead(attemptOutput + line);
    appendToRawOutput(line);
    processRealtimeStdoutChunk(line);
  };
  const emitPart = (part) => {
    const line = opencodePartToCliLine(part, emitState);
    if (line) pushLine(line + "\\n");
  };
  const abortTurn = () => {
    client.session.abort({ path: { id: sessionId } }).catch(() => {
    });
    markTerminal();
  };
  const probeSessionIdle = async () => {
    if (idleProbeInFlight || terminalReached || !sawSessionEvent) return;
    idleProbeInFlight = true;
    lastIdleProbeAt = Date.now();
    try {
      const status = await client.session.status();
      if (!status.data) return;
      const sessionStatus = status.data[sessionId];
      const idle = !sessionStatus || sessionStatus.type === "idle";
      idleProbeStreak = idle ? idleProbeStreak + 1 : 0;
      if (idleProbeStreak >= IDLE_PROBE_STREAK) {
        log(
          "runOpencodeSdkAttempt: server reports the session idle after an event gap \\u2014 finishing turn"
        );
        appendToRawLogFile(
          "[sdk-recover] session idle detected by status poll\\n"
        );
        markTerminal();
      }
    } catch {
    } finally {
      idleProbeInFlight = false;
    }
  };
  const healthTimer = setInterval(() => {
    const now = Date.now();
    if (terminalReached) return;
    if (callbackState.fatalHeartbeatErrorMessage) {
      attemptErrorMessage = callbackState.fatalHeartbeatErrorMessage;
      abortTurn();
      return;
    }
    if (now - callbackState.activeAttemptStartedAt > MAX_TOTAL_RUNTIME_MS) {
      timedOutForMaxRuntime = true;
      log("runOpencodeSdkAttempt: max runtime exceeded \\u2014 aborting turn");
      abortTurn();
      return;
    }
    if (callbackState.inFlightToolUses > 0) {
      watchdogClock = now;
    }
    if (now - lastEventAt2 > IDLE_PROBE_AFTER_MS && now - lastIdleProbeAt > IDLE_PROBE_INTERVAL_MS) {
      void probeSessionIdle();
    }
    if (now - watchdogClock > NO_OUTPUT_TIMEOUT_MS * 5) {
      timedOutForNoOutput = true;
      log("runOpencodeSdkAttempt: no SDK events \\u2014 aborting turn");
      abortTurn();
    }
  }, NO_OUTPUT_CHECK_INTERVAL_MS);
  const consumeEvents = async (stream) => {
    for await (const event of stream) {
      if (terminalReached) break;
      if (opencodeEventSessionId(event) !== sessionId) continue;
      lastEventAt2 = Date.now();
      watchdogClock = lastEventAt2;
      sawSessionEvent = true;
      idleProbeStreak = 0;
      const part = event.properties?.part;
      if (event.type === "message.part.updated" && part) {
        emitPart(part);
        continue;
      }
      const info = event.properties?.info;
      if (event.type === "message.updated" && info?.role === "assistant") {
        assistantMessageId = info.id;
        usage = readTurnUsage(info);
        if (info.error) turnErrorMessage = opencodeErrorMessage(info.error);
        continue;
      }
      if (event.type === "session.error") {
        turnErrorMessage = opencodeErrorMessage(event.properties?.error);
        continue;
      }
      if (event.type === "session.idle") {
        markTerminal();
        break;
      }
    }
  };
  try {
    const events = await client.event.subscribe({ signal: streamAbort.signal });
    const consumed2 = consumeEvents(events.stream);
    consumed2.catch(() => {
    });
    const accepted = await client.session.promptAsync({
      path: { id: sessionId },
      body: {
        ...model.providerID ? { model } : {},
        parts: [{ type: "text", text: combinedPrompt }]
      }
    });
    if (accepted.error || accepted.response?.ok === false) {
      throw new Error(
        "opencode session.promptAsync failed: " + resultFailure(accepted)
      );
    }
    lastEventAt2 = Date.now();
    watchdogClock = lastEventAt2;
    await Promise.race([terminal, consumed2]);
    markTerminal();
    const finalMessage = assistantMessageId ? await client.session.message({
      path: { id: sessionId, messageID: assistantMessageId }
    }) : null;
    let resultText = "";
    const finalData = finalMessage?.data;
    if (finalData && finalData.info.role === "assistant") {
      for (const part of finalData.parts) emitPart(part);
      usage = readTurnUsage(finalData.info);
      if (finalData.info.error) {
        turnErrorMessage = opencodeErrorMessage(finalData.info.error);
      }
      resultText = readMessageText(finalData.parts);
    }
    resultIsError = Boolean(turnErrorMessage);
    pushLine(
      JSON.stringify({
        type: "result",
        is_error: resultIsError,
        result: resultText || turnErrorMessage,
        duration_ms: Date.now() - callbackState.activeAttemptStartedAt,
        total_cost_usd: usage.costUsd,
        model: usage.model || normalizedOpencodeModel,
        usage: {
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          cache_read_input_tokens: usage.cacheReadTokens,
          cache_creation_input_tokens: usage.cacheWriteTokens
        }
      }) + "\\n"
    );
    sawResult = true;
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    attemptErrorMessage = messageText;
    log("runOpencodeSdkAttempt: turn failed \\u2014 " + messageText);
    appendToRawLogFile("[sdk-error] " + messageText + "\\n");
    callbackState.stderrOutput = trimBufferHead(
      callbackState.stderrOutput + messageText + "\\n" + readOpencodeServerLogTail(1e3) + "\\n"
    );
  } finally {
    clearInterval(healthTimer);
    markTerminal();
    streamAbort.abort();
  }
  const code = sawResult && !resultIsError && !timedOutForMaxRuntime && !timedOutForNoOutput ? 0 : 1;
  log(
    "runOpencodeSdkAttempt finished in " + String(Date.now() - callbackState.activeAttemptStartedAt) + "ms (code=" + code + ", sawResult=" + sawResult + ", resultIsError=" + resultIsError + ", timedOutForNoOutput=" + timedOutForNoOutput + ", timedOutForMaxRuntime=" + timedOutForMaxRuntime + ", outputBytes=" + attemptOutput.length + (attemptErrorMessage ? ", turnError=" + attemptErrorMessage : "") + ")"
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
  return await runCodexSdkAttempt(sessionMode);
}
async function runOpencodeAttempt(sessionMode) {
  return await runOpencodeSdkAttempt(sessionMode);
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
if (IS_CURSOR_TURN_WORKER) {
  try {
    await runCursorTurnWorker();
    process.exit(0);
  } catch (error) {
    log(
      "cursor turn worker failed: " + (error instanceof Error ? error.message : String(error))
    );
    process.exit(1);
  }
}
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
  unlinkSync4(READY_FILE);
} catch {
}
try {
  writeFileSync14("/proc/self/oom_score_adj", "-600");
} catch {
}
callbackState.lastStepType = "thinking";
materializeSystemSkills();
if (CLAIM_MUTATION) {
  if (PROVIDER === "claude") {
    await runSdkDaemon();
  }
  if (PROVIDER === "codex") {
    await runCodexAppServerDaemon();
  }
  if (PROVIDER === "cursor") {
    await runCursorDaemon();
  }
}
var preflightOk = await runPreflightHeartbeat();
if (!preflightOk) {
  writeDoneFile("preflight-failed");
  process.exit(1);
}
startStreamingLoops();
for (const d of [WORK_DIR + "/screenshots", WORK_DIR + "/recordings"]) {
  try {
    mkdirSync10(d, { recursive: true });
  } catch {
  }
}
await ensureGithubToken({
  convexUrl: CONVEX_URL,
  convexToken: CONVEX_TOKEN,
  repoId: REPO_ID
});
log(
  "entityId=" + ENTITY_ID + " provider=" + PROVIDER + " model=" + MODEL + " tools=" + ALLOWED_TOOLS + " sessionId=" + (process.env.CLAUDE_SESSION_ID || "none") + " mcp=" + (hasMcpConfig ? "yes" : "no")
);
try {
  beginTurnCheckpoint();
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
  if (await setFinalizingState()) process.exit(0);
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
  if (finalResultEvent?.rawResultEvent) {
    completionArgs.rawResultEvent = finalResultEvent.rawResultEvent;
  }
  if (callbackState.pendingQuestionData) {
    completionArgs.pendingQuestion = callbackState.pendingQuestionData;
  }
  appendCurrentTurnLease(completionArgs);
  persistTurnWork();
  try {
    await deliverCompletionWithMedia(completionArgs);
    endTurnOwnership();
    syncProviderStateToPersist("completion");
    await stopStreamingLoops();
    await waitForPendingClaudeUsageReport();
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
  persistTurnWork();
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
      err instanceof Error ? err.message : "Failed to run " + (PROVIDER === "codex" ? "Codex SDK" : PROVIDER === "opencode" ? "Opencode CLI" : PROVIDER === "cursor" ? "Cursor CLI" : "Claude CLI")
    ),
    activityLog: serializeSteps(callbackState.accumulatedSteps)
  };
  if (RUN_ID) errorArgs.runId = RUN_ID;
  appendCurrentTurnLease(errorArgs);
  appendTurnCheckpoint(errorArgs);
  try {
    await callConvexWithRetry("mutation", COMPLETION_MUTATION ?? "", errorArgs);
  } catch {
  }
  process.exit(1);
}
`.trim();
