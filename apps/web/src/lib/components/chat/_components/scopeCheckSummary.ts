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

/** Chip text: a count when Jev can name the hunks, a verdict when it cannot. */
export function scopeCheckLabel(check: ScopeCheck): string {
  const tone = scopeCheckTone(check);
  if (tone === "clear") {
    return "In scope";
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
