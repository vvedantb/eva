"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { getInstallationOctokit } from "../githubAuth";
import { errorText } from "../_shared/errors";

/**
 * Guards against a "tip-copy" false-positive merge of one of a session's PRs.
 *
 * GitHub marks a PR "merged" whenever its exact commit SHAs land on the base
 * branch, regardless of which PR actually merged them. Eva's "duplicate PR"
 * flow (see `buildEditPrompt`) intentionally squashes a session branch onto a
 * fresh branch so the resulting PR has NEW commit SHAs and cannot trigger
 * this — but if the agent (or a user) instead pushes the session branch's own
 * commits to another ref and merges that, GitHub will auto-mark the session's
 * PR merged too, even though it was never actually merged through GitHub's UI.
 *
 * The webhook handler (`handlePullRequestEvent`) already reacted synchronously
 * (patched the row + stopped the sandbox if it was the last live PR). This
 * action runs a few seconds later, once GitHub's commit->PR association index
 * has settled, and checks the SPECIFIC thing that distinguishes a real merge
 * from a tip-copy: whether the merge commit is actually associated with this
 * PR number. This is structural (GitHub's own association data), not a guess
 * based on commit messages or timing.
 *
 * If the merge commit is associated with a different PR only, the session's
 * merge was foreign — detach that PR row so the session becomes writable again
 * (a future push opens a fresh PR when it was the primary) and alert the user.
 */
export const verifySessionPrMerged = internalAction({
  args: {
    prUrl: v.string(),
    mergeCommitSha: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const pr = await ctx.runQuery(internal.pullRequests.getByUrlInternal, {
      prUrl: args.prUrl,
    });
    if (!pr || pr.state !== "merged" || pr.owner.kind !== "session") {
      return null;
    }
    const sessionId = pr.owner.sessionId;

    const repo = await ctx.runQuery(internal.githubRepos.getInternal, {
      id: pr.repoId,
    });
    if (!repo) return null;

    let associatedPrNumbers: number[];
    try {
      const octokit = await getInstallationOctokit(repo.installationId);
      const { data } =
        await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
          owner: repo.owner,
          repo: repo.name,
          commit_sha: args.mergeCommitSha,
        });
      associatedPrNumbers = data.map((candidate) => candidate.number);
    } catch (error) {
      // Fail safe: if we can't verify, leave the session merged (today's
      // behavior) rather than risk incorrectly reopening a genuinely merged
      // session.
      console.error(
        `[verifySessionPrMerged] failed to check association for sessionId=${sessionId} sha=${args.mergeCommitSha}: ${errorText(error)}`,
      );
      return null;
    }

    // No PRs associated at all is unusual but not evidence of a foreign
    // merge — treat it as an intentional merge and leave the session as-is.
    if (associatedPrNumbers.length === 0) return null;

    const isForeign = !associatedPrNumbers.includes(pr.prNumber);
    if (!isForeign) return null;

    await ctx.runMutation(internal.sessions.detachForeignMergedPr, {
      pullRequestId: pr._id,
    });

    await ctx.runMutation(internal.sessionWorkflow.postSystemAlert, {
      sessionId,
      content:
        "GitHub auto-marked this session's PR as merged because identical commits landed via another PR. The session stays open — Eva has detached the old PR, and a new PR will be created on your next push. Tip: to ship work separately without this, ask the agent for a duplicate PR (it squashes onto a fresh branch with new commit SHAs).",
    });

    return null;
  },
});
