import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { createNotification } from "../notifications";
import { assertPrUrlForRepo } from "../_github/prUrl";
import { runModeValidator } from "../validators";
import type { Id } from "../_generated/dataModel";
import {
  hasActiveRun,
  isSupersededTaskRun,
  recomputeProjectPhase,
} from "../functions";
import { RUN_TIMEOUT_MS } from "../workflowWatchdog";
import { buildWorkflowRunNotificationMessage } from "./prompts";
import { buildTaskDoneEvent } from "./events";
import {
  STALE_CHECK_DELAY_MS,
  isUsageLimitError,
  parseUsageLimitResetTime,
} from "./recovery";
import {
  clearStreamingActivity,
  getTaskRunStreamingEntityId,
  upsertStreamingActivity,
  upsertActivityLog,
  finalizeRunStatus,
  sendCompletionEvent,
} from "./helpers";

/** Transitions a queued run to running, sets streaming activity, and schedules watchdog timers. */
export const updateRunToRunning = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    taskId: v.id("agentTasks"),
    repoId: v.id("githubRepos"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const startedAt = Date.now();

    await ctx.db.patch(args.runId, {
      status: "running",
      repoId: args.repoId,
      startedAt,
      finalizingAt: undefined,
    });
    await ctx.db.patch(args.taskId, {
      status: "in_progress",
      updatedAt: startedAt,
    });
    await upsertStreamingActivity(
      ctx,
      getTaskRunStreamingEntityId(args.runId),
      JSON.stringify([
        {
          type: "thinking",
          label: "Starting sandbox...",
          status: "active",
        },
      ]),
    );

    await ctx.scheduler.runAfter(
      RUN_TIMEOUT_MS,
      internal.taskWorkflow.handleStaleRun,
      {
        taskId: args.taskId,
        runId: args.runId,
      },
    );

    await ctx.scheduler.runAfter(
      STALE_CHECK_DELAY_MS,
      internal.taskWorkflow.checkStaleRuns,
      {
        runId: args.runId,
        taskId: args.taskId,
      },
    );

    return null;
  },
});

/** Appends a log entry to a run — used by the watchdog diagnostics capture. */
export const appendRunLog = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    await ctx.db.patch(args.runId, {
      logs: [
        ...run.logs,
        {
          timestamp: Date.now(),
          level: "info" as const,
          message: args.message,
        },
      ],
    });
    return null;
  },
});

/** Records a PR URL on a specific run — used by the manual Create PR action
 * when the workflow's auto PR step failed and the user retried later. */
export const setRunPrUrl = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    prUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    const task = await ctx.db.get(run.taskId);
    if (!task?.repoId) return null;
    const prUrl = await assertPrUrlForRepo(ctx.db, task.repoId, args.prUrl);
    await ctx.db.patch(args.runId, {
      prUrl,
      prError: undefined,
    });
    return null;
  },
});

/** Persists the sandbox ID on a run record after sandbox creation. */
export const saveSandboxId = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    sandboxId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run) {
      await ctx.db.patch(args.runId, {
        sandboxId: args.sandboxId,
      });
    }
    return null;
  },
});

/** Queues deployment status polling for a run after a successful push. */
export const scheduleDeploymentTracking = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    repoId: v.id("githubRepos"),
    branchName: v.string(),
    deploymentProjectName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, { deploymentStatus: "queued" });
    await ctx.scheduler.runAfter(
      30_000,
      internal.taskWorkflowActions.pollDeploymentStatus,
      {
        runId: args.runId,
        installationId: args.installationId,
        repoOwner: args.repoOwner,
        repoName: args.repoName,
        repoId: args.repoId,
        branchName: args.branchName,
        deploymentProjectName: args.deploymentProjectName,
        attempt: 0,
      },
    );
    return null;
  },
});

/** Updates a project with the active sandbox ID and last activity timestamp. */
export const updateProjectSandbox = internalMutation({
  args: {
    projectId: v.id("projects"),
    sandboxId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      sandboxId: args.sandboxId,
      lastSandboxActivity: Date.now(),
    });
    return null;
  },
});

/** Persists the canonical sandbox ID on a quick task so subsequent runs
 * (change-requests, resolve_conflicts) and reviewer Start Sandbox can reuse
 * the same paused filesystem. Project tasks use `updateProjectSandbox` instead. */
