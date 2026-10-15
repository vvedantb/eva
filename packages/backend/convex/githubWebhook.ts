import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  notifyProjectSubscribers,
  notifySubscribers,
} from "./taskSubscribers";
import { logTaskActivity } from "./taskActivity";
import {
  buildProjectBranchName,
  resolveProjectBranchName,
} from "./_git/branchNames";
import {
  deriveProjectPhaseFromPrEvent,
  isProjectReviewPhase,
} from "./_projects/prSync";
import { requestTaskSandboxStop } from "./_agentTasks/sandbox";
import { scheduleTaskSandboxGraceDelete } from "./sandboxCleanup";
import { reconcileSessionArchiveState } from "./_sessions/prArchive";
import {
  allPullRequestsTerminal,
  derivePrStateFromEvent,
  findPullRequestByUrl,
  listOwnerPullRequests,
  ownerRef,
  recordPullRequest,
  resolvePrOwnerFromBranch,
  setPullRequestState,
  type PrState,
} from "./_pullRequests/store";
import { findReposByOwnerAndName } from "./_githubRepos/helpers";
import { cancelScheduledFunction } from "./_scheduling/helpers";

/** Webhook actions that can change a PR's tracked state or its title. */
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
    /** The repository the PR targets (the webhook's `repository`). */
    repoOwner: v.optional(v.string()),
    repoName: v.optional(v.string()),
    /** False when the head lives in a fork: a fork's branch names prove nothing. */
    headInSameRepo: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!TRACKED_ACTIONS.has(args.action)) return null;
    const nextState = derivePrStateFromEvent(
      args.action,
      args.draft,
      args.merged,
    );

    let row = await findPullRequestByUrl(ctx.db, args.prUrl);
    const previousState: PrState | undefined = row?.state;
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
    if (owner.kind === "session") {
      await reconcileSessionArchiveState(ctx, owner.sessionId);
      // A "merged" event can be a false positive: GitHub marks a PR merged
      // whenever its commit SHAs land on the base branch via ANY PR (a
      // "tip-copy"). A delayed check confirms the merge commit belongs to this
      // PR and detaches it if not. Only on the transition into merged.
      if (nextState === "merged" && args.mergeCommitSha !== undefined) {
        await ctx.scheduler.runAfter(
          15_000,
          internal.github.verifySessionPrMerged,
          { prUrl: row.prUrl, mergeCommitSha: args.mergeCommitSha },
        );
      }
      return null;
    }

    const terminal = nextState === "merged" || nextState === "closed";
    let finished = false;
    if (owner.kind === "project") {
      finished = await applyProjectPrEvent(ctx, owner.projectId, row, {
        action: args.action,
        draft: args.draft,
      });
    } else if (terminal) {
      finished = await applyQuickTaskPrClosed(ctx, owner.taskId, row);
    }
    if (terminal) {
      // Audit trail of the close; "skipped" when the owner did not move
      // (another PR is still live, or it had already finished).
      await ctx.db.insert("githubWebhookEvents", {
        event: "pull_request",
        action: "closed",
        prUrl: row.prUrl,
        merged: nextState === "merged",
        status: finished ? "completed" : "skipped",
        createdAt: Date.now(),
        ...(owner.taskId !== undefined ? { taskId: owner.taskId } : {}),
      });
    }
    return null;
  },
});

/**
 * Links a PR Eva has no row for to the owner its head branch names. Covers a
 * PR the agent opened from a side branch (`eva/session-<id>-<slug>`), one a
 * person opened by hand on an Eva branch, and one Eva opened but lost before
 * recording (its own branch, so it is restored as the primary when the owner
 * has none).
 */
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

/**
 * A project's phase follows its primary PR through draft/ready, and its PRs as
 * a whole for completion: merged once every PR is terminal and one merged,
 * cancelled once every PR is closed unmerged. Merging the PR of the current
 * branch starts a fresh branch version, so the next cycle opens a new PR.
 * Task statuses are never touched: they are the record of what each task did,
 * and a merge or close can be undone on GitHub.
 */
