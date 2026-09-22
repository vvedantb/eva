"use node";

import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { appendRelatedPrsSection, buildPrBody, type SiblingPr } from "../prBody";
import { buildEvaSessionUrl } from "../_taskWorkflow/urls";
import { resolveSessionBaseBranch } from "../_sessions/baseBranch";
import { extractPrNumber } from "./helpers";
import { isBranchNotAheadError } from "./prErrors";
import { getActionRepoWithAccess } from "../functions";

/**
 * Promotes a session's draft PR to ready-for-review. Called when the user
 * clicks "Send for Review". Draft PRs are opened automatically after the first
 * successful agent push (`createDraftSessionPr`); this path only flips draft →
 * open. If a draft is somehow missing (older sessions), it creates one first
 * then promotes so the button still works. The session stays active and
 * editable — archiving is a separate explicit action.
 */
export const createSessionPr = action({
  args: { sessionId: v.id("sessions") },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args): Promise<{ url: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const session = await ctx.runQuery(api.sessions.get, {
      id: args.sessionId,
    });
    if (!session) throw new Error("Session not found");
    if (!session.branchName) {
      throw new Error("No branch associated with this session");
    }

    const repo = await getActionRepoWithAccess(ctx, session.repoId);

    let prUrl = session.prUrl;
    if (prUrl === undefined) {
      // Recovery for sessions that pushed commits before auto-draft existed.
      const created = await ctx.runAction(
        internal.github.createDraftSessionPr,
        {
          sessionId: args.sessionId,
        },
      );
      if (created === null) {
        throw new Error(
          "No draft PR to send for review. Make an edit so Eva can open one, then try again.",
        );
      }
      prUrl = created;
    }

    const prNumber = extractPrNumber(prUrl);
    if (prNumber) {
      await ctx.runAction(internal.taskWorkflowActions.markPrReadyForReview, {
        installationId: repo.installationId,
        repoOwner: repo.owner,
        repoName: repo.name,
        prNumber,
      });
    }

    // Write the reviewer description here rather than on every push: this is
    // the moment the work is offered for review, the diff is final, the
    // session sandbox is normally still up, and it costs one model call per
    // review instead of one per turn. Scheduled, not awaited, so the modal
    // returns straight away — the action is best-effort, so a stopped sandbox
    // just logs and leaves the static body in place.
    if (session.sandboxId !== undefined) {
      await ctx.scheduler.runAfter(0, internal.github.generatePrDescription, {
        installationId: repo.installationId,
        repoOwner: repo.owner,
        repoName: repo.name,
        prUrl,
        sandboxId: session.sandboxId,
        repoId: session.repoId,
      });
    }

    await ctx.runMutation(internal.sessions.setPrState, {
      id: args.sessionId,
      prState: "open",
    });
    return { url: prUrl };
  },
});

/**
 * The single GitHub call behind every draft PR a multi-repo session opens —
 * the primary repo's PR and each linked `sessionRepos` PR alike. Delegates to
 * `taskWorkflowActions.createPullRequest` (open-or-update-existing, then wait
 * for the head ref to be visible) so there is exactly one codepath that talks
 * to GitHub for a draft session PR, whichever repo it belongs to.
 */
async function createDraftPrOnGitHub(
  ctx: ActionCtx,
  args: {
    installationId: number;
    owner: string;
    name: string;
    branchName: string;
    baseBranch: string;
    title: string;
    body: string;
    labels: string[];
  },
): Promise<string> {
  return await ctx.runAction(
    internal.taskWorkflowActions.createPullRequest,
    {
      installationId: args.installationId,
      repoOwner: args.owner,
      repoName: args.name,
      branchName: args.branchName,
      baseBranch: args.baseBranch,
      title: args.title,
      body: args.body,
      labels: args.labels,
      draft: true,
    },
  );
}

/**
 * Opens a draft PR for a session branch after the first successful push.
 * Idempotent: returns the existing prUrl when one is already stored.
 * Returns null (no alert) when the branch has no commits ahead of base —
 * plan-only turns push the branch tip but have nothing to review yet; later
 * turns with commits retry and open the draft.
 * Called from sessionExecuteWorkflow after pushSandboxBranch succeeds.
 */
