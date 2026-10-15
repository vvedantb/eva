import { z } from "zod";

/**
 * The per-step fields that only ever render inside a row's expanded disclosure
 * (`ActivityStepDetail` in @eva/ui): the tool transcript, the edit before/after
 * pair, and the write preview.
 *
 * On a heavy session they are the bulk of what `listByParent` ships — measured
 * at 43% of the activity bytes on a real transcript (94 KB of 218 KB across 212
 * steps) — and a reader who never opens a disclosure pays for all of them on
 * every subscription update. `messages.activityLogById` serves the untrimmed
 * payload when a reader actually expands the turn.
 */
const activityStepSchema = z
  .object({
    type: z.string().optional(),
    output: z
      .object({
        text: z.string(),
        exitCode: z.number().optional(),
        truncated: z.boolean().optional(),
      })
      .optional(),
    edits: z
      .array(z.object({ oldText: z.string(), newText: z.string() }))
      .optional(),
    contentPreview: z.string().optional(),
  })
  .passthrough();

const activityStepsSchema = z.array(activityStepSchema);

/**
 * A sub-agent's `output` is its final report, and the Agents roster renders it
 * outside any disclosure (`deriveSubagents` in the web app), so those steps keep
 * theirs.
 */
const KEEPS_OUTPUT = "subtask";

/**
 * Drops the expanded-only fields from a stored activity payload.
 *
 * Returns the input unchanged when there is nothing to drop — including for
 * legacy plain-text logs, which do not parse as a step array — so text-only
 * turns cost no extra parse/serialise round trip. Steps that lost something are
 * marked `hasHiddenDetail` so the client still draws the disclosure chevron and
 * knows to fetch the full payload on expand.
 */
export function trimActivityLogForTranscript(
  activityLog: string | undefined,
): string | undefined {
  if (!activityLog) return activityLog;

  const parsed = parseSteps(activityLog);
  if (!parsed?.success) return activityLog;

  const steps: typeof parsed.data = [];
  let trimmedAny = false;
  for (const step of parsed.data) {
    const dropsOutput = step.output !== undefined && step.type !== KEEPS_OUTPUT;
    if (!dropsOutput && !step.edits && !step.contentPreview) {
      steps.push(step);
      continue;
    }
    trimmedAny = true;
    const trimmed = Object.assign({}, step, { hasHiddenDetail: true });
    if (dropsOutput) delete trimmed.output;
    delete trimmed.edits;
    delete trimmed.contentPreview;
    steps.push(trimmed);
  }

  return trimmedAny ? JSON.stringify(steps) : activityLog;
}

/** Null for a legacy plain-text log, or anything that is not a step array. */
function parseSteps(activityLog: string) {
  try {
    return activityStepsSchema.safeParse(JSON.parse(activityLog));
  } catch {
    return null;
  }
}
