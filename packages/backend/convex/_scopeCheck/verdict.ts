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
import type { ChangeKind } from "./describe";
import { clipToLineBoundary, type DiffHunk } from "./hunks";

/** One Jev call per hunk, so a 400-hunk turn does not bill like one. */
export const MAX_JUDGED_HUNKS = 60;
/** Hunks judged concurrently; the rest wait their turn. */
export const SCOPE_BATCH_SIZE = 6;
/** Stored on the message: past this the chip is a wall, not a signal. */
export const MAX_FLAGGED_HUNKS = 20;
/** Flagged when Jev leans "not asked for" on both questions. */
export const FLAG_THRESHOLD = 0.5;
/** Below this, the reply did not tell the user about the change. */
export const MENTION_THRESHOLD = 0.5;
/**
 * Largest whole diff Jev takes at its default context. The gateway answered a
 * 41k-character state (16.7k input tokens) but failed a 77k one, repeatably:
 * Jev's default limit is about 32k tokens.
 */
export const STANDARD_DIFF_CHARS = 30_000;
/**
 * Whole-diff budget with `longContext` on (262k tokens). Kept well under that
 * ceiling because TypeSafe reports long contexts make answers less reliable;
 * this still covers every turn that is not a mass rename or a vendored bundle.
 */
export const MAX_OVERALL_DIFF_CHARS = 180_000;
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
  /** What a user sees change, when Jev returned a kind it recognises. */
  kind?: ChangeKind;
  /** Plain-English headline, e.g. `Icon changed (IconAward → IconTrophy)`. */
  summary?: string;
  /** Plain-English screen name, e.g. `Awarded panel`. */
  surface?: string;
}

/**
 * Both questions have to lean negative. A hunk the prompt did not name but that
 * a requested change needs (a new import, an updated call site) is in scope.
 */
export function isFlagged(hunk: JudgedHunk): boolean {
  return hunk.requested < FLAG_THRESHOLD && hunk.necessary < FLAG_THRESHOLD;
}

/**
 * The flagged hunks in stored order, worst first and capped. Shared so the
 * mention pass asks about exactly the hunks the chip will show, and no more —
 * each one is a Jev call.
 */
export function selectFlagged(judged: readonly JudgedHunk[]): JudgedHunk[] {
  return judged
    .filter(isFlagged)
    .toSorted((left, right) => left.requested - right.requested)
    .slice(0, MAX_FLAGGED_HUNKS);
}

/** Identifies a hunk across the judging passes; headers carry line numbers. */
export function hunkKey(hunk: { file: string; header: string }): string {
  return `${hunk.file} ${hunk.header}`;
}

export function clipPrompt(prompt: string): string {
  return prompt.slice(0, MAX_PROMPT_CHARS);
}

/**
 * Renders the judgeable hunks back into a diff for the headline question, so it
 * reads exactly what the per-hunk questions read: ignored files (lockfiles,
 * generated bundles) are already gone, and cannot inflate the chip's number.
 *
 * Consecutive hunks of one file share a single `--- <file>` line, which spends
 * the budget on code rather than on repeated paths.
 */
export function buildOverallDiff(hunks: readonly DiffHunk[]): {
  text: string;
  clipped: boolean;
  /** Past {@link STANDARD_DIFF_CHARS}: the headline call must ask for long context. */
  longContext: boolean;
} {
  const lines: string[] = [];
  let currentFile: string | null = null;
  for (const hunk of hunks) {
    if (hunk.file !== currentFile) {
      lines.push(`--- ${hunk.file}`);
      currentFile = hunk.file;
    }
    lines.push(hunk.header, hunk.body);
  }
  const clipped = clipToLineBoundary(lines.join("\n"), MAX_OVERALL_DIFF_CHARS);
  return {
    ...clipped,
    longContext: clipped.text.length > STANDARD_DIFF_CHARS,
  };
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
  /** P(the reply mentioned it) per {@link hunkKey}; absent when that call failed. */
  mentioned?: ReadonlyMap<string, number>;
  /** P(the change shows in a screenshot) per {@link hunkKey}. */
  visible?: ReadonlyMap<string, number>;
  /** The screenshot pass, when the turn posted screenshots Jev could read. */
  screenshots?: ScopeCheck["screenshots"];
}): ScopeCheck {
  const mentioned = args.mentioned ?? new Map<string, number>();
  const visible = args.visible ?? new Map<string, number>();
  const flagged = selectFlagged(args.judged).map((hunk) => {
    const row: ScopeCheck["flagged"][number] = {
      file: hunk.file,
      header: hunk.header,
      requested: hunk.requested,
      necessary: hunk.necessary,
    };
    if (hunk.kind !== undefined) row.kind = hunk.kind;
    if (hunk.summary !== undefined) row.summary = hunk.summary;
    if (hunk.surface !== undefined) row.surface = hunk.surface;
    // Left off rather than defaulted: "Jev could not tell us" and "the reply
    // said nothing" would otherwise read identically on the chip.
    const mention = mentioned.get(hunkKey(hunk));
    if (mention !== undefined) row.mentioned = mention;
    const seen = visible.get(hunkKey(hunk));
    if (seen !== undefined) row.visible = seen;
    return row;
  });

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
    ...(args.screenshots === undefined
      ? {}
      : { screenshots: args.screenshots }),
  };
}
