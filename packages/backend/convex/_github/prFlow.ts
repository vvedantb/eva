"use node";

import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "../_generated/server";
import { api, internal } from "../_generated/api";
import {
  appendRelatedPrsSection,
  buildPrBody,
  buildTaskPrSections,
  upsertRelatedPrsBlock,
  type SiblingPr,
} from "../prBody";
import { isLivePrState } from "@eva/shared";
import { buildEvaSessionUrl, buildEvaTaskUrl } from "../_taskWorkflow/urls";
import { sessionOwnerTaskId } from "../_sessions/owner";
import { resolveSessionBaseBranch } from "../_sessions/baseBranch";
import { extractPrNumber } from "./helpers";
import { isBranchNotAheadError } from "./prErrors";
import { getActionRepoWithAccess } from "../functions";
import type { Doc, Id } from "../_generated/dataModel";
import { sessionRepoPullRequest } from "../_pullRequests/store";
import { getInstallationOctokit } from "../githubAuth";
import { addPullRequestToStack } from "./prStack";
import { invalidatePrOverviewCache } from "./prOverview";
import { sessionPullRequestLabels } from "./prLabels";
import { getPullRequest, patchPullRequest } from "./pullRequestWrite";
import { errorMessage } from "@vvedantb/server";

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

    const [repo, sessionPrs] = await Promise.all([
      getActionRepoWithAccess(ctx, session.repoId),
      ctx.runQuery(internal.pullRequests.listForOwnerInternal, {
        owner: { kind: "session", sessionId: args.sessionId },
      }),
    ]);
    let prUrl = sessionRepoPullRequest(sessionPrs, undefined)?.prUrl;
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

    await ctx.runMutation(internal.sessions.setSessionPrState, {
      sessionId: args.sessionId,
      prUrl,
      prState: "open",
    });
    return { url: prUrl };
  },
});

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

