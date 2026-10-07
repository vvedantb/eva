/**
 * When local and origin/<branch> have both moved, Eva merges the remote tip
 * rather than rebasing (rebasing a merged-in base replays hundreds of
 * unrelated commits). That merge is wrong after a history rewrite — rebasing
 * the branch onto a new base — because it glues the old remote history back
 * onto the rewritten tip. Task 231 (25 Aug 2026) hit that: one feature commit
 * on main vs 1,272 remote-only staging commits, conflicts that existed only
 * inside the publish merge, sandbox left clean after abort.
 *
 * The two shapes are told apart by the local branch's reflog, never by how
 * many files each side changed. A file-count classifier ("many remote-only
 * files vs few local") was tried first and misfired on quick task 220
 * (evalucom/carepulse-ts, 2–3 Sep 2026): the agent never rebased — GitHub had
 * gained 118 commits on the PR branch that the sandbox never fetched, the
 * sandbox had one small commit, and the classifier refused a publish that a
 * plain merge would have completed. Two turns in a row failed the same way.
 */
export function parseGitNameOnlyList(output: string): string[] {
  const names: string[] = [];
  for (const line of output.split("\n")) {
    const name = line.trim();
    if (name.length > 0) names.push(name);
  }
  return names;
}

/**
 * Eva only ever rewrites history on GitHub for branches it created. The same
 * rule guards the user-confirmed session force-push (`_sessions/sandbox.ts`).
 */
export function isEvaOwnedBranch(branchName: string): boolean {
  return branchName.startsWith("eva/");
}

/**
 * A diverged local branch rewrote its own history — rebase onto a new base,
 * reset, amend — exactly when the remote tip is a commit the local branch
 * itself used to point at. The sandbox then already held every remote commit
 * and deliberately moved off them, so a push leased on that tip discards
 * nothing the sandbox never saw. A remote tip absent from the branch's reflog
 * was pushed by someone or something else (a reviewer, GitHub's "Update
 * branch", another sandbox): those commits are real and get merged in.
 *
 * An empty reflog therefore means "merge", never "force".
 */
export function rewrittenBranchIsOwnHistory(
  remoteTipSha: string,
  localBranchReflogShas: readonly string[],
): boolean {
  const tip = remoteTipSha.trim();
  return tip.length > 0 && localBranchReflogShas.includes(tip);
}

/**
 * The message and its detector live together: the web app offers a one-click
 * force-push recovery for exactly this refusal, so the wording and the
 * `publishErrorNeedsForcePush` check must never drift apart.
 */
const REWRITTEN_BRANCH_MARKER = "into a rewritten local branch";

/**
 * The only automatic-publish refusal left: the local branch rewrote history
 * origin still holds, but the branch is not Eva's to rewrite on GitHub.
 */
export function rewrittenBranchPublishError(branchName: string): string {
  return `Refusing to merge origin/${branchName} ${REWRITTEN_BRANCH_MARKER}: origin/${branchName} points at a commit this sandbox's branch used to hold, so the local branch rebased, reset or amended past it. Local work is intact and GitHub still has the old history. Eva only force-pushes eva/ branches automatically, and ${branchName} is not one. Updating the PR needs a force-push, and a base-branch retarget if you rebased onto a new base: check origin/${branchName} for work to keep, then run \`git push --force-with-lease origin ${branchName}\` in the sandbox.`;
}

/**
 * True when a publish failure is the rewritten-branch refusal, where replacing
 * origin with the sandbox's branch is the documented fix. Deliberately not
 * matched for other diverged-publish failures ("Could not merge origin/…"),
 * where both sides may hold real commits and a force-push could destroy work.
 */
export function publishErrorNeedsForcePush(errorDetail: string): boolean {
  return errorDetail.includes(REWRITTEN_BRANCH_MARKER);
}
