import { FALLBACK_GIT_BASE_BRANCH, isLivePrState } from "@eva/shared";
import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { notifySubscribers } from "./taskSubscribers";
import { logTaskActivity } from "./taskActivity";
import { cancelTaskRunSchedule } from "./_agentTasks/runState";
import { syncOwnedSessionWithTaskStatus } from "./_sessions/ownedSession";
import { onProjectTasksChanged } from "./functions";
import { reconcileSessionArchiveState } from "./_sessions/prArchive";
import {
  derivePrStateFromEvent,
  findPullRequestByUrl,
  linkedPullRequestTaskId,
  listOwnerPullRequests,
  ownerRef,
  recordPullRequest,
  resolvePrOwnerFromBranch,
  setPullRequestState,
  taskPrSummary,
  type PrState,
} from "./_pullRequests/store";
import { findReposByOwnerAndName } from "./_githubRepos/helpers";

const TRACKED_ACTIONS = new Set([
  "opened",
  "reopened",
  "ready_for_review",
  "converted_to_draft",
  "closed",
  "edited",
]);

/**
 * Every `pull_request` webhook lands here (see `http.ts`). The PR row is the
 * one record of truth, so it is updated first — or created, when the PR was
 * opened on an Eva branch by the agent (or by hand) rather than by Eva's own
 * flow — and only then does the owner react, reading the state of every PR it
 * holds. With one PR per owner this behaves exactly as it always has.
 */
export const handlePullRequestEvent = internalMutation({
  args: {
    prUrl: v.string(),
    action: v.string(),
    draft: v.optional(v.boolean()),
    merged: v.optional(v.boolean()),
    mergeCommitSha: v.optional(v.string()),
    title: v.optional(v.string()),
    headBranch: v.optional(v.string()),
    baseBranch: v.optional(v.string()),
    repoOwner: v.optional(v.string()),
    repoName: v.optional(v.string()),
    headInSameRepo: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!TRACKED_ACTIONS.has(args.action)) return null;
    let row = await findPullRequestByUrl(ctx.db, args.prUrl);
    const previousState: PrState | undefined = row?.state;
    const eventState = derivePrStateFromEvent(
      args.action,
      args.draft,
      args.merged,
    );
    const staleLiveEvent =
      previousState !== undefined &&
      !isLivePrState(previousState) &&
      eventState !== null &&
      isLivePrState(eventState) &&
      args.action !== "reopened";
    const nextState = staleLiveEvent ? null : eventState;
    if (row) {
      await setPullRequestState(ctx, row, {
        state: nextState ?? row.state,
        title: args.title,
        headBranch: args.headBranch,
        baseBranch: args.baseBranch,
      });
      row = await ctx.db.get(row._id);
      if (!row) return null;
    } else {
      row = await attachUntrackedPullRequest(ctx, args, nextState);
      if (!row) return null;
    }
    if (nextState === null || nextState === previousState) return null;

    const owner = row.owner;
    const linkedTaskId = await linkedPullRequestTaskId(ctx.db, row);
    if (owner.kind === "session") {
      await reconcileSessionArchiveState(ctx, owner.sessionId);
      if (nextState === "merged" && args.mergeCommitSha !== undefined) {
        await ctx.scheduler.runAfter(
          15_000,
          internal.github.verifySessionPrMerged,
          { prUrl: row.prUrl, mergeCommitSha: args.mergeCommitSha },
        );
      }
      if (linkedTaskId === undefined) return null;
    }

    const terminal = nextState === "merged" || nextState === "closed";
    let finished = false;
    const taskId = owner.kind === "task" ? owner.taskId : linkedTaskId;
    if (taskId !== undefined && terminal) {
      finished = await applyTaskPrClosed(ctx, taskId, row);
      const task = await ctx.db.get(taskId);
      if (nextState === "merged" && task?.projectId !== undefined) {
        await onProjectTasksChanged(ctx, task.projectId);
      }
    }
    const eventTaskId = owner.kind === "session" ? taskId : owner.taskId;
    if (terminal) {
      await ctx.db.insert("githubWebhookEvents", {
        event: "pull_request",
        action: "closed",
        prUrl: row.prUrl,
        merged: nextState === "merged",
        status: finished ? "completed" : "skipped",
        createdAt: Date.now(),
        ...(eventTaskId !== undefined ? { taskId: eventTaskId } : {}),
      });
    }
    return null;
  },
});

