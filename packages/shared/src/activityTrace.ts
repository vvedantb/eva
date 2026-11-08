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
 * step whose shape does not parse.
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

/** Tool steps in order, or [] for an empty, legacy plain-text or malformed log. */
export function parseToolSteps(activityLog: string | undefined): ToolStep[] {
  if (!activityLog) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(activityLog);
  } catch {
    return [];
  }
  const parsed = activityLogSchema.safeParse(raw);
  if (!parsed.success) return [];
  return parsed.data.flatMap((step) => {
    const result = toolStepSchema.safeParse(step);
    return result.success ? [result.data] : [];
  });
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

/** One line for a folded run of steps: "Edited files, ran commands". */
export function summariseToolSteps(steps: ReadonlyArray<ToolStep>): string {
  const phrases = [...new Set(steps.map((step) => GROUP_PHRASES[step.type]))];
  const joined = phrases.join(", ");
  return joined ? `${joined.charAt(0).toUpperCase()}${joined.slice(1)}` : "Worked";
}

/** Whether a step has detail to open: a command, output or edits, or detail the transcript trimmed. */
export function hasStepDetail(step: ToolStep): boolean {
  return Boolean(step.command || step.output || (step.edits && step.edits.length > 0) || step.hasHiddenDetail);
}
