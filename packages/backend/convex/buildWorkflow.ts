import { v } from "convex/values";
import { startTaskRun } from "./_taskWorkflow/startRun";
import { finishTaskRun, taskRunWorkflowId } from "./_agentTasks/runState";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { closeOpenTurn } from "./_chat/turnStore";
import { internal } from "./_generated/api";
import { workflow, cancelTrackedWorkflow } from "./workflowManager";
import {
  authMutation,
  getActiveTaskRun,
  hasRepoAccess,
  recomputeProjectPhase,
} from "./functions";
import { buildTaskDoneEvent } from "./taskWorkflow";
import { trackProjectBuildWorkflow } from "./workflowWatchdog";
import { resolveProjectBranchName } from "./_git/branchNames";
import { resolveProjectBaseBranch } from "./_taskWorkflow/resolveBaseBranch";
import {
  cancelProjectBuildSchedule,
  finishProjectBuild,
  fireProjectBuildSchedule,
  isProjectBuilding,
  projectBuildWorkflowId,
  projectScheduledBuildAt,
  scheduleProjectBuild,
} from "./_projects/buildState";
import {
  ensureOwnedSession,
  ownedSessionBusy,
  syncProjectSession,
  projectSessionOwner,
} from "./_sessions/ownedSession";

/** Why a build did not start: the project chat holds the sandbox. */
const PROJECT_CHAT_BUSY_ERROR =
  "Eva is still replying in this project's chat, or its sandbox is starting or stopping. Start the build again in a moment.";

/** How long a scheduled build waits for a busy project chat before trying again. */
const CHAT_BUSY_RETRY_MS = 60_000;
/** How long a scheduled build keeps waiting for a busy session before it gives up. */
const CHAT_BUSY_GIVE_UP_MS = 30 * 60_000;

/**
 * Creates the project's session (or reads it) before the build holds it, so
 * a project from before sessions hands its own VM over now: once the build
 * runs, the adoption waits for it (`ownerBusyReason`) and every task would
 * boot a second VM.
 */
async function claimProjectSessionForBuild(
  ctx: MutationCtx,
  project: Doc<"projects">,
): Promise<void> {
  await ensureOwnedSession(ctx, { kind: "project", project });
}

// --- Workflow ---

/** Orchestrates sequential execution of all todo tasks in a project build. */
export const buildProjectWorkflow = workflow.define({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
    installationId: v.number(),
  },
  handler: async (step, args): Promise<void> => {
    // Step 1: Fetch all "todo" tasks for the project, sorted by taskNumber
    const tasks = await step.runQuery(internal.buildWorkflow.getProjectTasks, {
      projectId: args.projectId,
    });

    if (tasks.length === 0) {
      await step.runMutation(internal.buildWorkflow.completeBuild, {
        projectId: args.projectId,
      });
      return;
    }

    // Step 2: Execute tasks sequentially
    let failedTaskId: string | undefined;
    for (const task of tasks) {
      await step.runMutation(internal.buildWorkflow.startTaskForBuild, {
        taskId: task._id,
        projectId: args.projectId,
        userId: args.userId,
        installationId: args.installationId,
      });

      let result = await step.awaitEvent(buildTaskDoneEvent);
      while (result.taskId !== task._id) {
        result = await step.awaitEvent(buildTaskDoneEvent);
      }

      if (!result.success) {
        failedTaskId = task._id;
        break;
      }
    }

    // Step 3: Finalize the build
    await step.runMutation(internal.buildWorkflow.completeBuild, {
      projectId: args.projectId,
      failedTaskId,
    });
  },
});

// --- Internal functions ---

/** Returns all todo tasks for a project, sorted by task number ascending. */
export const getProjectTasks = internalQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      _id: v.id("agentTasks"),
      taskNumber: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("agentTasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    return tasks
      .filter((t) => t.status === "todo")
      .sort((a, b) => (a.taskNumber ?? 0) - (b.taskNumber ?? 0))
      .map((t) => ({ _id: t._id, taskNumber: t.taskNumber }));
  },
});

/**
 * Starts a single task execution within a project build.
 * Combines the logic of agentTasks.startExecution + taskWorkflow.triggerExecution
 * without auth checks (called internally from the build workflow).
 */
