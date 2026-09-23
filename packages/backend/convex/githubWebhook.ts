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
import { shouldArchiveSession } from "./_sessions/prArchive";

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

/** One pull request Eva opened for a session — primary or a linked repo's. */
export type SessionArchiveTriggerPr = {
  url: string;
  prNumber?: number;
  merged: boolean;
};

/**
 * Inbox copy for a session auto-archived because every PR it opened (the
 * primary's, plus one per linked repo for a multi-repo session) is now merged
 * or closed. `prs` is exactly the set of PRs that made the archive rule pass,
 * so a single-repo session's copy is unchanged from before multi-repo PRs
 * existed.
 */
export function sessionPrArchiveNotificationCopy(args: {
  sessionTitle: string;
  prs: SessionArchiveTriggerPr[];
}): { title: string; message: string } {
  const refs = args.prs.map((pr) =>
    pr.prNumber !== undefined ? `PR #${pr.prNumber}` : pr.url,
  );
  const refsList = refs.join(", ");
  const urlsList = args.prs.map((pr) => pr.url).join(", ");

  if (args.prs.length === 1) {
    const pr = args.prs[0];
    return pr.merged
      ? {
          title: `${refsList} merged — "${args.sessionTitle}" archived`,
          message: `${refsList} was merged on GitHub (${pr.url}). Your session was archived.`,
        }
      : {
          title: `${refsList} closed — "${args.sessionTitle}" archived`,
          message: `${refsList} was closed on GitHub without merging (${pr.url}). Your session was archived.`,
        };
  }

  const allMerged = args.prs.every((pr) => pr.merged);
  const verb = allMerged ? "merged" : "closed";
  return {
    title: `${refsList} ${verb} — "${args.sessionTitle}" archived`,
    message: `Your session was archived because every pull request it opened is now closed: ${urlsList}.`,
  };
}

