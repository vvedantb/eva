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
  path?: string;
  status: "active" | "complete";
  toolUseId?: string;
  parentToolUseId?: string;
  todos?: TodoItem[];
  command?: string;
  output?: StepOutput;
  edits?: StepEdit[];
  files?: string[];
  contentPreview?: string;
  isError?: boolean;
  durationMs?: number;
  questions?: StepQuestion[];
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
  | { kind: "push_subagent_text"; step: ProgressStep }
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
