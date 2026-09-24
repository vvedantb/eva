import { existsSync } from "fs";

export const CONVEX_URL = process.env.CONVEX_URL;
export const CONVEX_SITE_URL = process.env.CONVEX_SITE_URL || CONVEX_URL;
export const CONVEX_TOKEN = process.env.CONVEX_TOKEN;
export const STREAMING_HMAC = process.env.STREAMING_HMAC || "";
export const ENTITY_ID = process.env.ENTITY_ID;
export const STREAMING_ENTITY_ID = process.env.STREAMING_ENTITY_ID || ENTITY_ID;
export const RUN_ID = process.env.RUN_ID || null;
/**
 * The turn this process owns, for one-shot launches. Warm daemons span many
 * turns, so they ignore this and take the id from each `claimPendingTurn`
 * instead — see `runtime/turnLease.ts`.
 */
export const TURN_ID = process.env.TURN_ID || null;
export const ENTITY_ID_FIELD = process.env.ENTITY_ID_FIELD;
export const TASK_PROOF_CAPTURE_ENABLED =
  process.env.TASK_PROOF_CAPTURE_ENABLED !== "false";
/** App subdirectory (e.g. apps/eprocurement) — also scanned for proof media. */
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
/** Proof workflow resumes on completion — media must be saved before that mutation. */
export function isProofCompletionMutation(
  mutation: string | undefined = COMPLETION_MUTATION,
): boolean {
  return (mutation ?? "").includes("handleProofCompletion");
}
export const REQUIRE_TASK_COMMIT = process.env.REQUIRE_TASK_COMMIT === "true";
export const PROVIDER = process.env.AI_PROVIDER || "claude";
export const MODEL =
  process.env.AI_MODEL || process.env.CLAUDE_MODEL || "claude:sonnet";
export const ALLOWED_TOOLS = process.env.ALLOWED_TOOLS || "Read,Glob,Grep";
/**
 * Human-in-the-loop AskUserQuestion. The Agent SDK exposes the `canUseTool`
 * pause needed to block a turn on an answer, and only sessions currently wire the
 * answering UI — so this is gated to session runs. Elsewhere AskUserQuestion
 * stays the old fire-and-forget metadata (surfaced after the turn).
 *
 * Scope is only that question behaviour. Every agent turn installs `canUseTool`
 * regardless (see `providers/claudeSdk.ts`) — it is what grants MCP tools, which
 * `bypassPermissions` does not. Do not fold the two concerns back together.
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
export const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "";
export const WORK_DIR = existsSync("/tmp/repo")
  ? "/tmp/repo"
  : existsSync("/workspace/repo")
    ? "/workspace/repo"
    : "/tmp/repo";
export const NO_OUTPUT_TIMEOUT_MS = Number(
  process.env.CLAUDE_NO_OUTPUT_TIMEOUT_MS || "60000",
);
/**
 * Mid-stream silence cap for CLI attempts: kill when the provider stream emits
 * nothing for this long with no tool in flight and no result yet. The original
 * 45s idle-stdout kill was removed (c8bb7fb8) for murdering healthy quiet
 * runs; that left hung provider streams riding until MAX_TOTAL_RUNTIME_MS —
 * observed in prod as a cursor:grok turn silent for 29 minutes mid-turn.
 * 10 minutes is far beyond any legitimate token gap but bounds a dead stream.
 */
