import type { Doc } from "@eva/backend";

/**
 * Jev's scope verdict on one assistant turn, as stored on the message row.
 * Written out of band a few seconds after the turn finishes, so it is absent
 * on most rows and every caller has to treat it as optional.
 */
export type ScopeCheck = NonNullable<Doc<"messages">["scopeCheck"]>;
export type ScopeCheckHunk = ScopeCheck["flagged"][number];
export type ScopeCheckTone = "clear" | "review" | "flagged";

/** Above this, the turn is worth a second look. */
export const SCOPE_REVIEW_THRESHOLD = 0.35;
/** Above this, the turn probably strayed outside the prompt. */
export const SCOPE_FLAGGED_THRESHOLD = 0.65;
/** Below this, the reply did not tell the user about the change. */
export const MENTION_THRESHOLD = 0.5;

/**
 * Hunks the reply never mentioned. Absent `mentioned` means the question was
 * never answered, not that the reply stayed silent — an unanswered question
 * must not accuse the turn of hiding anything.
 */
export function unmentionedHunks(check: ScopeCheck): ScopeCheckHunk[] {
  return check.flagged.filter(
    (hunk) =>
      hunk.mentioned !== undefined && hunk.mentioned < MENTION_THRESHOLD,
  );
}

/**
 * A named hunk is the stronger signal: Jev only lists a hunk once it is under
 * the requested/necessary threshold, so one flagged hunk earns the loud tone
 * even when the whole-diff probability stayed low.
 */
export function scopeCheckTone(check: ScopeCheck): ScopeCheckTone {
  if (
    check.unrequestedProbability >= SCOPE_FLAGGED_THRESHOLD ||
    check.flagged.length > 0
  ) {
    return "flagged";
  }
  if (check.unrequestedProbability >= SCOPE_REVIEW_THRESHOLD) {
    return "review";
  }
  return "clear";
}

/**
 * Chip text. An unreported change leads, because that is the failure the
 * reviewer cannot catch by reading the reply: a change the turn owned up to is
 * already in front of them, whether or not it was asked for.
 */
export function scopeCheckLabel(check: ScopeCheck): string {
  const tone = scopeCheckTone(check);
  if (tone === "clear") {
    return "In scope";
  }
  const unmentioned = unmentionedHunks(check).length;
  if (unmentioned > 0) {
    return `${unmentioned} change${unmentioned === 1 ? "" : "s"} not mentioned`;
  }
  if (tone === "review") {
    return "Check scope";
  }
  const count = check.flagged.length;
  if (count === 0) {
    return "Likely off scope";
  }
  return `${count} unrequested change${count === 1 ? "" : "s"}`;
}

export function formatPercent(probability: number): string {
  return `${Math.round(probability * 100)}%`;
}

/**
 * Hunk rows show the inverse of `requested`: the reviewer is scanning for what
 * the prompt did not ask for, not for what it did.
 */
export function hunkUnrequestedProbability(hunk: ScopeCheckHunk): number {
  return 1 - hunk.requested;
}

/** Whether this row is one the reply never told the user about. */
export function isUnmentioned(hunk: ScopeCheckHunk): boolean {
  return hunk.mentioned !== undefined && hunk.mentioned < MENTION_THRESHOLD;
}

/**
 * What the row says happened, in the words a designer or PM would use. Rows
 * written before the plain-English pass — and hunks Jev could not classify —
 * fall back to the `@@` header, which at least locates the change.
 */
export function hunkHeadline(hunk: ScopeCheckHunk): string {
  return hunk.summary ?? hunk.header;
}

/** Where it happened: the screen name when we have one, else the file path. */
export function hunkLocation(hunk: ScopeCheckHunk): string {
  return hunk.surface ?? hunk.file;
}
