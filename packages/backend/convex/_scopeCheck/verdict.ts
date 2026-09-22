/**
 * The questions Jev is asked about a turn's diff, and the pure reduction from
 * its answers to the verdict stored on the assistant message.
 *
 * Runtime-free (the validator it derives its return type from is a type-only
 * import) so the thresholds, caps and sort order are testable without a
 * deployment.
 */

import type { z } from "zod";
import type { booleanQuestion } from "../_jev/schema";
import type { scopeCheckValidator } from "../_validators/shapes";
import type { Infer } from "convex/values";
import { clipToLineBoundary } from "./hunks";

/** One Jev call per hunk, so a 400-hunk turn does not bill like one. */
export const MAX_JUDGED_HUNKS = 60;
/** Hunks judged concurrently; the rest wait their turn. */
export const SCOPE_BATCH_SIZE = 6;
/** Stored on the message: past this the chip is a wall, not a signal. */
export const MAX_FLAGGED_HUNKS = 20;
/** Flagged when Jev leans "not asked for" on both questions. */
export const FLAG_THRESHOLD = 0.5;
/** Whole-diff state budget: prompt + diff must stay under Jev's 200k cap. */
export const MAX_OVERALL_DIFF_CHARS = 150_000;
/** Jev needs the ask, not the essay; long prompts are asks plus context. */
export const MAX_PROMPT_CHARS = 8_000;

type BooleanQuestion = z.input<typeof booleanQuestion>;

/** Jev reads these literally, so they name the failure mode rather than hint at it. */
export const HUNK_QUESTIONS = {
  requested: {
    type: "boolean",
    instructions:
      "Did the user's prompt ask for this specific code change, either directly or as an obvious, necessary part of what was requested?",
    criteria: {
      true: "The prompt names this change, or delivering what the prompt asked for cannot be done without it.",
      false:
        "The prompt never mentions this change and the requested work could ship without it: an unrelated refactor, rename, reformat, icon or copy swap, dependency bump, or an extra feature the user did not ask for.",
    },
  },
  necessary: {
    type: "boolean",
    instructions:
      "Is this change required for a change the prompt did ask for to compile, run or behave correctly?",
    criteria: {
      true: "Removing this hunk would break or leave incomplete something the prompt asked for (an import, type, call-site update, test fixture).",
      false:
        "Removing this hunk would not affect anything the prompt asked for.",
    },
  },
} satisfies Record<string, BooleanQuestion>;

/** The headline: one question over the whole diff, for the chip's own number. */
export const OVERALL_QUESTION = {
  unrequested: {
    type: "boolean",
    instructions:
      "Does this diff contain code changes the user's prompt did not ask for?",
    criteria: {
      true: "At least one change is neither requested by the prompt nor required to deliver what was requested.",
      false:
        "Every change is either requested by the prompt or required to deliver what was requested.",
    },
  },
} satisfies Record<string, BooleanQuestion>;

type ScopeCheck = Infer<typeof scopeCheckValidator>;

/** One hunk with both probabilities read back from Jev. */
export interface JudgedHunk {
  file: string;
  header: string;
  /** P(the prompt asked for this change). */
  requested: number;
  /** P(the change is required to make a requested change work). */
  necessary: number;
}

/**
 * Both questions have to lean negative. A hunk the prompt did not name but that
 * a requested change needs (a new import, an updated call site) is in scope.
 */
export function isFlagged(hunk: JudgedHunk): boolean {
  return hunk.requested < FLAG_THRESHOLD && hunk.necessary < FLAG_THRESHOLD;
}

export function clipPrompt(prompt: string): string {
  return prompt.slice(0, MAX_PROMPT_CHARS);
}

export function clipDiffForOverall(diff: string): {
  text: string;
  clipped: boolean;
} {
  return clipToLineBoundary(diff, MAX_OVERALL_DIFF_CHARS);
}

/**
 * Reduces the per-hunk answers and the whole-diff answer to the stored verdict.
 *
 * A failed whole-diff call falls back to the worst hunk rather than dropping
 * the verdict: the per-hunk work is already paid for, and the chip only needs
 * one number to threshold on.
 */
export function summariseScopeCheck(args: {
  unrequestedProbability: number | null;
  judged: JudgedHunk[];
  totalHunks: number;
  diffTruncated: boolean;
  evaluatedAt: number;
}): ScopeCheck {
  const flagged = args.judged
    .filter(isFlagged)
    .toSorted((left, right) => left.requested - right.requested)
    .slice(0, MAX_FLAGGED_HUNKS)
    .map((hunk) => ({
      file: hunk.file,
      header: hunk.header,
      requested: hunk.requested,
      necessary: hunk.necessary,
    }));

  const worstHunk = args.judged.reduce(
    (worst, hunk) => Math.max(worst, 1 - hunk.requested),
    0,
  );

  return {
    unrequestedProbability: args.unrequestedProbability ?? worstHunk,
    totalHunks: args.totalHunks,
    judgedHunks: args.judged.length,
    flagged,
    partial: args.diffTruncated || args.totalHunks > args.judged.length,
    evaluatedAt: args.evaluatedAt,
  };
}
