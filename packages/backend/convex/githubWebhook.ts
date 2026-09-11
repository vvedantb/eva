import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { notifySubscribers } from "./taskSubscribers";
import { logTaskActivity } from "./taskActivity";
import type { Doc } from "./_generated/dataModel";
import { preferPersistedSandboxId } from "./_sandbox/resolveExistingSandboxId";
import { buildProjectBranchName } from "./_projects/helpers";
import {
  deriveProjectPhaseFromPrEvent,
  extractPrNumberFromUrl,
  isProjectReviewPhase,
} from "./_projects/prSync";
import { requestTaskSandboxStop } from "./_agentTasks/sandbox";
import { requestSessionSandboxStop } from "./_sessions/sandbox";
import {
  cancelSessionSandboxGraceDelete,
  scheduleSessionSandboxGraceDelete,
  scheduleTaskSandboxGraceDelete,
} from "./sandboxCleanup";
import { createNotification } from "./notifications";

const QUICK_TASK_BRANCH_PREFIX = "eva/task-";
const PROJECT_BRANCH_PREFIX = "eva/project-";

/**
 * Recovers an agentRun from an Eva-conventional branch name when the merge
 * webhook arrives without a PR URL match. Returns the most recent run on the
 * matching task (or any task in the project), or null if the branch doesn't
 * parse or the task/project no longer exists.
 */
async function findRunByBranchName(
  ctx: MutationCtx,
  branchName: string,
): Promise<Doc<"agentRuns"> | null> {
  if (branchName.startsWith(QUICK_TASK_BRANCH_PREFIX)) {
    const candidate = branchName.slice(QUICK_TASK_BRANCH_PREFIX.length);
    const taskId = ctx.db.normalizeId("agentTasks", candidate);
    if (!taskId) return null;
    return await ctx.db
      .query("agentRuns")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .order("desc")
      .first();
  }

  if (branchName.startsWith(PROJECT_BRANCH_PREFIX)) {
    // Strip the optional `-vN` suffix so the remainder is the raw project id.
    const candidate = branchName
      .slice(PROJECT_BRANCH_PREFIX.length)
      .replace(/-v\d+$/, "");
    const projectId = ctx.db.normalizeId("projects", candidate);
    if (!projectId) return null;
    const tasks = await ctx.db
      .query("agentTasks")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const task of tasks) {
      const run = await ctx.db
        .query("agentRuns")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .order("desc")
        .first();
      if (run) return run;
    }
    return null;
  }

  return null;
}

/** Maps an incoming GitHub PR webhook event to the session's prState.
 * Returns null when the event doesn't represent a state we track. */
function deriveSessionPrState(
  action: string,
  draft: boolean | undefined,
  merged: boolean | undefined,
): "draft" | "open" | "merged" | "closed" | null {
  if (action === "closed") {
    return merged ? "merged" : "closed";
  }
  if (action === "converted_to_draft") return "draft";
  if (action === "ready_for_review") return "open";
  if (action === "opened" || action === "reopened") {
    return draft ? "draft" : "open";
  }
  return null;
}

/** Inbox copy for a session auto-archived because its GitHub PR closed or merged. */
export function sessionPrArchiveNotificationCopy(args: {
  sessionTitle: string;
  prUrl: string;
  prNumber?: number;
  merged: boolean;
}): { title: string; message: string } {
  const number = args.prNumber ?? extractPrNumberFromUrl(args.prUrl);
  const prRef = number !== null ? `PR #${number}` : args.prUrl;
  if (args.merged) {
    return {
      title: `${prRef} merged — "${args.sessionTitle}" archived`,
      message: `${prRef} was merged on GitHub (${args.prUrl}). Your session was archived.`,
    };
  }
  return {
    title: `${prRef} closed — "${args.sessionTitle}" archived`,
    message: `${prRef} was closed on GitHub without merging (${args.prUrl}). Your session was archived.`,
  };
}

/** Inbox-only notice to the session owner. Never emails (see DIGEST_EXCLUDED_TYPES). */
async function notifySessionOwnerOfPrArchive(
  ctx: MutationCtx,
  session: Doc<"sessions">,
  nextState: "merged" | "closed",
  prUrl: string,
  prNumber: number | undefined,
): Promise<void> {
  const ownerUserId = session.createdBy ?? session.userId;
  const copy = sessionPrArchiveNotificationCopy({
    sessionTitle: session.title,
    prUrl,
    prNumber,
    merged: nextState === "merged",
  });
  await createNotification(ctx, {
    userId: ownerUserId,
    type: "session_archived",
    title: copy.title,
    message: copy.message,
    repoId: session.repoId,
    sessionId: session._id,
  });
}

