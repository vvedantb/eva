/** JSON-compatible value for Convex HTTP payloads and stream events. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type StepOutput = {
  text: string;
  exitCode?: number;
  truncated?: boolean;
};

export type StepEdit = {
  oldText: string;
  newText: string;
};

export type StepQuestionOption = { label: string; description?: string };

export type StepQuestion = {
  question: string;
  header?: string;
  multiSelect?: boolean;
  options: StepQuestionOption[];
};

/** Optional payload attached when a tool call finishes (merged onto the step). */
export type ToolCompleteResult = {
  output?: StepOutput;
  isError?: boolean;
  files?: string[];
  durationMs?: number;
  answers?: Record<string, string>;
};

export type ProgressStep = {
  type: string;
  label: string;
  detail?: string;
  /** Full, unshortened path for file-type steps. Powers the chat File Viewer. */
  path?: string;
  status: "active" | "complete";
  /** The tool_use id that produced this step (Claude only). Lets a tool_result
   * complete the exact step, and anchors nested subagent children. */
  toolUseId?: string;
  /** Set when this step ran inside a subagent — the parent `Agent` tool_use id.
   * The UI nests these under the matching `subtask` step. */
  parentToolUseId?: string;
  /** Todo checklist snapshot (type "todos" only), JSON-serialised for transport. */
  todos?: TodoItem[];
  /** Bash command (fuller than detail, capped). */
  command?: string;
  /** Tool result transcript (tail-capped). */
  output?: StepOutput;
  /** Edit before/after snippets (max 4). */
  edits?: StepEdit[];
  /** Codex file_change paths (max 10). */
  files?: string[];
  /** Write tool content head preview. */
  contentPreview?: string;
  /** True when the tool failed or exited non-zero. */
  isError?: boolean;
  /** Wall time from push → complete (ms). */
  durationMs?: number;
  /** AskUserQuestion prompt (type "question" only): the questions and options shown to the user. */
  questions?: StepQuestion[];
  /** AskUserQuestion answers keyed by question text (blocking questions only). */
  answers?: Record<string, string>;
};

export type TodoItem = {
  content: string;
  status: "pending" | "in_progress" | "completed";
};

export type UsageLimitStatus = "allowed" | "allowed_warning" | "rejected";

/**
 * One plan usage window. `key` is the provider's window id (a Claude
 * `rateLimitType`, or `model_scoped:<display name>`), `utilization` is a 0-100
 * percentage and `resetsAt` is epoch ms.
 */
export type UsageLimitWindow = {
  key: string;
  label: string;
  utilization?: number;
  resetsAt?: number;
};

/**
 * What the latest observation covered. Mirrors `usageLimitCompletenessValidator`
 * in the Convex validators, and travels with the reading so a windowless row can
 * say WHY it has no windows:
 *
 * - `complete`: an authoritative `/usage` response — Convex replaces the row.
 * - `partial`: a stream event or a refusal message — Convex merges it.
 * - `refused`: the provider answered `rate_limits_available: false`, i.e. it
 *   declined to report. Distinct from having reported nothing at all.
 */
type UsageLimitCompleteness = "complete" | "partial" | "refused";

/**
 * Plan usage-limit state observed during this run, upserted to Convex at the end
 * of every turn so the UI can show how much of the plan is left. Only providers
 * that expose real plan windows report here — Claude fills
 * `subscriptionType`/`status`/`windows`.
 */
export type UsageLimitSnapshot = {
  completeness: UsageLimitCompleteness;
  subscriptionType?: string;
  status?: UsageLimitStatus;
  windows?: UsageLimitWindow[];
};

export type SessionMode = {
  mode: "none" | "session" | "resume";
  sessionId: string | null;
};

export type StartupStep = {
  label: string;
  detail: string;
};

export type CanonicalEvent =
  | { kind: "update_thinking"; label: string; detail?: string }
  | { kind: "push_step"; step: ProgressStep; trackingId?: string }
  | {
      kind: "complete_tool";
      trackingId?: string;
      result?: ToolCompleteResult;
    }
  | { kind: "mark_last_complete" }
  | { kind: "append_text"; text: string }
  | { kind: "stream_text_delta"; text: string }
  | { kind: "mark_message_start" }
  | { kind: "mark_text_block_start" }
  | { kind: "update_reasoning"; text: string }
  | { kind: "set_pending_question"; data: string }
  | { kind: "set_todos"; todos: TodoItem[] }
  | { kind: "set_codex_thread"; threadId: string }
  | { kind: "mark_first_assistant" };

export type StreamLineResult = {
  needsHeartbeat?: boolean;
};

export type ProviderAttemptResult = {
  code: number;
  terminatedBySignal: boolean;
  output: string;
  timedOutForNoOutput: boolean;
  timedOutForMaxRuntime: boolean;
  timedOutForFirstEvent: boolean;
  timedOutForFirstAssistant: boolean;
  timedOutAfterFirstText: boolean;
  timedOutForZombie: boolean;
  toolStallErrorMessage: string;
};

export type ResultEvent = {
  result: string;
  isError: boolean;
  rawResultEvent: string;
};

export type ConvexCallType = "mutation" | "action";