async function applyProjectPrEvent(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  row: Doc<"pullRequests">,
  event: { action: string; draft: boolean | undefined },
): Promise<boolean> {
  const project = await ctx.db.get(projectId);
  if (!project) return false;

  if (row.state !== "merged" && row.state !== "closed") {
    const nextPhase = deriveProjectPhaseFromPrEvent(event.action, event.draft);
    if (
      row.primary &&
      nextPhase !== null &&
      isProjectReviewPhase(project.phase) &&
      project.phase !== nextPhase
    ) {
      await ctx.db.patch(projectId, { phase: nextPhase });
    }
    return false;
  }

  const currentBranch = resolveProjectBranchName(projectId, project);
  if (row.state === "merged" && row.headBranch === currentBranch) {
    const nextVersion = (project.branchVersion ?? 1) + 1;
    const deleteId = project.sandboxId;
    if (deleteId) {
      await ctx.scheduler.runAfter(0, internal.sandbox.deleteSandbox, {
        sandboxId: deleteId,
        repoId: project.repoId,
      });
    }
    await ctx.db.patch(projectId, {
      sandboxId: undefined,
      lastSandboxActivity: undefined,
      branchVersion: nextVersion,
      branchName: buildProjectBranchName(projectId, nextVersion),
    });
  }

  const rows = await listOwnerPullRequests(ctx.db, {
    kind: "project",
    projectId,
  });
  if (!allPullRequestsTerminal(rows)) return false;
  const merged = rows.some((pr) => pr.state === "merged");
  await ctx.db.patch(projectId, { phase: merged ? "completed" : "cancelled" });

  // One notification for the project as a whole, never one per task, and a
  // single activity entry on the task that opened the PR so the merge/close
  // still leaves a trace on a timeline.
  const projectTitle = project.title;
  await notifyProjectSubscribers(ctx, {
    projectId,
    type: merged ? "task_complete" : "system",
    title: merged
      ? `PR merged — project "${projectTitle}" moved to Merged`
      : `PR closed — project "${projectTitle}" moved to Cancelled`,
    message: merged
      ? `GitHub merged ${row.prUrl}. The project moved to merged; its tasks kept their status.`
      : `GitHub closed ${row.prUrl} without merge. The project moved to cancelled; its tasks kept their status.`,
    repoId: project.repoId,
  });
  if (row.owner.kind === "project" && row.owner.taskId !== undefined) {
    await logTaskActivity(
      ctx,
      row.owner.taskId,
      undefined,
      "pr",
      undefined,
      merged ? "merged" : "closed",
    );
  }
  return true;
}

/**
 * A quick task's status follows its PRs: done once every PR is terminal and
 * one merged, cancelled once every PR is closed unmerged. A task with a second
 * PR still open stays where it is.
 */
async function applyQuickTaskPrClosed(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
  row: Doc<"pullRequests">,
): Promise<boolean> {
  const task = await ctx.db.get(taskId);
  if (!task) return false;
  if (task.status === "done" || task.status === "cancelled") return false;
  const rows = await listOwnerPullRequests(ctx.db, { kind: "task", taskId });
  if (!allPullRequestsTerminal(rows)) return false;
  const merged = rows.some((pr) => pr.state === "merged");

  const now = Date.now();
  const newStatus = merged ? "done" : "cancelled";
  await ctx.db.patch(task._id, { status: newStatus, updatedAt: now });

  if (task.scheduledFunctionId) {
    await cancelScheduledFunction(ctx, task.scheduledFunctionId);
    await ctx.db.patch(task._id, {
      scheduledAt: undefined,
      scheduledFunctionId: undefined,
    });
  }

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

  // Record the PR event on the task's activity timeline so the merge/close is
  // visible there, not just as a notification. System-driven, so no actor.
  await logTaskActivity(
    ctx,
    task._id,
    undefined,
    "pr",
    undefined,
    merged ? "merged" : "closed",
  );

  // A merged/closed PR makes the task read-only, so stop any live preview
  // sandbox now (mirrors the session archive) and then grace-delete it.
  if (
    task.reviewTaskSandboxStatus === "active" ||
    task.reviewTaskSandboxStatus === "starting" ||
    task.reviewTaskSandboxStatus === "stopping" ||
    task.sandboxId !== undefined
  ) {
    await requestTaskSandboxStop(ctx, task._id);
  }
  if (task.sandboxId) {
    await scheduleTaskSandboxGraceDelete(ctx, {
      ...task,
      status: newStatus,
      updatedAt: now,
    });
  }
  return true;
}

/**
 * On push to a repo's configured base branch, schedule a skill sync when the
 * commit set touches `.agents/skills` or `.claude/skills` (or when path lists
 * are empty — e.g. some force-pushes — so we still converge).
 */
export const handlePushForSkillSync = internalMutation({
  args: {
    owner: v.string(),
    name: v.string(),
    branch: v.string(),
    touchedSkillsPath: v.boolean(),
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
    if (!workflowRepo || workflowRepo.connected === false) return null;

    const baseBranch =
      workflowRepo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH;
    if (args.branch !== baseBranch) return null;
    if (!args.touchedSkillsPath) return null;

    await ctx.scheduler.runAfter(
      0,
      internal._repoSkills.sync.syncRepoInternal,
      { repoId: workflowRepo._id },
    );
    return null;
  },
});