/** Syncs a project's phase from GitHub draft/ready PR webhook events. */
export const handleProjectPrEvent = internalMutation({
  args: {
    prUrl: v.string(),
    action: v.string(),
    draft: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const nextPhase = deriveProjectPhaseFromPrEvent(args.action, args.draft);
    if (!nextPhase) return null;

    const project = await ctx.db
      .query("projects")
      .withIndex("by_pr_url", (q) => q.eq("prUrl", args.prUrl))
      .first();
    if (!project || !isProjectReviewPhase(project.phase)) return null;
    if (project.phase === nextPhase) return null;

    await ctx.db.patch(project._id, { phase: nextPhase });
    return null;
  },
});

/** Syncs a session's prState from a GitHub pull_request webhook event. */
export const handleSessionPrEvent = internalMutation({
  args: {
    prUrl: v.string(),
    action: v.string(),
    draft: v.optional(v.boolean()),
    merged: v.optional(v.boolean()),
    prNumber: v.optional(v.number()),
    mergeCommitSha: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const nextState = deriveSessionPrState(
      args.action,
      args.draft,
      args.merged,
    );
    if (!nextState) return null;

    const session = await ctx.db
      .query("sessions")
      .withIndex("by_pr_url", (q) => q.eq("prUrl", args.prUrl))
      .first();
    if (!session) return null;

    const isTerminal = nextState === "merged" || nextState === "closed";
    const needsArchive = isTerminal && session.archived !== true;
    const needsUnarchive = !isTerminal && session.archived === true;

    // Already in sync (including archived flag for terminal PRs).
    if (session.prState === nextState && !needsArchive && !needsUnarchive) {
      return null;
    }

    await ctx.db.patch(session._id, {
      prState: nextState,
      ...(isTerminal
        ? { archived: true }
        : { archived: false, prStateOnArchive: undefined }),
      updatedAt: Date.now(),
    });

    // Merged/closed sessions are read-only — stop any live sandbox so VMs
    // aren't left running forever after the PR terminal event.
    if (
      isTerminal &&
      (session.status === "active" ||
        session.status === "starting" ||
        session.status === "stopping" ||
        session.sandboxId !== undefined)
    ) {
      await requestSessionSandboxStop(ctx, session._id);
    }

    if (needsArchive) {
      await scheduleSessionSandboxGraceDelete(ctx, {
        ...session,
        archived: true,
        prState: nextState,
      });
      if (nextState === "merged" || nextState === "closed") {
        await notifySessionOwnerOfPrArchive(
          ctx,
          session,
          nextState,
          args.prUrl,
          args.prNumber,
        );
      }
    } else if (needsUnarchive) {
      await cancelSessionSandboxGraceDelete(ctx, session._id);
    }

    // A "merged" event can be a false positive: GitHub marks this session's PR
    // merged whenever its commit SHAs land on the base branch via ANY PR (a
    // "tip-copy" — e.g. a duplicate PR created from the same branch tip).
    // Schedule a delayed check that confirms the merge commit is actually
    // associated with this PR number, and detaches/reopens the session if not.
    if (
      nextState === "merged" &&
      args.prNumber !== undefined &&
      args.mergeCommitSha !== undefined
    ) {
      await ctx.scheduler.runAfter(
        15_000,
        internal.github.verifySessionPrMerged,
        {
          sessionId: session._id,
          prUrl: args.prUrl,
          prNumber: args.prNumber,
          mergeCommitSha: args.mergeCommitSha,
        },
      );
    }
    return null;
  },
});

