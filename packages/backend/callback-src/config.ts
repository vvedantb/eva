import { existsSync } from "fs";
import { hasEvaMcpConfig } from "./evaMcp.js";

export const CONVEX_URL = process.env.CONVEX_URL;
export const CONVEX_SITE_URL = process.env.CONVEX_SITE_URL || CONVEX_URL;
export const CONVEX_TOKEN = process.env.CONVEX_TOKEN;
export const STREAMING_HMAC = process.env.STREAMING_HMAC || "";
/** Short-lived, single-use credential for `/api/harness-skills/report`. */
export const HARNESS_CATALOG_TOKEN = process.env.HARNESS_CATALOG_TOKEN || "";
export const HARNESS_CATALOG_SANDBOX_ID =
  process.env.HARNESS_CATALOG_SANDBOX_ID || "";
export const ENTITY_ID = process.env.ENTITY_ID;
export const STREAMING_ENTITY_ID = process.env.STREAMING_ENTITY_ID || ENTITY_ID;
export const RUN_ID = process.env.RUN_ID || null;
export const TURN_ID = process.env.TURN_ID || null;
const parsedTurnLeaseGeneration = Number(process.env.TURN_LEASE_GENERATION);
export const TURN_LEASE_GENERATION =
  Number.isSafeInteger(parsedTurnLeaseGeneration) &&
  parsedTurnLeaseGeneration > 0
    ? parsedTurnLeaseGeneration
    : null;
export const ENTITY_ID_FIELD = process.env.ENTITY_ID_FIELD;
/** App subdirectory (e.g. apps/eprocurement) — also scanned for agent media. */
export const ROOT_DIRECTORY = process.env.ROOT_DIRECTORY || "";
export const COMPLETION_MUTATION = process.env.COMPLETION_MUTATION;
/** Public mutation the warm daemon polls to claim staged turns. */
export const CLAIM_MUTATION = process.env.CLAIM_MUTATION;
/** Daemon-minted synthetic continuation turn open/complete mutations. */
export const OPEN_SYNTHETIC_TURN_MUTATION =
  process.env.OPEN_SYNTHETIC_TURN_MUTATION;
export const COMPLETE_SYNTHETIC_TURN_MUTATION =
  process.env.COMPLETE_SYNTHETIC_TURN_MUTATION;
export const UPDATE_BACKGROUND_AGENTS_MUTATION =
  process.env.UPDATE_BACKGROUND_AGENTS_MUTATION;
export const REQUIRE_TASK_COMMIT = process.env.REQUIRE_TASK_COMMIT === "true";
export const PROVIDER = process.env.AI_PROVIDER || "claude";
export const MODEL =
  process.env.AI_MODEL || process.env.CLAUDE_MODEL || "claude:sonnet";
export const ALLOWED_TOOLS = process.env.ALLOWED_TOOLS || "Read,Glob,Grep";
/**
 * This turn may not modify the workspace (set for Manager Ave, the master
 * session, which supervises agents and never implements).
 *
 * Provider-agnostic on purpose: `ALLOWED_TOOLS` above is Claude's tool
 * vocabulary and only `claudeSdk.ts` can read it, so every other adapter keys
 * off this boolean and applies its own restriction — Cursor `disallowedTools`,
 * Codex `sandboxMode: "read-only"`. On Claude and Cursor, shell and MCP stay
 * fully available: the master reads production logs through the shell and
 * orchestrates the fleet through MCP. Codex restricts at the sandbox instead of
 * per tool, so see `codexSdk.ts` for what that does and does not guarantee.
 * OpenCode has no restriction — its SDK is fetched at runtime and exposes no
 * verified tool-permission option, so there the prompt is the only gate.
 */
export const NO_WRITES = process.env.EVA_NO_WRITES === "1";
/**
 * Human-in-the-loop AskUserQuestion. The Agent SDK exposes the `canUseTool`
 * pause needed to block a turn on an answer, and only sessions currently wire the
 * answering UI — so this is gated to session runs. Elsewhere AskUserQuestion
 * stays the old fire-and-forget metadata (surfaced after the turn). When enabled
 * the SDK drops `bypassPermissions` for a `canUseTool` gate that auto-allows every
 * tool except AskUserQuestion (which waits for the user's answer via Convex).
 */
