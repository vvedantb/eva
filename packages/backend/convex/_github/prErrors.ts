/**
 * The pull-request failure questions Eva asks outside `classifyGitHubFailure`
 * itself: the two outcomes it treats as non-failures, and the classifier a
 * manual PR action runs its whole attempt through.
 *
 * The two predicates are `_tag` checks over `classifyGitHubFailure`, which owns
 * the matching rules. They stay as predicates because the callers that ask
 * these questions sit in `catch` blocks on the far side of a Convex action
 * boundary, where the failure arrives as a rehydrated error rather than as a
 * tagged one.
 */

import { UnexpectedActionFailure } from "../_effect/action";
import { classifyGitHubFailure, type GitHubFailure } from "./githubErrors";

/**
 * True when a PR cannot be opened because the branch has no commits ahead of
 * base.
 *
 * Plan-only turns push no commits, so this is the ordinary outcome of a
 * conversation that did not touch code. It used to surface as a red "Failed to
 * create pull request" alert on every such turn. Callers skip the PR instead.
 *
 * Deliberately not the wait *timeout*: that fires when GitHub never confirmed
 * the branch at all, which is a real publish failure and has to reach the user.
 */
export function isBranchNotAheadError(error: unknown): boolean {
  return classifyGitHubFailure(error)._tag === "GitHubBranchNotAhead";
}

/**
 * True when `pulls.create` failed because a PR for this branch already exists.
 *
 * Callers re-look-up and adopt that PR rather than reporting a failure.
 */
export function isPullRequestAlreadyExistsError(error: unknown): boolean {
  return classifyGitHubFailure(error)._tag === "GitHubPullRequestAlreadyExists";
}

/**
 * Every way a manual "Create PR" attempt can fail, as a tagged error the action
 * boundary can put on `ConvexError.data`.
 *
 * A GitHub-shaped failure keeps the specific tag `classifyGitHubFailure` gave
 * it, so the web can react to "branch is not ahead" differently from "bad
 * credentials". `GitHubRequestFailed` is the classifier's own catch-all and says
 * nothing a caller can branch on, so it — and every non-GitHub failure, from
 * "Not authenticated" to a missing base branch — becomes
 * {@link UnexpectedActionFailure} carrying the message the user would have seen
 * before.
 */
export function classifyPrActionFailure(
  error: unknown,
): GitHubFailure | UnexpectedActionFailure {
  const failure = classifyGitHubFailure(error);
  if (failure._tag !== "GitHubRequestFailed") return failure;
  return new UnexpectedActionFailure({
    message: error instanceof Error ? error.message : String(error),
    cause: error,
  });
}