export const createDraftSessionPr = internalAction({
  args: { sessionId: v.id("sessions") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args): Promise<string | null> => {
    const session = await ctx.runQuery(internal.sessions.getInternal, {
      id: args.sessionId,
    });
    if (!session) return null;
    if (!session.branchName) return null;
    if (session.prUrl) return session.prUrl;

    const repo = await ctx.runQuery(internal.githubRepos.getInternal, {
      id: session.repoId,
    });
    if (!repo) return null;

    const appLabel: string | undefined = repo.rootDirectory
      ? repo.rootDirectory.split("/").pop()
      : undefined;

    // The reviewer-facing description is generated from the diff after the PR
    // exists (`generatePrDescription`); the session summary is only included
    // when the user has already produced one.
    const sections =
      session.summary && session.summary.length > 0
        ? [
            {
              heading: "Summary",
              content: session.summary
                .map((item: string) => `- ${item}`)
                .join("\n"),
            },
          ]
        : [];

    const evaUrl = buildEvaSessionUrl(
      repo.owner,
      repo.name,
      args.sessionId,
      repo.rootDirectory,
    );

    // Linked repos may already have a draft PR open (multi-repo sessions push
    // and open each repo's PR independently) — link to whichever are already
    // known. A sibling opened after this PR is not retrofitted into its body.
    const linkedRepos = await ctx.runQuery(
      internal.sessions.listLinkedReposInternal,
      { sessionId: args.sessionId },
    );
    const siblingPrs: SiblingPr[] = linkedRepos.reduce<SiblingPr[]>(
      (acc, linked) => {
        if (linked.prUrl !== undefined) {
          acc.push({ label: `${linked.owner}/${linked.name}`, url: linked.prUrl });
        }
        return acc;
      },
      [],
    );
    const body = appendRelatedPrsSection(
      buildPrBody(sections, evaUrl),
      siblingPrs,
    );

    let result: string;
    try {
      result = await createDraftPrOnGitHub(ctx, {
        installationId: repo.installationId,
        owner: repo.owner,
        name: repo.name,
        branchName: session.branchName,
        baseBranch: resolveSessionBaseBranch(session, repo),
        title: session.title,
        body,
        labels: ["eva", "session", "draft", ...(appLabel ? [appLabel] : [])],
      });
    } catch (error) {
      if (isBranchNotAheadError(error)) {
        console.log(
          `[github] Skipping draft PR for session ${args.sessionId}: branch has no commits ahead of base`,
        );
        return null;
      }
      throw error;
    }

    await ctx.runMutation(internal.sessions.setPrUrl, {
      id: args.sessionId,
      prUrl: result,
      prState: "draft",
    });
    console.log(
      `[github] Created draft PR for session ${args.sessionId}: ${result}`,
    );

    return result;
  },
});

/**
 * Opens a draft PR for one linked repo's branch after its first successful
 * push, mirroring `createDraftSessionPr` for the primary. Idempotent: returns
 * the existing prUrl when the row already has one. Called from
 * `sessionExecuteWorkflow` after `pushLinkedRepoBranches` reports a repo as
 * newly published.
 */
export const createDraftSessionRepoPr = internalAction({
  args: { sessionRepoId: v.id("sessionRepos") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args): Promise<string | null> => {
    const linkedRepo = await ctx.runQuery(
      internal.sessions.getSessionRepoInternal,
      { id: args.sessionRepoId },
    );
    if (!linkedRepo) return null;
    if (linkedRepo.prUrl) return linkedRepo.prUrl;

    const session = await ctx.runQuery(internal.sessions.getInternal, {
      id: linkedRepo.sessionId,
    });
    if (!session) return null;

    const primaryRepo = await ctx.runQuery(internal.githubRepos.getInternal, {
      id: session.repoId,
    });
    if (!primaryRepo) return null;

    // Every sibling PR already known: the primary's, plus every other linked
    // repo's, whichever already exist at this repo's PR-creation time.
    const otherLinkedRepos = await ctx.runQuery(
      internal.sessions.listLinkedReposInternal,
      { sessionId: linkedRepo.sessionId },
    );
    const siblingPrs: SiblingPr[] = [];
    if (session.prUrl !== undefined) {
      siblingPrs.push({
        label: `${primaryRepo.owner}/${primaryRepo.name}`,
        url: session.prUrl,
      });
    }
    for (const other of otherLinkedRepos) {
      if (other._id === linkedRepo._id || other.prUrl === undefined) continue;
      siblingPrs.push({ label: `${other.owner}/${other.name}`, url: other.prUrl });
    }

    const evaUrl = buildEvaSessionUrl(
      primaryRepo.owner,
      primaryRepo.name,
      linkedRepo.sessionId,
      primaryRepo.rootDirectory,
    );
    const body = appendRelatedPrsSection(buildPrBody([], evaUrl), siblingPrs);

    let result: string;
    try {
      result = await createDraftPrOnGitHub(ctx, {
        installationId: linkedRepo.installationId,
        owner: linkedRepo.owner,
        name: linkedRepo.name,
        branchName: linkedRepo.branchName,
        baseBranch: linkedRepo.baseBranch,
        title: session.title,
        body,
        labels: ["eva", "session", "draft"],
      });
    } catch (error) {
      if (isBranchNotAheadError(error)) {
        console.log(
          `[github] Skipping draft PR for sessionRepo ${args.sessionRepoId}: branch has no commits ahead of base`,
        );
        return null;
      }
      throw error;
    }

    await ctx.runMutation(internal.sessions.patchSessionRepo, {
      id: args.sessionRepoId,
      prUrl: result,
      prState: "draft",
    });
    console.log(
      `[github] Created draft PR for sessionRepo ${args.sessionRepoId}: ${result}`,
    );

    return result;
  },
});