export const BLOCKING_QUESTIONS_ENABLED =
  process.env.ENTITY_ID_FIELD === "sessionId";
/** Fingerprint of the callback bundle this daemon was started with; exit when disk fp differs. */
export const CALLBACK_SCRIPT_FP = process.env.CALLBACK_SCRIPT_FP || "";
/**
 * Opaque model+tools signature the launcher computed for this daemon. Written to
 * /tmp/eva-daemon.opts at boot so a later prewarm can detect a model/tools change
 * and respawn the daemon instead of reusing it with the wrong options.
 */
export const DAEMON_OPTS_SIG = process.env.EVA_DAEMON_OPTS || "";
/** Internal process-isolation handoff used by the Cursor daemon. */
export const CURSOR_TURN_WORKER_PROMPT_FILE =
  process.env.EVA_CURSOR_TURN_WORKER_PROMPT_FILE || "";
export const CURSOR_TURN_WORKER_LIFECYCLE =
  process.env.EVA_CURSOR_TURN_WORKER_LIFECYCLE || "";
export const CURSOR_TURN_WORKER_TURN_ID =
  process.env.EVA_CURSOR_TURN_WORKER_TURN_ID || "";
const parsedCursorWorkerLeaseGeneration = Number(
  process.env.EVA_CURSOR_TURN_WORKER_LEASE_GENERATION,
);
export const CURSOR_TURN_WORKER_LEASE_GENERATION = Number.isSafeInteger(
  parsedCursorWorkerLeaseGeneration,
)
  ? parsedCursorWorkerLeaseGeneration
  : 0;
export const IS_CURSOR_TURN_WORKER = CURSOR_TURN_WORKER_PROMPT_FILE.length > 0;
export const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "";
export const WORK_DIR = existsSync("/tmp/repo")
  ? "/tmp/repo"
  : existsSync("/workspace/repo")
    ? "/workspace/repo"
    : "/tmp/repo";
export const NO_OUTPUT_TIMEOUT_MS = Number(
  process.env.CLAUDE_NO_OUTPUT_TIMEOUT_MS || "60000",
);
export const FIRST_EVENT_TIMEOUT_MS = Number(
  process.env.CLAUDE_FIRST_EVENT_TIMEOUT_MS || "90000",
);
export const POST_TEXT_STALL_TIMEOUT_MS = Number(
  process.env.CLAUDE_POST_TEXT_STALL_TIMEOUT_MS || "90000",
);
export const FIRST_ASSISTANT_EVENT_TIMEOUT_MS = Number(
  process.env.CLAUDE_FIRST_ASSISTANT_EVENT_TIMEOUT_MS || "120000",
);
export const NO_OUTPUT_CHECK_INTERVAL_MS = 5000;
export const MAX_TOTAL_RUNTIME_MS = Number(
  process.env.CLAUDE_MAX_TOTAL_RUNTIME_MS || "5400000",
);
export const SCRIPT_STARTED_AT = Date.now();
export const CALLBACK_HTTP_TIMEOUT_MS = Number(
  process.env.CALLBACK_HTTP_TIMEOUT_MS || "18000",
);
export const CALLBACK_HTTP_MAX_RETRIES = Number(
  process.env.CALLBACK_HTTP_MAX_RETRIES || "4",
);
export const CALLBACK_HTTP_RETRY_BASE_MS = 1000;
export const STREAMING_HEARTBEAT_MAX_RETRIES = Number(
  process.env.CALLBACK_STREAMING_HEARTBEAT_MAX_RETRIES || "4",
);
export const HEARTBEAT_FATAL_BURST = Number(
  process.env.CALLBACK_HEARTBEAT_FATAL_BURST || "10",
);
export const HEARTBEAT_FATAL_SLOW_COUNT = Number(
  process.env.CALLBACK_HEARTBEAT_FATAL_SLOW_COUNT || "8",
);
export const HEARTBEAT_FATAL_SLOW_WINDOW_MS = Number(
  process.env.CALLBACK_HEARTBEAT_FATAL_SLOW_WINDOW_MS || "180000",
);
export const HEARTBEAT_ABSOLUTE_MAX_FAILURES = Number(
  process.env.CALLBACK_HEARTBEAT_ABSOLUTE_MAX_FAILURES || "28",
);
export const OUTPUT_BUFFER_MAX_BYTES = Number(
  process.env.CALLBACK_OUTPUT_BUFFER_MAX_BYTES || "2000000",
);
export const READY_FILE = "/tmp/run-design.ready";
export const RAW_LOG_FILE = "/tmp/run-design.raw.jsonl";
export const DONE_FILE = "/tmp/run-design.done";
export const CLAUDE_BASE_CONFIG_DIR =
  process.env.CLAUDE_BASE_CONFIG_DIR || "/home/eva/.claude";
