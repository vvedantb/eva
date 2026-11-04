/**
 * Classifies the two pull-request failures Eva has to treat as non-failures.
 *
 * Both predicates match on message text because the errors reach us from three
 * different layers — our own compare check, Octokit's validation errors, and
 * GitHub's prose — so there is no status code that identifies them all.
 */

import { errorText } from "../_shared/errors";

/**
 * True when a PR cannot be opened because the branch has no commits ahead of
 * base.
 *
 * Plan-only turns push no commits, so this is the ordinary outcome of a
 * conversation that did not touch code. It used to surface as a red "Failed to
 * create pull request" alert on every such turn. Callers skip the PR instead.
 *
 * Covers both wordings: our own `waitForPullRequestHead` sentinel, and the
 * message GitHub returns from `pulls.create` when we skipped that check.
 *
 * Deliberately not the wait *timeout*: that fires when GitHub never confirmed
 * the branch at all, which is a real publish failure and has to reach the user.
 */
export function isBranchNotAheadError(error: unknown): boolean {
  const message = errorText(error);
  return (
    message.includes("is not ahead of") ||
    message.includes("No commits between")
  );
}

/**
 * True when `pulls.create` failed because a PR for this branch already exists.
 *
 * Happens when two turns publish at once, or when the pre-create lookup ran
 * before GitHub's list endpoint caught up. Callers re-look-up and adopt that PR
 * rather than reporting a failure.
 */
export function isPullRequestAlreadyExistsError(error: unknown): boolean {
  return /pull request already exists/i.test(errorText(error));
}