async function attachUntrackedPullRequest(
  ctx: MutationCtx,
  args: {
    prUrl: string;
    title?: string;
    headBranch?: string;
    baseBranch?: string;
    repoOwner?: string;
    repoName?: string;
    headInSameRepo?: boolean;
  },
  nextState: PrState | null,
): Promise<Doc<"pullRequests"> | null> {
  if (
    args.headBranch === undefined ||
    args.repoOwner === undefined ||
    args.repoName === undefined ||
    args.headInSameRepo === false
  ) {
    return null;
  }
  const resolved = await resolvePrOwnerFromBranch(ctx.db, {
    branch: args.headBranch,
    repoOwner: args.repoOwner,
    repoName: args.repoName,
  });
  if (!resolved) return null;
  const existing = await listOwnerPullRequests(
    ctx.db,
    ownerRef(resolved.owner),
  );
  const ownerHasPrimary = existing.some((row) => row.primary);
  return await recordPullRequest(ctx, {
    owner: resolved.owner,
    repoId: resolved.repoId,
    prUrl: args.prUrl,
    state: nextState ?? "open",
    primary: resolved.isMainBranch && !ownerHasPrimary,
    origin: resolved.isMainBranch ? "eva" : "agent",
    headBranch: args.headBranch,
    baseBranch: args.baseBranch,
    title: args.title,
  });
}

async function applyTaskPrClosed(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
  row: Doc<"pullRequests">,
): Promise<boolean> {
  const task = await ctx.db.get(taskId);
  if (!task) return false;
  if (task.status === "done" || task.status === "cancelled") return false;
  const { prState } = await taskPrSummary(ctx.db, taskId);
  if (prState !== "merged" && prState !== "closed") return false;
  const merged = prState === "merged";
  if (!merged && task.projectId !== undefined) return false;

  const now = Date.now();
  const newStatus = merged ? "done" : "cancelled";
  await ctx.db.patch(task._id, { status: newStatus, updatedAt: now });

  await cancelTaskRunSchedule(ctx, task._id);

  await notifySubscribers(ctx, {
    taskId: task._id,
    type: merged ? "task_complete" : "system",
    title: merged
      ? `PR merged — "${task.title}" moved to done`
      : `PR closed — "${task.title}" moved to cancelled`,
    message: merged
      ? `GitHub merged ${row.prUrl}. Task moved to done.`
      : `GitHub closed ${row.prUrl} without merge. Task moved to cancelled.`,
    repoId: task.repoId,
  });

  await logTaskActivity(
    ctx,
    task._id,
    undefined,
    "pr",
    undefined,
    merged ? "merged" : "closed",
  );

  await syncOwnedSessionWithTaskStatus(ctx, task, task.status, newStatus);
  return true;
}

/**
 * On push to a repo's configured base branch, schedule a skill sync when the
 * commit set touches `.agents/skills` or `.claude/skills`, and a `.eva/` config
 * sync when it touches `.eva/` (either also fires when path lists are empty —
 * e.g. some force-pushes — so we still converge).
 */
export const handlePushToBaseBranch = internalMutation({
  args: {
    owner: v.string(),
    name: v.string(),
    branch: v.string(),
    touchedSkillsPath: v.boolean(),
    touchedEvaConfig: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const siblings = await findReposByOwnerAndName(ctx.db, args);
    if (siblings.length === 0) return null;

    const workflowRepo =
      siblings.find(
        (repo) =>
          repo.parentRepoId === undefined && repo.rootDirectory === undefined,
      ) ??
      siblings.find((repo) => repo.parentRepoId === undefined) ??
      siblings[0];
    if (!workflowRepo) return null;

    const baseBranch =
      workflowRepo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH;
    if (args.branch !== baseBranch) return null;

    if (args.touchedSkillsPath && workflowRepo.connected !== false) {
      await ctx.scheduler.runAfter(
        0,
        internal._repoSkills.sync.syncRepoInternal,
        { repoId: workflowRepo._id },
      );
    }
    if (
      args.touchedEvaConfig &&
      siblings.some((repo) => repo.connected !== false)
    ) {
      await ctx.scheduler.runAfter(
        0,
        internal._evaConfig.sync.syncEvaConfig,
        { repoId: workflowRepo._id },
      );
    }
    return null;
  },
});