async function siblingPullRequests(
  ctx: ActionCtx,
  sessionPrs: Doc<"pullRequests">[],
  sessionRepoId: Id<"sessionRepos"> | undefined,
): Promise<SiblingPr[]> {
  const others = sessionPrs.filter((pr) => {
    if (pr.owner.kind === "task") return true;
    return (
      pr.owner.kind === "session" &&
      !(
        pr.owner.sessionRepoId === sessionRepoId &&
        (sessionRepoId === undefined ? pr.primary : pr.origin === "eva")
      )
    );
  });
  return Promise.all(
    others.map(async (pr): Promise<SiblingPr> => {
      const repo = await ctx.runQuery(internal.githubRepos.getInternal, {
        id: pr.repoId,
      });
      return {
        label: repo ? `${repo.owner}/${repo.name}` : `#${pr.prNumber}`,
        url: pr.prUrl,
      };
    }),
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
    const [session, sessionPrs] = await Promise.all([
      ctx.runQuery(internal.sessions.getInternal, { id: args.sessionId }),
      ctx.runQuery(internal.pullRequests.listForOwnerInternal, {
        owner: { kind: "session", sessionId: args.sessionId },
      }),
    ]);
    if (!session) return null;
    if (!session.branchName) return null;
    const existing = sessionRepoPullRequest(sessionPrs, undefined);
    if (existing) return existing.prUrl;

    const repo = await ctx.runQuery(internal.githubRepos.getInternal, {
      id: session.repoId,
    });
    if (!repo) return null;

    const evaUrl = buildEvaSessionUrl(
      repo.owner,
      repo.name,
      args.sessionId,
      repo.rootDirectory,
    );

    const siblingPrs = await siblingPullRequests(ctx, sessionPrs, undefined);
    const body = appendRelatedPrsSection(
      buildPrBody([], evaUrl),
      siblingPrs,
    );

    const baseBranch = resolveSessionBaseBranch(session, repo);
    let result: string;
    try {
      result = await createDraftPrOnGitHub(ctx, {
        installationId: repo.installationId,
        owner: repo.owner,
        name: repo.name,
        branchName: session.branchName,
        baseBranch,
        title: session.title,
        body,
        labels: sessionPullRequestLabels(repo.rootDirectory),
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

    await ctx.runMutation(internal.sessions.recordSessionPr, {
      sessionId: args.sessionId,
      repoId: session.repoId,
      prUrl: result,
      prState: "draft",
      headBranch: session.branchName,
      baseBranch,
      title: session.title,
    });
    console.log(
      `[github] Created draft PR for session ${args.sessionId}: ${result}`,
    );

    if (session.stackOnPrNumber !== undefined) {
      await ctx.scheduler.runAfter(0, internal.github.linkSessionPrToStack, {
        repoId: session.repoId,
        parentPrNumber: session.stackOnPrNumber,
        prUrl: result,
      });
    }

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
    const sessionPrs = await ctx.runQuery(
      internal.pullRequests.listForOwnerInternal,
      { owner: { kind: "session", sessionId: linkedRepo.sessionId } },
    );
    const existing = sessionRepoPullRequest(sessionPrs, linkedRepo._id);
    if (existing) return existing.prUrl;

    const session = await ctx.runQuery(internal.sessions.getInternal, {
      id: linkedRepo.sessionId,
    });
    if (!session) return null;

    const primaryRepo = await ctx.runQuery(internal.githubRepos.getInternal, {
      id: session.repoId,
    });
    if (!primaryRepo) return null;

    const taskId = sessionOwnerTaskId(session);
    const task = taskId
      ? await ctx.runQuery(internal.agentTasks.getInternal, { id: taskId })
      : null;
    const taskPrs = task
      ? await ctx.runQuery(internal.pullRequests.listForOwnerInternal, {
          owner: { kind: "task", taskId: task._id },
        })
      : [];

    const siblingPrs = [
      ...(await siblingPullRequests(ctx, taskPrs, undefined)),
      ...(await siblingPullRequests(ctx, sessionPrs, linkedRepo._id)),
    ];

    const evaUrl = task
      ? buildEvaTaskUrl(
          primaryRepo.owner,
          primaryRepo.name,
          task._id,
          task.projectId,
          primaryRepo.rootDirectory,
        )
      : buildEvaSessionUrl(
          primaryRepo.owner,
          primaryRepo.name,
          linkedRepo.sessionId,
          primaryRepo.rootDirectory,
        );
    const body = appendRelatedPrsSection(
      buildPrBody(
        task ? buildTaskPrSections(task.description, []) : [],
        evaUrl,
      ),
      siblingPrs,
    );

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
        labels: sessionPullRequestLabels(undefined),
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

    await ctx.runMutation(internal.sessions.recordSessionPr, {
      sessionId: linkedRepo.sessionId,
      sessionRepoId: linkedRepo._id,
      repoId: linkedRepo.repoId,
      prUrl: result,
      prState: "draft",
      headBranch: linkedRepo.branchName,
      baseBranch: linkedRepo.baseBranch,
      title: session.title,
    });
    console.log(
      `[github] Created draft PR for sessionRepo ${args.sessionRepoId}: ${result}`,
    );

    const taskPr = taskPrs.find((pr) => pr.primary && isLivePrState(pr.state));
    if (task && taskPr) {
      await patchTaskPrRelatedPrs(ctx, task._id, taskPr);
    }

    return result;
  },
});

async function patchTaskPrRelatedPrs(
  ctx: ActionCtx,
  taskId: Id<"agentTasks">,
  taskPr: Doc<"pullRequests">,
): Promise<void> {
  try {
    const [repo, relatedPrs] = await Promise.all([
      ctx.runQuery(internal.githubRepos.getInternal, { id: taskPr.repoId }),
      ctx.runQuery(internal.pullRequests.taskRelatedPrLinksInternal, {
        taskId,
      }),
    ]);
    if (!repo) return;
    const octokit = await getInstallationOctokit(repo.installationId);
    const target = {
      owner: repo.owner,
      repo: repo.name,
      pull_number: taskPr.prNumber,
    };
    const current = await getPullRequest(octokit, target);
    const body = upsertRelatedPrsBlock(current.body ?? "", relatedPrs);
    if (body !== (current.body ?? "")) {
      await patchPullRequest(octokit, target, { body });
    }
  } catch (error) {
    console.error(
      `[github] Failed to list related PRs on task PR ${taskPr.prUrl}: ${errorMessage(error)}`,
    );
  }
}

/**
 * Joins a stacked session's new PR to the GitHub stack of the PR it was started
 * on. Scheduled after the draft opens rather than awaited, and best-effort: a
 * repository without stacked PRs, or a parent that is no longer the top of its
 * stack, leaves an ordinary PR whose base is the parent's branch — still
 * reviewable and mergeable, only without the one-step stack merge.
 */
export const linkSessionPrToStack = internalAction({
  args: {
    repoId: v.id("githubRepos"),
    parentPrNumber: v.number(),
    prUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const childPrNumber = extractPrNumber(args.prUrl);
    if (!childPrNumber) return null;
    const repo = await ctx.runQuery(internal.githubRepos.getInternal, {
      id: args.repoId,
    });
    if (!repo) return null;

    const octokit = await getInstallationOctokit(repo.installationId);
    try {
      const stackNumber = await addPullRequestToStack(
        octokit,
        { owner: repo.owner, repo: repo.name },
        args.parentPrNumber,
        childPrNumber,
      );
      console.log(
        `[github] Stacked #${childPrNumber} on #${args.parentPrNumber} (stack #${stackNumber})`,
      );
    } catch (error) {
      console.error(
        `[github] Could not stack #${childPrNumber} on #${args.parentPrNumber}: ${errorMessage(error)}`,
      );
      return null;
    }

    await Promise.all(
      [args.parentPrNumber, childPrNumber].map((prNumber) =>
        invalidatePrOverviewCache(ctx, { repoId: args.repoId, prNumber }),
      ),
    );
    return null;
  },
});
