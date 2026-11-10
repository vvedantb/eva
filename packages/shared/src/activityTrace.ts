import { z } from "zod";

/**
 * The tool steps of a finished assistant message (`messages.activityLog`), in
 * the fields a compact trace shows: type, label, detail and status, plus the
 * step detail when present (command, output, edits). A
 * platform-free reader for the mobile app; the web reads the full step
 * (`parseActivitySteps`, typed by `@vvedantb/ui`).
 *
 * Steps the trace does not show (the reply itself, reasoning, status lines,
 * notices, hooks, steers, todo lists, questions) are dropped, and so is any
 * step whose shape does not parse. `parseTraceSegments` keeps the reasoning,
 * as prose between the tool runs.
 */
export const TOOL_STEP_TYPES = [
  "read",
  "edit",
  "write",
  "bash",
  "search_files",
  "search_code",
  "web_fetch",
  "web_search",
  "subtask",
  "notebook",
  "tool",
] as const;

export type ToolStepType = (typeof TOOL_STEP_TYPES)[number];

const toolStepSchema = z.object({
  type: z.enum(TOOL_STEP_TYPES),
  label: z.string(),
  detail: z.string().optional(),
  status: z.enum(["complete", "active", "pending"]),
  /** The file an edit, write or notebook step touched (the "Changed files" card). */
  path: z.string().optional(),
  /** Bash command, fuller than `detail`. */
  command: z.string().optional(),
  /** Tool result transcript (tail-capped by the writer). */
  output: z.object({ text: z.string(), exitCode: z.number().optional(), truncated: z.boolean().optional() }).optional(),
  /** Edit before/after snippets. */
  edits: z.array(z.object({ oldText: z.string(), newText: z.string() })).optional(),
  /** The transcript copy dropped `output`/`edits`; fetch the full log (`messages.activityLogById`) to show them. */
  hasHiddenDetail: z.boolean().optional(),
});

export type ToolStep = z.infer<typeof toolStepSchema>;

const activityLogSchema = z.array(z.unknown());

/** The raw entries of a log, or [] for an empty, legacy plain-text or malformed one. */
function parseLogEntries(activityLog: string | undefined): unknown[] {
  if (!activityLog) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(activityLog);
  } catch {
    return [];
  }
  const parsed = activityLogSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/** Tool steps in order, or [] for an empty, legacy plain-text or malformed log. */
export function parseToolSteps(activityLog: string | undefined): ToolStep[] {
  return parseLogEntries(activityLog).flatMap((step) => {
    const result = toolStepSchema.safeParse(step);
    return result.success ? [result.data] : [];
  });
}

/** A tool step and its place in `parseToolSteps`, for loading its full detail. */
export type TraceStep = { step: ToolStep; index: number };

/**
 * One block of a turn's trace, as the web's folded `ActivityTasks`
 * (`groupActivityRows` in @vvedantb/ui): the model's reasoning as prose, or a
 * run of tool steps behind one summary line (`summariseToolSteps`).
 */
export type TraceSegment = { kind: "reasoning"; text: string } | { kind: "actions"; steps: TraceStep[] };

const traceEntrySchema = z.object({ type: z.string(), label: z.string().optional(), detail: z.string().optional() });

/** Steps that read as narration on the web. Each stands alone, so it ends the tool run before it. */
const STANDALONE_TYPES = new Set(["todos", "notice", "status", "question", "steer"]);

/** Older logs stored reasoning as `thinking` steps with these labels (web `normalizeStep`). */
const REASONING_LABELS = new Set(["Thinking...", "Thought"]);

/** Placeholder detail on those older steps: nothing to show. */
const FILLER_DETAILS = new Set([
  "Claude is reasoning...",
  "Codex is reasoning...",
  "Opencode is reasoning...",
  "Cursor is reasoning...",
  "Receiving reply...",
]);

/** The prose of a reasoning step, or undefined when the entry is not one. */
function reasoningText({ type, label, detail }: z.infer<typeof traceEntrySchema>): string | undefined {
  if (type === "reasoning") return detail?.trim() ?? "";
  const legacy = type === "thinking" && label !== undefined && REASONING_LABELS.has(label);
  return legacy && detail && !FILLER_DETAILS.has(detail) ? detail.trim() : undefined;
}

/**
 * A turn's trace in the web's read-then-act rhythm: each reasoning step is
 * prose, and the tool steps after it fold into one run. The web hides reply
 * text and status narration in this layout, so they are dropped; a to-do
 * list, notice, status, question or steer still ends a run, as on the web.
 * A reasoning step with no text still ends a run; draw nothing for it.
 */
export function parseTraceSegments(activityLog: string | undefined): TraceSegment[] {
  const segments: TraceSegment[] = [];
  let run: TraceStep[] | undefined;
  let toolIndex = 0;
  for (const raw of parseLogEntries(activityLog)) {
    const tool = toolStepSchema.safeParse(raw);
    if (tool.success) {
      if (!run) {
        run = [];
        segments.push({ kind: "actions", steps: run });
      }
      run.push({ step: tool.data, index: toolIndex++ });
      continue;
    }
    const entry = traceEntrySchema.safeParse(raw);
    if (!entry.success) continue;
    const text = reasoningText(entry.data);
    if (text !== undefined) {
      segments.push({ kind: "reasoning", text });
      run = undefined;
    } else if (STANDALONE_TYPES.has(entry.data.type)) {
      run = undefined;
    }
  }
  return segments;
}

/** Same phrases as the web's folded tool run (`deriveActionGroupSummary` in @vvedantb/ui). */
const GROUP_PHRASES: Record<ToolStepType, string> = {
  read: "read files",
  edit: "edited files",
  write: "created files",
  notebook: "edited notebooks",
  bash: "ran commands",
  search_files: "searched for files",
  search_code: "searched the code",
  web_fetch: "fetched pages",
  web_search: "searched the web",
  subtask: "ran agents",
  tool: "used tools",
};

/** A step's phrase. Codex reports edits as a `file_change` tool call, so that reads as an edit (web `groupPhraseForStep`). */
function groupPhrase(step: ToolStep): string {
  const fileChange = step.type === "tool" && (step.label.toLowerCase().includes("file change") || step.detail === "file_change");
  return GROUP_PHRASES[fileChange ? "edit" : step.type];
}

/** One line for a folded run of steps: "Edited files, ran commands", each kind of work once, in first-seen order. */
export function summariseToolSteps(steps: ReadonlyArray<ToolStep>): string {
  const phrases = [...new Set(steps.map(groupPhrase))];
  const joined = phrases.join(", ");
  return joined ? `${joined.charAt(0).toUpperCase()}${joined.slice(1)}` : "Worked";
}

/** Whether a step has detail to open: a command, output or edits, or detail the transcript trimmed. */
export function hasStepDetail(step: ToolStep): boolean {
  return Boolean(step.command || step.output || (step.edits && step.edits.length > 0) || step.hasHiddenDetail);
}