export const startTaskForBuild = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    projectId: v.id("projects"),
    userId: v.id("users"),
    installationId: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    if (!task.repoId) throw new Error("Task has no associated repository");

    const repo = await ctx.db.get(task.repoId);
    if (!repo) throw new Error("Repository not found");

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    // Check for active runs on this task
    const existingRuns = await ctx.db
      .query("agentRuns")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    const activeRun = existingRuns.find(
      (r) => r.status === "queued" || r.status === "running",
    );
    if (activeRun) throw new Error("Task already has an active execution");

    // Compute isFirstTaskOnBranch — check if any task in the project had a successful run
    const projectTasks = await ctx.db
      .query("agentTasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    let hasSuccessfulRun = false;
    for (const pt of projectTasks) {
      const runs = await ctx.db
        .query("agentRuns")
        .withIndex("by_task", (q) => q.eq("taskId", pt._id))
        .collect();
      if (runs.some((r) => r.status === "success")) {
        hasSuccessfulRun = true;
        break;
      }
    }
    const isFirstTaskOnBranch = !hasSuccessfulRun;

    // When this build picks up a task a reviewer sent back via "Make
    // changes", link the parked change-request comment so the timeline labels
    // this run "made changes" rather than a bare "success".
    await startTaskRun(ctx, {
      task,
      repo,
      userId: args.userId,
      baseBranch: resolveProjectBaseBranch(project, repo),
      isFirstTaskOnBranch,
      branchName: resolveProjectBranchName(args.projectId, project),
      projectId: args.projectId,
      triggeringCommentId: task.pendingChangeRequestCommentId,
      clearPendingChangeRequest: true,
      rollbackStatus: "todo",
      heldByBuild: true,
    });

    return null;
  },
});

/** Marks a project build as complete, optionally recording which task failed. */
export const completeBuild = internalMutation({
  args: {
    projectId: v.id("projects"),
    failedTaskId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await finishProjectBuild(ctx, args.projectId, undefined);
    await ctx.db.patch(args.projectId, {
      lastBuildError: args.failedTaskId
        ? `Build stopped: task ${args.failedTaskId} failed`
        : undefined,
    });
    await recomputeProjectPhase(ctx, args.projectId);
    return null;
  },
});

// --- Public mutations ---

/**
 * Frontend trigger — starts the project build workflow.
 * Called from the "Start cooking" button in ProjectDetailClient.
 */
export const startBuild = authMutation({
  args: {
    projectId: v.id("projects"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || !(await hasRepoAccess(ctx.db, project.repoId, ctx.userId)))
      throw new Error("Project not found");

    if (isProjectBuilding(project)) {
      throw new Error("Project already has an active build");
    }
    // One agent per sandbox: a build waits for the project chat's reply.
    if (await ownedSessionBusy(ctx.db, projectSessionOwner(project._id))) {
      throw new Error(PROJECT_CHAT_BUSY_ERROR);
    }

    const repo = await ctx.db.get(project.repoId);
    if (!repo) throw new Error("Repository not found");

    await claimProjectSessionForBuild(ctx, project);
    const workflowId = await workflow.start(
      ctx,
      internal.buildWorkflow.buildProjectWorkflow,
      {
        projectId: args.projectId,
        userId: ctx.userId,
        installationId: repo.installationId,
      },
    );

    await trackProjectBuildWorkflow(ctx, args.projectId, workflowId, {
      clearLastBuildError: true,
    });

    return null;
  },
});

// --- Scheduled Build ---

/**
 * Called by the Convex scheduler at the scheduled time.
 * Kicks off the build workflow if the project is still eligible.
 */
export const executeScheduledBuild = internalMutation({
  args: {
    projectId: v.id("projects"),
    scheduledAt: v.optional(v.number()),
    /** Set on a busy-session retry: when the build was first due. */
    firstScheduledAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;

    // Consume the due schedule before eligibility checks. Behind a running
    // build it is dropped and no build starts.
    const fired = await fireProjectBuildSchedule(
      ctx,
      args.projectId,
      args.scheduledAt,
    );
    if (!fired.ok || fired.next !== undefined) return null;
    // The project's session is busy (chat reply, run, interview, start or
    // stop): try again shortly instead of dropping the schedule (`startBuild`
    // refuses a busy session). After `CHAT_BUSY_GIVE_UP_MS` the schedule gives up and
    // says why on the project.
    if (await ownedSessionBusy(ctx.db, projectSessionOwner(project._id))) {
      const now = Date.now();
      const firstDue = args.firstScheduledAt ?? args.scheduledAt ?? now;
      if (now - firstDue >= CHAT_BUSY_GIVE_UP_MS) {
        await ctx.db.patch(args.projectId, {
          lastBuildError:
            `Scheduled build skipped: the project's sandbox stayed busy for ${CHAT_BUSY_GIVE_UP_MS / 60_000} minutes.`,
        });
        return null;
      }
      await scheduleProjectBuild(
        ctx,
        args.projectId,
        "scheduleRetry",
        now + CHAT_BUSY_RETRY_MS,
        firstDue,
      );
      return null;
    }

    const repo = await ctx.db.get(project.repoId);
    if (!repo) return null;

    await claimProjectSessionForBuild(ctx, project);
    const workflowId = await workflow.start(
      ctx,
      internal.buildWorkflow.buildProjectWorkflow,
      {
        projectId: args.projectId,
        userId: project.userId,
        installationId: repo.installationId,
      },
    );

    await trackProjectBuildWorkflow(ctx, args.projectId, workflowId);

    return null;
  },
});