/** Handles a PR closed webhook event, updating related tasks and projects based on merge status. */
export const handlePrClosed = internalMutation({
  args: {
    prUrl: v.string(),
    merged: v.boolean(),
    branchName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const eventId = await ctx.db.insert("githubWebhookEvents", {
      event: "pull_request",
      action: "closed",
      prUrl: args.prUrl,
      merged: args.merged,
      status: "pending",
      createdAt: Date.now(),
    });

    let run = await ctx.db
      .query("agentRuns")
      .withIndex("by_pr_url", (q) => q.eq("prUrl", args.prUrl))
      .first();

    // Fallback: no run has this PR URL recorded (e.g. the URL was dropped
    // during PR creation if a downstream call like addLabels failed). Eva
    // branches are deterministically named — `eva/task-<taskId>` for quick
    // tasks and `eva/project-<projectId>[-vN]` for project tasks — so we can
    // recover the run by parsing the branch and heal the link for next time.
    if (!run && args.branchName) {
      run = await findRunByBranchName(ctx, args.branchName);
      if (run) {
        await ctx.db.patch(run._id, { prUrl: args.prUrl });
      }
    }

    if (!run) {
      await ctx.db.patch(eventId, { status: "skipped" });
      return null;
    }

    const task = await ctx.db.get(run.taskId);
    if (!task || task.status === "done" || task.status === "cancelled") {
      await ctx.db.patch(eventId, { status: "skipped" });
      return null;
    }

    const newStatus = args.merged ? "done" : "cancelled";
    const now = Date.now();

    const tasksToUpdate = task.projectId
      ? await ctx.db
          .query("agentTasks")
          .withIndex("by_project", (q) => q.eq("projectId", task.projectId))
          .collect()
      : [task];

    for (const t of tasksToUpdate) {
      if (t.status === "done" || t.status === "cancelled") continue;

      await ctx.db.patch(t._id, {
        status: newStatus,
        updatedAt: now,
      });

      if (t.scheduledFunctionId) {
        try {
          await ctx.scheduler.cancel(t.scheduledFunctionId);
        } catch {
          // may have already fired
        }
        await ctx.db.patch(t._id, {
          scheduledAt: undefined,
          scheduledFunctionId: undefined,
        });
      }

      const notificationTitle = args.merged
        ? `PR merged — "${t.title}" moved to done`
        : `PR closed — "${t.title}" moved to cancelled`;
      const notificationMessage = args.merged
        ? `GitHub merged ${args.prUrl}. Task moved to done.`
        : `GitHub closed ${args.prUrl} without merge. Task moved to cancelled.`;
      await notifySubscribers(ctx, {
        taskId: t._id,
        type: args.merged ? "task_complete" : "system",
        title: notificationTitle,
        message: notificationMessage,
        repoId: t.repoId,
        projectId: t.projectId,
      });

      // Record the PR event on the task's activity timeline so the merge/close
      // is visible there, not just as a notification. System-driven, so no actor.
      await logTaskActivity(
        ctx,
        t._id,
        undefined,
        "pr",
        undefined,
        args.merged ? "merged" : "closed",
      );

      // Quick tasks: a merged/closed PR makes the task read-only, so stop any
      // live preview sandbox now (mirrors handleSessionPrEvent) and then
      // grace-delete it. Project tasks share the project sandbox (deleted
      // immediately on merge below).
      if (t.projectId === undefined) {
        if (
          t.reviewTaskSandboxStatus === "active" ||
          t.reviewTaskSandboxStatus === "starting" ||
          t.reviewTaskSandboxStatus === "stopping" ||
          t.sandboxId !== undefined
        ) {
          await requestTaskSandboxStop(ctx, t._id);
        }
        if (t.sandboxId) {
          await scheduleTaskSandboxGraceDelete(ctx, {
            ...t,
            status: newStatus,
            updatedAt: now,
          });
        }
      }
    }

    if (task.projectId) {
      const project = await ctx.db.get(task.projectId);
      const newPhase = args.merged ? "completed" : "cancelled";
      if (args.merged && project) {
        const nextVersion = (project.branchVersion ?? 1) + 1;
        const deleteId = preferPersistedSandboxId({
          sandboxId: project.sandboxId,
        });
        if (deleteId) {
          await ctx.scheduler.runAfter(0, internal.sandbox.deleteSandbox, {
            sandboxId: deleteId,
            repoId: project.repoId,
          });
        }
        await ctx.db.patch(task.projectId, {
          phase: newPhase,
          sandboxId: undefined,

          lastSandboxActivity: undefined,
          branchVersion: nextVersion,
          branchName: buildProjectBranchName(task.projectId, nextVersion),
          prUrl: undefined,
        });
      } else {
        await ctx.db.patch(task.projectId, { phase: newPhase });
      }
    }

    await ctx.db.patch(eventId, {
      status: "completed",
      taskId: task._id,
    });

    return null;
  },
});

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
    const siblings = await ctx.db
      .query("githubRepos")
      .withIndex("by_owner_and_name", (q) =>
        q.eq("owner", args.owner).eq("name", args.name),
      )
      .collect();
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