/** Inbox-only notice to the session owner. Never emails (see DIGEST_EXCLUDED_TYPES). */
async function notifySessionOwnerOfPrArchive(
  ctx: MutationCtx,
  session: Doc<"sessions">,
  prs: SessionArchiveTriggerPr[],
): Promise<void> {
  if (prs.length === 0) return;
  const ownerUserId = session.createdBy ?? session.userId;
  const copy = sessionPrArchiveNotificationCopy({
    sessionTitle: session.title,
    prs,
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

/**
 * Every PR (primary + linked) a session has opened, with its current state.
 * Called only once `shouldArchiveSession` has confirmed every one of them is
 * terminal, so this doubles as the exact set of PRs that triggered the
 * archive.
 */
async function collectSessionTerminalPrs(
  ctx: MutationCtx,
  session: Doc<"sessions">,
): Promise<SessionArchiveTriggerPr[]> {
  const prs: SessionArchiveTriggerPr[] = [];
  if (session.prUrl !== undefined && session.prState !== undefined) {
    const prNumber = extractPrNumberFromUrl(session.prUrl);
    prs.push({
      url: session.prUrl,
      ...(prNumber !== null ? { prNumber } : {}),
      merged: session.prState === "merged",
    });
  }
  const linkedRepos = await ctx.db
    .query("sessionRepos")
    .withIndex("by_session", (q) => q.eq("sessionId", session._id))
    .collect();
  for (const linked of linkedRepos) {
    if (linked.prUrl === undefined || linked.prState === undefined) continue;
    const prNumber = extractPrNumberFromUrl(linked.prUrl);
    prs.push({
      url: linked.prUrl,
      ...(prNumber !== null ? { prNumber } : {}),
      merged: linked.prState === "merged",
    });
  }
  return prs;
}

/**
 * Applies the archive/unarchive side effects (sandbox stop, grace-delete
 * scheduling, owner notification) once every PR's `prState` a session opened
 * (primary + linked) is up to date in the database. Shared by the primary-PR
 * and linked-PR webhook paths so a multi-repo session archives exactly once —
 * when EVERY PR it opened is merged or closed, per `shouldArchiveSession`.
 */
async function reconcileSessionArchiveState(
  ctx: MutationCtx,
  session: Doc<"sessions">,
): Promise<void> {
  const linkedRepos = await ctx.db
    .query("sessionRepos")
    .withIndex("by_session", (q) => q.eq("sessionId", session._id))
    .collect();
  const archive = shouldArchiveSession(
    session.prState,
    linkedRepos.map((repo) => repo.prState),
  );
  const needsArchive = archive && session.archived !== true;
  const needsUnarchive = !archive && session.archived === true;
  if (!needsArchive && !needsUnarchive) return;

  await ctx.db.patch(session._id, {
    archived: needsArchive,
    ...(needsUnarchive ? { prStateOnArchive: undefined } : {}),
    updatedAt: Date.now(),
  });

  if (needsArchive) {
    const archivedSession: Doc<"sessions"> = { ...session, archived: true };
    // Merged/closed sessions are read-only — stop any live sandbox so VMs
    // aren't left running forever after the last PR the session opened lands.
    if (
      session.status === "active" ||
      session.status === "starting" ||
      session.status === "stopping" ||
      session.sandboxId !== undefined
    ) {
      await requestSessionSandboxStop(ctx, session._id);
    }
    await scheduleSessionSandboxGraceDelete(ctx, archivedSession);
    const triggeringPrs = await collectSessionTerminalPrs(ctx, archivedSession);
    await notifySessionOwnerOfPrArchive(ctx, session, triggeringPrs);
  } else if (needsUnarchive) {
    await cancelSessionSandboxGraceDelete(ctx, session._id);
  }
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

/**
 * Syncs a session's prState from a GitHub pull_request webhook event. Every
 * PR webhook for any repo Eva knows about lands here (see `http.ts`), so this
 * first tries the primary session lookup and, when the PR belongs to a linked
 * repo instead, falls back to a `sessionRepos` lookup by the same PR URL.
 * Either path re-checks the full multi-repo archive rule
 * (`reconcileSessionArchiveState`) once its own `prState` is updated —
 * reopening any PR (primary or linked) cancels a pending grace-delete the
 * same way it always has.
 */
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

    if (session) {
      const previousState = session.prState;
      if (previousState !== nextState) {
        await ctx.db.patch(session._id, {
          prState: nextState,
          updatedAt: Date.now(),
        });
      }
      await reconcileSessionArchiveState(ctx, {
        ...session,
        prState: nextState,
      });

      // A "merged" event can be a false positive: GitHub marks this session's
      // PR merged whenever its commit SHAs land on the base branch via ANY PR
      // (a "tip-copy" — e.g. a duplicate PR created from the same branch
      // tip). Schedule a delayed check that confirms the merge commit is
      // actually associated with this PR number, and detaches/reopens the
      // session if not. Only on the transition into merged, so a duplicate
      // webhook for an already-merged PR does not re-schedule the check.
      if (
        nextState === "merged" &&
        previousState !== "merged" &&
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
    }

    // Not the primary PR of any session — it may be a linked repo's PR
    // (multi-repo sessions open one PR per `sessionRepos` row).
    const linkedRepo = await ctx.db
      .query("sessionRepos")
      .withIndex("by_pr_url", (q) => q.eq("prUrl", args.prUrl))
      .first();
    if (!linkedRepo) return null;

    if (linkedRepo.prState !== nextState) {
      await ctx.db.patch(linkedRepo._id, { prState: nextState });
    }
    const parentSession = await ctx.db.get(linkedRepo.sessionId);
    if (!parentSession) return null;
    await reconcileSessionArchiveState(ctx, parentSession);
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
    if (!task) {
      await ctx.db.patch(eventId, { status: "skipped" });
      return null;
    }

    // Project PRs still have to move the project's phase even when the task
    // that opened them is already terminal, so only quick tasks bail early.
    const isProjectPr = task.projectId !== undefined;
    if (
      !isProjectPr &&
      (task.status === "done" || task.status === "cancelled")
    ) {
      await ctx.db.patch(eventId, { status: "skipped" });
      return null;
    }

    const newStatus = args.merged ? "done" : "cancelled";
    const now = Date.now();

    // Closing a project PR without merging cancels the project only — its tasks
    // keep the status they had so the work stays resumable. A merge still rolls
    // every task in the project to done.
    const tasksToUpdate = task.projectId
      ? args.merged
        ? await ctx.db
            .query("agentTasks")
            .withIndex("by_project", (q) => q.eq("projectId", task.projectId))
            .collect()
        : []
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

      // No task changed status on an unmerged close, so record the PR event on
      // the task that opened the PR — otherwise the close leaves no trace.
      if (!args.merged) {
        await notifySubscribers(ctx, {
          taskId: task._id,
          type: "system",
          title: `PR closed — "${project?.title ?? "project"}" moved to cancelled`,
          message: `GitHub closed ${args.prUrl} without merge. The project moved to cancelled; its tasks kept their status.`,
          repoId: task.repoId,
          projectId: task.projectId,
        });
        await logTaskActivity(
          ctx,
          task._id,
          undefined,
          "pr",
          undefined,
          "closed",
        );
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
