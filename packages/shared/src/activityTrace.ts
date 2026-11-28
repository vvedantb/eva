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
  path: z.string().optional(),
  toolUseId: z.string().optional(),
  parentToolUseId: z.string().optional(),
  todos: z
    .array(z.object({ content: z.string(), status: z.enum(["pending", "in_progress", "completed"]) }))
    .optional(),
  command: z.string().optional(),
  output: z.object({ text: z.string(), exitCode: z.number().optional(), truncated: z.boolean().optional() }).optional(),
  edits: z.array(z.object({ oldText: z.string(), newText: z.string() })).optional(),
  files: z.array(z.string()).optional(),
  contentPreview: z.string().optional(),
  isError: z.boolean().optional(),
  durationMs: z.number().optional(),
  hasHiddenDetail: z.boolean().optional(),
  questions: z
    .array(
      z.object({
        question: z.string(),
        header: z.string().optional(),
        multiSelect: z.boolean().optional(),
        options: z.array(z.object({ label: z.string(), description: z.string().optional() })),
      }),
    )
    .optional()
    .catch(undefined),
  answers: z.record(z.string(), z.string()).optional().catch(undefined),
});

export type ActivityLogStep = z.infer<typeof activityLogStepSchema>;

const activityLogSchema = z.array(activityLogStepSchema.nullable().catch(null));

/** The steps of a log in order, or [] for an empty, legacy plain-text or malformed one. */
export function parseActivityLog(activityLog: string | undefined): ActivityLogStep[] {
  if (!activityLog) return [];
  try {
    const parsed = activityLogSchema.safeParse(JSON.parse(activityLog));
    return parsed.success ? parsed.data.filter((step) => step !== null) : [];
  } catch {
    return [];
  }
}