export const STREAM_SILENCE_TIMEOUT_MS = Number(
  process.env.CLAUDE_STREAM_SILENCE_TIMEOUT_MS || String(10 * 60 * 1000),
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
/**
 * Runner markers, entity-scoped by the launcher (`_sandbox_runtime/daemonPaths.ts`
 * owns the naming; it is passed in rather than recomputed here so there is one
 * definition). The legacy shared paths remain as the fallback for a runner
 * launched by a pre-Phase-3 deployment.
 */
export const PID_FILE = process.env.RUNNER_PID_FILE || "/tmp/run-design.pid";
export const READY_FILE =
  process.env.RUNNER_READY_FILE || "/tmp/run-design.ready";
export const DONE_FILE = process.env.RUNNER_DONE_FILE || "/tmp/run-design.done";
/** Written into the ready file so the launcher can tell its own runner from a predecessor's. */
export const LAUNCH_ID = process.env.RUNNER_LAUNCH_ID || "";
export const RAW_LOG_FILE = "/tmp/run-design.raw.jsonl";
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
const CODEX_BIN_PATH = process.env.CODEX_BIN_PATH || "/tmp/codex-cli/bin/codex";
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
/** Cursor SDK JSONL agent store — on the persist volume so conversation state
 * (agents/runs/checkpoints) survives sandbox stop/resume. */
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

// --- Reasoning / thinking effort ---
// `AI_REASONING_EFFORT` is the abstract level from the traits menu, sent only
// when the user picks a non-default level. Mapped per provider below:
//   - Claude: Agent SDK `effort` option.
//   - Codex: `model_reasoning_effort` in config.toml (see codexSession.ts).
const REASONING_EFFORT = process.env.AI_REASONING_EFFORT || "";
const AI_THINKING_ENABLED = process.env.AI_THINKING_ENABLED || "";
const AI_CONTEXT_1M = process.env.AI_CONTEXT_1M || "";

const CLAUDE_EFFORT_LEVELS = new Set(["low", "medium", "high", "xhigh", "max"]);

export const claudeEffort =
  PROVIDER === "claude" && CLAUDE_EFFORT_LEVELS.has(REASONING_EFFORT)
    ? REASONING_EFFORT
    : "";

const CODEX_REASONING_EFFORT: Record<string, string> = {
  // GPT-5.5 uses none/low/medium/high/xhigh; "minimal" kept for older CLIs.
  off: "none",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "xhigh",
};

export const codexReasoningEffort =
  PROVIDER === "codex" ? (CODEX_REASONING_EFFORT[REASONING_EFFORT] ?? "") : "";

function buildSettingsJson(): string {
  const settings: {
    attribution: { commit: string; pr: string };
    alwaysThinkingEnabled?: false;
  } = {
    attribution: { commit: "", pr: "" },
  };
  const thinkingDisabled =
    AI_THINKING_ENABLED === "0" ||
    (PROVIDER === "claude" && REASONING_EFFORT === "off");
  if (thinkingDisabled) {
    settings.alwaysThinkingEnabled = false;
  }
  return JSON.stringify(settings);
}

export const settingsJson = buildSettingsJson();
/** True when the sandbox MCP config file is present (used for startup logging). */
export const hasMcpConfig = existsSync("/tmp/eva-mcp.json");
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
// Eva's cursor model ids bake a reasoning level into the slug (grok-4.5-low,
// gpt-5.5-low). The SDK rejects those: its model list carries base ids only
// (grok-4.5, gpt-5.5), with reasoning exposed as a per-model parameter. Split
// here; the runner discovers the parameter id at runtime and degrades to the
// base id when the model has none (resolveCursorModelSelection).
const CURSOR_REASONING_LEVELS = ["low", "medium", "high"];

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

// Abstract traits-menu level → cursor reasoning level (xhigh/max clamp to
// high; off sends the bare model). Falls back to the legacy id suffix for
// pre-migration AI_MODEL values that carried the level in the slug.
const CURSOR_REASONING_EFFORT: Record<string, string> = {
  off: "",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "high",
  max: "high",
};

export const cursorReasoningLevel =
  PROVIDER === "cursor" && REASONING_EFFORT in CURSOR_REASONING_EFFORT
    ? CURSOR_REASONING_EFFORT[REASONING_EFFORT]
    : cursorModelParts.level;
const codexCommand = existsSync(CODEX_BIN_PATH)
  ? JSON.stringify(CODEX_BIN_PATH)
  : "codex";
const opencodeCommand = existsSync(OPENCODE_BIN_PATH)
  ? JSON.stringify(OPENCODE_BIN_PATH)
  : "opencode";
export const codexPromptCmd = SYSTEM_PROMPT
  ? "(printf %s\\n\\n " +
    JSON.stringify(SYSTEM_PROMPT) +
    "; cat /tmp/design-prompt.txt)"
  : "cat /tmp/design-prompt.txt";
export const opencodePromptCmd = codexPromptCmd;
export const codexExecBaseCmd =
  codexCommand +
  " exec --skip-git-repo-check --full-auto --json --model " +
  JSON.stringify(normalizedCodexModel);
export const opencodeExecBaseCmd =
  opencodeCommand +
  " run --format json --model " +
  JSON.stringify(normalizedOpencodeModel);
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

export const CODEX_PRICING_PER_MILLION: Record<
  string,
  { input: number; cached: number; output: number }
> = {
  // OpenAI API list prices (per 1M tokens).
  "gpt-5.5": { input: 5.0, cached: 0.5, output: 30.0 },
  // Legacy — kept so in-flight sandboxes still cost-account correctly.
  "gpt-5.5-pro": { input: 30.0, cached: 30.0, output: 180.0 },

  "gpt-5.4": { input: 1.25, cached: 0.125, output: 10.0 },
  "gpt-5.4-mini": { input: 0.25, cached: 0.025, output: 2.0 },
  "gpt-5.3-codex": { input: 1.25, cached: 0.125, output: 10.0 },
  "gpt-5.2-codex": { input: 1.25, cached: 0.125, output: 10.0 },
  "gpt-5-codex": { input: 1.25, cached: 0.125, output: 10.0 },
};

export const completedLabels: Record<string, string> = {
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
  "Asking a question...": "Asked a question",
};