/** Schedules a project build to run at a future timestamp. */
export const scheduleBuild = authMutation({
  args: {
    projectId: v.id("projects"),
    scheduledAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || !(await hasRepoAccess(ctx.db, project.repoId, ctx.userId)))
      throw new Error("Project not found");
    if (isProjectBuilding(project))
      throw new Error("Project already has an active build");
    if (projectScheduledBuildAt(project) !== undefined)
      throw new Error("Project already has a scheduled build");
    if (args.scheduledAt <= Date.now())
      throw new Error("Scheduled time must be in the future");

    await scheduleProjectBuild(
      ctx,
      args.projectId,
      "schedule",
      args.scheduledAt,
    );
    return null;
  },
});

/** Cancels a previously scheduled build for a project. */
export const cancelScheduledBuild = authMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || !(await hasRepoAccess(ctx.db, project.repoId, ctx.userId)))
      throw new Error("Project not found");
    const cancelled = await cancelProjectBuildSchedule(ctx, args.projectId);
    if (!cancelled.ok) throw new Error(cancelled.reason);
    return null;
  },
});

/**
 * Stops a running build: its workflow, every in-progress task's run (back to
 * todo), then the build state, with `reason` as the build error.
 */
async function cancelRunningBuild(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  buildWorkflowId: string,
  reason: string,
): Promise<void> {
  await cancelTrackedWorkflow(ctx, buildWorkflowId);

  const tasks = await ctx.db
    .query("agentTasks")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();

  for (const task of tasks) {
    if (task.status !== "in_progress") continue;

    await cancelTrackedWorkflow(ctx, taskRunWorkflowId(task));

    const run = await getActiveTaskRun(ctx.db, task._id);

    if (run) {
      await ctx.db.patch(run._id, {
        status: "error",
        error: reason,
        finishedAt: Date.now(),
      });
    }

    await ctx.db.patch(task._id, {
      status: "todo",
      updatedAt: Date.now(),
    });
    await finishTaskRun(ctx, task._id, undefined);
  }

  await finishProjectBuild(ctx, projectId, buildWorkflowId);
  await ctx.db.patch(projectId, { lastBuildError: reason });
  await recomputeProjectPhase(ctx, projectId);
}

/** Cancels an active build, stopping all in-progress tasks and their workflows. */
export const cancelBuild = authMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || !(await hasRepoAccess(ctx.db, project.repoId, ctx.userId)))
      throw new Error("Project not found");

    const buildWorkflowId = projectBuildWorkflowId(project);
    if (buildWorkflowId === undefined) {
      throw new Error("No active build to cancel");
    }

    await cancelRunningBuild(
      ctx,
      args.projectId,
      buildWorkflowId,
      "Build cancelled by user",
    );
    return null;
  },
});

/**
 * The project left the board (completed, cancelled, deleted) while its own
 * work still holds the session (`projectHoldsSession`): stop the build and
 * the interview / spec workflow first, then retire the session
 * (`syncProjectSession`), so nothing keeps running on a VM being stopped.
 */
export const releaseProjectSessionForRetire = internalMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    const buildWorkflowId = projectBuildWorkflowId(project);
    if (buildWorkflowId !== undefined) {
      await cancelRunningBuild(
        ctx,
        args.projectId,
        buildWorkflowId,
        "Build stopped: the project was closed",
      );
    }
    if (project.activeWorkflowId !== undefined) {
      await cancelTrackedWorkflow(ctx, project.activeWorkflowId);
      await closeOpenTurn(ctx, args.projectId, "cancelled", {
        lane: "interview",
      });
      await ctx.db.patch(args.projectId, { activeWorkflowId: undefined });
    }
    await syncProjectSession(ctx, args.projectId);
    return null;
  },
});

/** Reschedules a project build; the new schedule replaces (and cancels) the pending one. */
export const updateScheduledBuild = authMutation({
  args: {
    projectId: v.id("projects"),
    scheduledAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || !(await hasRepoAccess(ctx.db, project.repoId, ctx.userId)))
      throw new Error("Project not found");
    if (args.scheduledAt <= Date.now())
      throw new Error("Scheduled time must be in the future");

    await scheduleProjectBuild(
      ctx,
      args.projectId,
      "schedule",
      args.scheduledAt,
    );
    return null;
  },
});
