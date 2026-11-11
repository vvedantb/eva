import { z } from "zod";

/**
 * The steps of an assistant message's activity log (`messages.activityLog`),
 * checked with Zod, in the fields the web timeline reads (the `ActivityStep`
 * of `@vvedantb/ui`). A platform-free reader for the mobile app, which hands
 * the steps to the `@vvedantb/native-ui/ai` copies of the web row text and
 * grouping (`foldedActivitySegments`, `deriveStepRowPresentation`). The web
 * reads the log without a check (`parseActivitySteps`).
 *
 * A step whose shape does not parse is dropped; so is the whole log when it
 * is empty, legacy plain text or not a list.
 */
export const ACTIVITY_STEP_TYPES = [
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
  "thinking",
  "reasoning",
  "response",
  "question",
  "todos",
  "tool",
  "notice",
  "hook",
  "status",
  "steer",
] as const;

const activityLogStepSchema = z.object({
  type: z.enum(ACTIVITY_STEP_TYPES),
  label: z.string(),
  detail: z.string().optional(),
  status: z.enum(["complete", "active", "pending"]),
  /** The file a read, edit, write or notebook step touched (file chips, the "Changed files" card). */
  path: z.string().optional(),
  /** The tool call's id; a subagent's own steps name it in `parentToolUseId`, and nest under it. */
  toolUseId: z.string().optional(),
  parentToolUseId: z.string().optional(),
  /** A to-do list step's items. */
  todos: z
    .array(z.object({ content: z.string(), status: z.enum(["pending", "in_progress", "completed"]) }))
    .optional(),
  /** Bash command, fuller than `detail`. */
  command: z.string().optional(),
  /** Tool result transcript (tail-capped by the writer). */
  output: z.object({ text: z.string(), exitCode: z.number().optional(), truncated: z.boolean().optional() }).optional(),
  /** Edit before/after snippets. */
  edits: z.array(z.object({ oldText: z.string(), newText: z.string() })).optional(),
  /** Codex file_change paths. */
  files: z.array(z.string()).optional(),
  /** A written file's first lines. */
  contentPreview: z.string().optional(),
  /** The tool failed or exited non-zero: the row is drawn in the danger colour. */
  isError: z.boolean().optional(),
  /** How long the step ran: the faded "4s" after its row. */
  durationMs: z.number().optional(),
  /** The transcript copy dropped `output`/`edits`; fetch the full log (`messages.activityLogById`) to show them. */
  hasHiddenDetail: z.boolean().optional(),
});

export type ActivityLogStep = z.infer<typeof activityLogStepSchema>;

/** A malformed step reads as null, so the steps around it survive. */
const activityLogSchema = z.array(activityLogStepSchema.nullable().catch(null));

/** The steps of a log in order, or [] for an empty, legacy plain-text or malformed one. */
export function parseActivityLog(activityLog: string | undefined): ActivityLogStep[] {
  if (!activityLog) return [];
  try {
    const parsed = activityLogSchema.safeParse(JSON.parse(activityLog));
    return parsed.success ? parsed.data.filter((step) => step !== null) : [];
  } catch {
    // Legacy plain-text log.
    return [];
  }
}