export const CLAUDE_RUNTIME_CONFIG_DIR =
  process.env.CLAUDE_RUNTIME_CONFIG_DIR || "/tmp/claude-config";
export const CLAUDE_PERSIST_DIR =
  process.env.CLAUDE_PERSIST_DIR || "/home/eva/.claude-persist";
export const CODEX_RUNTIME_HOME_DIR =
  process.env.CODEX_RUNTIME_HOME_DIR || "/tmp/codex-home";
export const CODEX_PERSIST_DIR =
  process.env.CODEX_PERSIST_DIR || "/home/eva/.codex-persist";
export const CODEX_BIN_PATH =
  process.env.CODEX_BIN_PATH || "/tmp/codex-cli/bin/codex";
const CODEX_STATE_FILE = "session-state.json";
export const CODEX_LOCAL_STATE_FILE =
  CODEX_RUNTIME_HOME_DIR + "/" + CODEX_STATE_FILE;
export const CODEX_PERSIST_STATE_FILE =
  CODEX_PERSIST_DIR + "/" + CODEX_STATE_FILE;
export const CODEX_AUTH_FILE = CODEX_RUNTIME_HOME_DIR + "/auth.json";
export const CODEX_PERSIST_AUTH_FILE = CODEX_PERSIST_DIR + "/auth.json";
export const CODEX_AUTH_JSON = process.env.CODEX_AUTH_JSON || "";
export const CODEX_AUTH_JSON_BASE64 = process.env.CODEX_AUTH_JSON_BASE64 || "";
export const CODEX_CONFIG_TOML = process.env.CODEX_CONFIG_TOML || "";
export const CODEX_CONFIG_TOML_BASE64 =
  process.env.CODEX_CONFIG_TOML_BASE64 || "";
export const OPENCODE_RUNTIME_HOME_DIR =
  process.env.OPENCODE_RUNTIME_HOME_DIR || "/tmp/opencode-home";
export const OPENCODE_PERSIST_DIR =
  process.env.OPENCODE_PERSIST_DIR || "/home/eva/.opencode-persist";
const OPENCODE_BIN_PATH =
  process.env.EVA_OPENCODE_BIN_PATH || "/tmp/opencode-cli/bin/opencode";
/** Loopback port for the Eva-managed `opencode serve` process. */
export const OPENCODE_SERVER_PORT = Number(
  process.env.OPENCODE_SERVER_PORT || "4096",
);
const OPENCODE_STATE_FILE = "session-state.json";
export const OPENCODE_LOCAL_STATE_FILE =
  OPENCODE_RUNTIME_HOME_DIR + "/" + OPENCODE_STATE_FILE;
export const OPENCODE_PERSIST_STATE_FILE =
  OPENCODE_PERSIST_DIR + "/" + OPENCODE_STATE_FILE;
export const OPENCODE_CONFIG_JSON = process.env.OPENCODE_CONFIG_JSON || "";
export const OPENCODE_CONFIG_JSON_BASE64 =
  process.env.OPENCODE_CONFIG_JSON_BASE64 || "";
export const OPENCODE_AUTH_DIR = "/home/eva/.local/share/opencode";
export const OPENCODE_AUTH_FILE = OPENCODE_AUTH_DIR + "/auth.json";
export const OPENCODE_PERSIST_AUTH_FILE = OPENCODE_PERSIST_DIR + "/auth.json";
export const OPENCODE_AUTH_JSON = process.env.OPENCODE_AUTH_JSON || "";
export const OPENCODE_AUTH_JSON_BASE64 =
  process.env.OPENCODE_AUTH_JSON_BASE64 || "";
export const CURSOR_RUNTIME_HOME_DIR =
  process.env.CURSOR_RUNTIME_HOME_DIR || "/tmp/cursor-home";
export const CURSOR_PERSIST_DIR =
  process.env.CURSOR_PERSIST_DIR || "/home/eva/.cursor-persist";