export const saveTaskSandboxId = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    sandboxId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    await ctx.db.patch(args.taskId, {
      sandboxId: args.sandboxId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Marks a quick task's sandbox as stopped (e.g. after agent run completion).
 * Keeps `sandboxId` so the reviewer can resume the same paused filesystem. */
export const markTaskSandboxStopped = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    await ctx.db.patch(args.taskId, {
      reviewTaskSandboxStatus: "closed",
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Clears the sandbox association on a quick task — used when the sandbox is
 * deleted (e.g. PR-merge cleanup) so the resume button doesn't point at a
 * dead sandbox. */
export const clearTaskSandbox = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    await ctx.db.patch(args.taskId, {
      sandboxId: undefined,

      reviewTaskSandboxStatus: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Finalizes the run status after streaming completes and cleans up streaming activity. */
export const finalizeRunStreamingPhase = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    taskId: v.id("agentTasks"),
    projectId: v.optional(v.id("projects")),
    success: v.boolean(),
    error: v.union(v.string(), v.null()),
    prError: v.union(v.string(), v.null()),
    prUrl: v.union(v.string(), v.null()),
    activityLog: v.union(v.string(), v.null()),
    exitReason: v.optional(v.string()),
    claudeResult: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await finalizeRunStatus(ctx, {
      runId: args.runId,
      projectId: args.projectId,
      success: args.success,
      error: args.error,
      prError: args.prError,
      prUrl: args.prUrl,
      exitReason: args.exitReason,
      claudeResult: args.claudeResult,
    });
    if (args.activityLog) {
      await upsertActivityLog(ctx, args.runId, args.activityLog);
    }
    await clearStreamingActivity(ctx, getTaskRunStreamingEntityId(args.runId));
    await clearStreamingActivity(ctx, String(args.taskId));
    return null;
  },
});

/** Completes a run: finalizes status, updates task, sends notifications, and signals build workflow. */
export const completeRun = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    taskId: v.id("agentTasks"),
    projectId: v.optional(v.id("projects")),
    success: v.boolean(),
    error: v.union(v.string(), v.null()),
    prError: v.union(v.string(), v.null()),
    prUrl: v.union(v.string(), v.null()),
    activityLog: v.union(v.string(), v.null()),
    exitReason: v.optional(v.string()),
    mode: v.optional(runModeValidator),
    claudeResult: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();

    await finalizeRunStatus(ctx, {
      runId: args.runId,
      projectId: args.projectId,
      success: args.success,
      error: args.error,
      prError: args.prError,
      prUrl: args.prUrl,
      exitReason: args.exitReason,
      claudeResult: args.claudeResult,
    });

    if (args.activityLog) {
      await upsertActivityLog(ctx, args.runId, args.activityLog);
    }

    const task = await ctx.db.get(args.taskId);
    const staleCompletion =
      (await hasActiveRun(ctx.db, args.taskId)) ||
      (await isSupersededTaskRun(ctx.db, args.taskId, args.runId));
    if (task && !staleCompletion) {
      await ctx.db.patch(args.taskId, {
        status: args.success ? "business_review" : "todo",
        updatedAt: now,
      });
      if (task.projectId) {
        await recomputeProjectPhase(ctx, task.projectId);
      }
    }

    const project = args.projectId ? await ctx.db.get(args.projectId) : null;

    if (project) {
      const projectPatch: { lastSandboxActivity: number; prUrl?: string } = {
        lastSandboxActivity: now,
      };
      if (args.prUrl) {
        projectPatch.prUrl = args.prUrl;
      }
      await ctx.db.patch(project._id, projectPatch);
    }

    await clearStreamingActivity(ctx, getTaskRunStreamingEntityId(args.runId));
    await clearStreamingActivity(ctx, String(args.taskId));

    if (task) {
      const scopeLabel = task.projectId ? "Task" : "Quick task";
      const statusText = args.success ? "completed" : "failed";
      const notifyUsers = new Set(
        [task.createdBy, task.assignedTo].filter(
          (id): id is Id<"users"> => id !== undefined,
        ),
      );
      for (const userId of notifyUsers) {
        await createNotification(ctx, {
          userId,
          type: args.success ? "run_completed" : "run_failed",
          title: `${scopeLabel} ${statusText}: ${task.title}`,
          repoId: task.repoId,
          projectId: task.projectId,
          taskId: args.taskId,
          message: buildWorkflowRunNotificationMessage({
            success: args.success,
            projectId: task.projectId,
            error: args.error,
            prUrl: args.prUrl,
          }),
        });
      }
    }

    // Auto-schedule retry on usage-limit errors
    if (!args.success && args.error && isUsageLimitError(args.error)) {
      const resetAt = parseUsageLimitResetTime(args.error);
      if (resetAt && resetAt > Date.now()) {
        if (task?.projectId) {
          // Project task: schedule the build to retry at the reset time
          const proj = await ctx.db.get(task.projectId);
          if (proj && !proj.scheduledBuildFunctionId) {
            const functionId = await ctx.scheduler.runAt(
              resetAt,
              internal.buildWorkflow.executeScheduledBuild,
              { projectId: task.projectId, scheduledAt: resetAt },
            );
            await ctx.db.patch(task.projectId, {
              scheduledBuildAt: resetAt,
              scheduledBuildFunctionId: functionId,
            });
          }
        } else if (task && !task.scheduledFunctionId) {
          // Quick task: schedule the task to retry at the reset time
          const functionId = await ctx.scheduler.runAt(
            resetAt,
            internal.taskWorkflow.executeScheduledTask,
            { taskId: args.taskId, scheduledAt: resetAt },
          );
          await ctx.db.patch(args.taskId, {
            scheduledAt: resetAt,
            scheduledFunctionId: functionId,
            updatedAt: Date.now(),
          });
          await ctx.db.patch(args.runId, {
            exitReason: "auto_retry_scheduled",
          });
        }
      }
    }

    if (project?.activeBuildWorkflowId && !staleCompletion) {
      await sendCompletionEvent(
        ctx,
        buildTaskDoneEvent,
        project.activeBuildWorkflowId,
        {
          taskId: args.taskId,
          success: args.success,
        },
      );
    }

    return null;
  },
});
