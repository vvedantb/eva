/**
 * The screenshot pass: the turn's own captures, read by Jev against the prompt
 * and against the flagged hunks.
 *
 * Two questions a diff cannot answer. Is an unrequested change one the user
 * will actually see — the trophy icon was in the screenshot the agent posted?
 * And do the screenshots show what was asked for, or a different screen?
 *
 * Runtime-free so the question set and the read-back are testable without a
 * deployment.
 */

import type { z } from "zod";
import { MAX_IMAGES, type booleanQuestion } from "../_jev/schema";
import { hunkKey, type JudgedHunk } from "./verdict";

type BooleanQuestion = z.input<typeof booleanQuestion>;

/** Jev's per-call image cap; a turn's latest captures are the ones that matter. */
export const MAX_SCREENSHOTS = MAX_IMAGES;
/** At or above this, the change counts as visible in a screenshot. */
export const VISIBLE_THRESHOLD = 0.5;

/** Recordings ride in the same media list; Jev reads stills only. */
export function isScreenshotType(contentType: string | undefined): boolean {
  return contentType === "image/png" || contentType === "image/jpeg";
}

/** Image name by capture order; questions cite it in backticks. */
export function screenshotName(index: number): string {
  return `screenshot_${index + 1}`;
}

function citeAll(names: readonly string[]): string {
  return names.map((name) => `\`${name}\``).join(", ");
}

/**
 * The question set for one call over every screenshot: one headline question,
 * plus one per flagged hunk that could show on screen. `internal` hunks and
 * unclassified ones are skipped — asking whether a type import is visible
 * only invites a false "yes".
 */
export function buildVisualQuestions(
  names: readonly string[],
  flagged: readonly JudgedHunk[],
): {
  questions: Record<string, BooleanQuestion>;
  /** Question id → {@link hunkKey} of the hunk it asks about. */
  hunkByQuestion: Map<string, string>;
} {
  const cited = citeAll(names);
  const questions: Record<string, BooleanQuestion> = {
    shows_request: {
      type: "boolean",
      instructions: `Do the screenshots (${cited}) show the result the user's prompt asked for?`,
      criteria: {
        true: "At least one screenshot shows the screen, element or behaviour the prompt asked to build or change.",
        false:
          "None of the screenshots shows what the prompt asked for: they show a different screen, an error, a loading state or an empty page.",
      },
    },
  };
  const hunkByQuestion = new Map<string, string>();
  flagged.forEach((hunk, index) => {
    if (hunk.kind === undefined || hunk.kind === "internal") return;
    const id = `visible_${index}`;
    questions[id] = {
      type: "boolean",
      instructions: `Is this change visible in any of the screenshots (${cited})? Change: ${hunk.summary ?? hunk.header}${hunk.surface ? ` in ${hunk.surface}` : ""}.`,
      criteria: {
        true: "A screenshot shows the element this change affects, in its changed form.",
        false: "No screenshot shows the element this change affects.",
      },
    };
    hunkByQuestion.set(id, hunkKey(hunk));
  });
  return { questions, hunkByQuestion };
}