const CURSOR_STATE_FILE = "session-state.json";
export const CURSOR_LOCAL_STATE_FILE =
  CURSOR_RUNTIME_HOME_DIR + "/" + CURSOR_STATE_FILE;
export const CURSOR_PERSIST_STATE_FILE =
  CURSOR_PERSIST_DIR + "/" + CURSOR_STATE_FILE;
/** State root for the Cursor SDK's SQLite agent store (`index.db` plus a
 * per-agent `store.db`) — on the persist volume so conversation state
 * (agents/runs/checkpoints) survives sandbox stop/resume. Sandboxes that ran
 * the earlier JSONL store may still hold its `*.ndjson` files here; they are
 * ignored. */
export const CURSOR_SDK_STORE_DIR = CURSOR_PERSIST_DIR + "/sdk";
const CLAUDE_SESSION_PROJECT_DIR = WORK_DIR.replace(/\//g, "-");
export const CLAUDE_LOCAL_PROJECT_DIR =
  CLAUDE_RUNTIME_CONFIG_DIR + "/projects/" + CLAUDE_SESSION_PROJECT_DIR;
export const CLAUDE_PERSIST_PROJECT_DIR =
  CLAUDE_PERSIST_DIR + "/projects/" + CLAUDE_SESSION_PROJECT_DIR;
const CLAUDE_STATE_FILE_NAME = "session-state.json";
export const CLAUDE_LOCAL_STATE_FILE =
  CLAUDE_RUNTIME_CONFIG_DIR + "/" + CLAUDE_STATE_FILE_NAME;
export const CLAUDE_PERSIST_STATE_FILE =
  CLAUDE_PERSIST_DIR + "/" + CLAUDE_STATE_FILE_NAME;
export const CLAUDE_SYNC_TIMEOUT_MS = Number(
  process.env.CLAUDE_SYNC_TIMEOUT_MS || "10000",
);
export const CLAUDE_SYNC_PER_FILE_TIMEOUT_SECONDS = Number(
  process.env.CLAUDE_SYNC_PER_FILE_TIMEOUT_SECONDS || "5",
);

const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
if (GH_TOKEN) {
  process.env.GH_TOKEN = GH_TOKEN;
  process.env.GITHUB_TOKEN = GH_TOKEN;
}
process.env.GH_PROMPT_DISABLED = "1";
process.env.GH_NO_UPDATE_NOTIFIER = "1";

export const REPO_ID = process.env.REPO_ID;

/**
 * The connected provider account whose credentials this run authenticated as.
 * Set by the launcher only when an account override actually took effect, so an
 * empty value means the run used the sandbox's shared team credential — which is
 * exactly the attribution a usage-limit reading needs (plan limits are per
 * account, and two accounts' readings must not overwrite each other).
 */
export const PROVIDER_ACCOUNT_ID = process.env.PROVIDER_ACCOUNT_ID || "";

// --- Reasoning / thinking effort ---
// `AI_REASONING_EFFORT` is the abstract level from the traits menu, sent only
// when the user picks a non-default level. Mapped per provider below:
//   - Claude: Agent SDK `effort` option.
//   - Codex: `model_reasoning_effort` in config.toml (see codexSession.ts).
const REASONING_EFFORT = process.env.AI_REASONING_EFFORT || "";
const AI_THINKING_ENABLED = process.env.AI_THINKING_ENABLED || "";
const AI_CONTEXT_1M = process.env.AI_CONTEXT_1M || "";
const AI_FAST_MODE = process.env.AI_FAST_MODE || "";

const CLAUDE_EFFORT_LEVELS = new Set(["low", "medium", "high", "xhigh", "max"]);

export const claudeEffort =
  PROVIDER === "claude" && CLAUDE_EFFORT_LEVELS.has(REASONING_EFFORT)
    ? REASONING_EFFORT
    : "";

const CODEX_REASONING_EFFORT: Record<string, string> = {
  // GPT-5.6 Sol/Terra/Luna: none through `max`. GPT-6 Astra accepts
  // low through `max` — the picker never offers "off" for it.
  off: "none",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max",
};

export const codexReasoningEffort =
  PROVIDER === "codex" ? (CODEX_REASONING_EFFORT[REASONING_EFFORT] ?? "") : "";
export const codexFastMode = PROVIDER === "codex" && AI_FAST_MODE === "1";
export const cursorFastMode = PROVIDER === "cursor" && AI_FAST_MODE === "1";
export const cursorUse1mContext =
  PROVIDER === "cursor" && AI_CONTEXT_1M === "1";

/** User turned thinking off (traits toggle or Claude effort "off"). */
export const claudeThinkingDisabled =
  AI_THINKING_ENABLED === "0" ||
  (PROVIDER === "claude" && REASONING_EFFORT === "off");

function buildSettingsJson(): string {
  const settings: {
    attribution: { commit: string; pr: string };
    alwaysThinkingEnabled?: false;
  } = {
    attribution: { commit: "", pr: "" },
  };
  if (claudeThinkingDisabled) {
    settings.alwaysThinkingEnabled = false;
  }
  return JSON.stringify(settings);
}

export const settingsJson = buildSettingsJson();
/** True when Eva MCP auth was supplied at callback startup. */
export const hasMcpConfig = hasEvaMcpConfig;
const claudeModelBase = MODEL.startsWith("claude:")
  ? MODEL.slice("claude:".length)
  : MODEL;
export const normalizedClaudeModel =
  PROVIDER === "claude" && AI_CONTEXT_1M === "1"
    ? `${claudeModelBase}[1m]`
    : claudeModelBase;
export const normalizedCodexModel = MODEL.startsWith("codex:")
  ? MODEL.slice("codex:".length)
  : MODEL;
export const normalizedOpencodeModel = MODEL.startsWith("opencode:")
  ? MODEL.slice("opencode:".length)
  : MODEL;
// Legacy Eva cursor model ids baked a reasoning level into the slug (the
// retired grok-4.5-low, gpt-5.5-low). The SDK rejects those: its model list
// carries base ids only, with reasoning exposed as a per-model parameter.
// Split here; the runner discovers the parameter id at runtime and degrades
// to the base id when the model has none (resolveCursorModelSelection).
// xhigh before high: "grok-4.6-xhigh".endsWith("-high") is also true.
const CURSOR_REASONING_LEVELS = ["xhigh", "medium", "low", "high"];

export function splitCursorModel(raw: string): { base: string; level: string } {
  // Legacy CLI-era slugs: cursor-grok-4.5-* → grok-4.5-*.
  const unprefixed = raw.startsWith("cursor-grok-")
    ? raw.slice("cursor-".length)
    : raw;
  for (const level of CURSOR_REASONING_LEVELS) {
    const suffix = "-" + level;
    if (unprefixed.endsWith(suffix)) {
      return { base: unprefixed.slice(0, -suffix.length), level };
    }
  }
  return { base: unprefixed, level: "" };
}

const cursorModelRaw = MODEL.startsWith("cursor:")
  ? MODEL.slice("cursor:".length)
  : MODEL;
const cursorModelParts = splitCursorModel(cursorModelRaw);
export const normalizedCursorModel = cursorModelParts.base;

// Abstract traits-menu level → cursor reasoning level. Grok 4.6 accepts
// xhigh; max still clamps to high (no Cursor model exposes max). Off sends
// the bare model. Falls back to the legacy id suffix for pre-migration
// AI_MODEL values that carried the level in the slug.
const CURSOR_REASONING_EFFORT: Record<string, string> = {
  off: "",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "high",
};

export const cursorReasoningLevel =
  PROVIDER === "cursor" && REASONING_EFFORT in CURSOR_REASONING_EFFORT
    ? CURSOR_REASONING_EFFORT[REASONING_EFFORT]
    : cursorModelParts.level;
/**
 * Resolved `opencode` executable. Unquoted: it is spawned directly (no shell)
 * by the server manager, which is the only remaining caller now that turns run
 * through the SDK rather than `opencode run`.
 */
export const opencodeCommand = existsSync(OPENCODE_BIN_PATH)
  ? OPENCODE_BIN_PATH
  : "opencode";
export const TOOL_STEP_TYPES = new Set([
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
  "todos",
]);

// Pricing lives in @eva/shared so the web Usage page and this bundle read
// one table. Re-exported to keep `computeCodexCostUsd` imports unchanged.
export { CODEX_PRICING_PER_MILLION } from "@eva/shared/modelPricing";

export const completedLabels: Record<string, string> = {
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
  "Asking a question...": "Asked a question",
};
