import { v, type Infer } from "convex/values";
import { z } from "zod";

/**
 * One stop of a recap walkthrough. The app renders it natively: the summary as
 * markdown, then each named file's PR diff. `files` are changed paths only; the
 * server drops anything else before the step is stored.
 */
export const recapWalkthroughStepValidator = v.object({
  title: v.string(),
  /** Markdown: what this step changes and why. */
  summary: v.string(),
  /** Changed file paths this step covers, in reading order. */
  files: v.array(v.string()),
  /** A decision only the reviewer can make; absent when there is none. */
  lookClosely: v.optional(v.string()),
});

export type RecapWalkthroughStep = Infer<typeof recapWalkthroughStepValidator>;

/** Title of the step the server adds for files the agent left out. */
export const OTHER_CHANGES_STEP_TITLE = "Other changes";

const agentStepSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  files: z.array(z.string()).default([]),
  lookClosely: z.string().trim().min(1).optional(),
});

/** Raw agent text → parsed JSON → walkthrough, in one boundary parse. */
const agentWalkthroughSchema = z
  .string()
  .transform((text, ctx) => {
    try {
      return JSON.parse(stripJsonFence(text));
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Not JSON" });
      return z.NEVER;
    }
  })
  .pipe(z.object({ steps: z.array(agentStepSchema).min(1) }));

/**
 * Parses the agent's walkthrough JSON and holds it to the change: a file path
 * that is not in the PR is dropped, a file named twice stays only in its first
 * step, and every changed file the agent skipped lands in a final "Other
 * changes" step, so no file is ever hidden from the reader. Null when the JSON
 * is not a walkthrough at all.
 */
export function parseRecapWalkthrough(
  raw: string,
  changedFiles: readonly string[],
): RecapWalkthroughStep[] | null {
  const parsed = agentWalkthroughSchema.safeParse(raw);
  if (!parsed.success) return null;

  const changed = new Set(changedFiles);
  const covered = new Set<string>();
  const steps: RecapWalkthroughStep[] = parsed.data.steps.map((step) => {
    const files = step.files.filter((path) => {
      if (!changed.has(path) || covered.has(path)) return false;
      covered.add(path);
      return true;
    });
    return {
      title: step.title,
      summary: step.summary,
      files,
      ...(step.lookClosely !== undefined
        ? { lookClosely: step.lookClosely }
        : {}),
    };
  });

  const uncovered = changedFiles.filter((path) => !covered.has(path));
  if (uncovered.length > 0) {
    steps.push({
      title: OTHER_CHANGES_STEP_TITLE,
      summary: "The walkthrough did not cover these files.",
      files: uncovered,
    });
  }
  return steps;
}

/** Removes a surrounding ```json ... ``` fence if the model added one. */
function stripJsonFence(value: string): string {
  const fenced = value.trim().match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
  return fenced ? fenced[1].trim() : value.trim();
}
