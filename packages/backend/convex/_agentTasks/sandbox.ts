import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  internalAction,
  internalMutation,
  type MutationCtx,
} from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { STUCK_STOPPING_RECOVER_MS } from "../_sandbox/stopRecovery";
import { authMutation, hasRepoAccess, hasTaskAccess } from "../functions";
import { workflow } from "../workflowManager";
import { resolveTaskWorkflowBaseBranchForTask } from "../_taskWorkflow/resolveBaseBranch";
import {
  seedSandboxStartupActivity,
  clearSandboxStartupActivity,
} from "../_sandbox/startupActivity";
import { clearPendingQuestionsForEntity } from "../pendingQuestions";

const PREVIEW_ALLOWED_STATUSES = [
  "code_review",
  "business_review",
  "done",
] as const;

function assertPreviewSandboxAllowed(task: {
  status: string;
  sandboxId?: string;
}): void {
  if (task.sandboxId) {
    return;
  }
  if (!PREVIEW_ALLOWED_STATUSES.some((status) => status === task.status)) {
    throw new Error(
      `Task must be in code_review, business_review or done status to start sandbox. Current status: ${task.status}`,
    );
  }
}

/** Starts a preview sandbox for a task, checking out the task branch and running startup commands. */
export const startTaskSandbox = authMutation({
  args: {
    taskId: v.id("agentTasks"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    if (!task.repoId) throw new Error("Task has no associated repository");

    assertPreviewSandboxAllowed(task);

    const repo = await ctx.db.get(task.repoId);
    if (!repo) throw new Error("Repository not found");

    const hasAccess = await hasRepoAccess(ctx.db, repo._id, ctx.userId);
    if (!hasAccess) throw new Error("No access to repository");

    const branchName = `eva/task-${args.taskId}`;
    const baseBranch = await resolveTaskWorkflowBaseBranchForTask(
      ctx.db,
      task,
      repo,
    );

    await ctx.db.patch(args.taskId, {
      reviewTaskSandboxStatus: "starting",
      updatedAt: Date.now(),
    });
    // Seed startup streaming immediately so the UI shows a real step instead of
    // the random "Eva is inferring…" spinner while the workflow schedules.
    await seedSandboxStartupActivity(
      ctx.db,
      `task-sandbox-startup-${args.taskId}`,
    );
    const reusableSandboxId = task.sandboxId;
    console.log(
      `[tasks] startTaskSandbox taskId=${args.taskId} existingSandboxId=${task.sandboxId ?? "none"} sandboxId=${reusableSandboxId ?? "none"}`,
    );

    const startArgs = {
      taskId: args.taskId,
      existingSandboxId: task.sandboxId,
      installationId: repo.installationId,
      repoOwner: repo.owner,
      repoName: repo.name,
      branchName,
      baseBranch,
      repoId: task.repoId,
    };
    // Vercel: schedule start action directly (skip ~6s workflow scheduling).
    if (reusableSandboxId) {
      await ctx.scheduler.runAfter(
        0,
        internal.sandbox.startTaskPreviewSandbox,
        startArgs,
      );
    } else {
      await workflow.start(
        ctx,
        internal.taskSandboxWorkflow.taskPreviewSandboxStartupWorkflow,
        startArgs,
      );
    }

    return null;
  },
});

/**
 * Re-runs startup commands for a task's preview sandbox by kicking off the
 * regular sandbox startup workflow with `forceStartupCommands: true`. Used to
 * recover when seed/import failed. Normal Start only relaunches background
 * daemons; this is the explicit path that re-runs startupCommands.
 *
 * Auto-starts the sandbox if it isn't running yet — same workflow path either
 * way, just with the force flag set so commands always re-execute.
 */
export const retryStartupCommands = authMutation({
  args: {
    taskId: v.id("agentTasks"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    if (!task.repoId) throw new Error("Task has no associated repository");

    assertPreviewSandboxAllowed(task);

    if (
      task.reviewTaskSandboxStatus === "starting" ||
      task.reviewTaskSandboxStatus === "stopping"
    ) {
      throw new Error(
        "Sandbox is currently starting or stopping. Wait for it to settle before retrying.",
      );
    }

    const repo = await ctx.db.get(task.repoId);
    if (!repo) throw new Error("Repository not found");

    const hasAccess = await hasRepoAccess(ctx.db, repo._id, ctx.userId);
    if (!hasAccess) throw new Error("No access to repository");

    const branchName = `eva/task-${args.taskId}`;
    const baseBranch = await resolveTaskWorkflowBaseBranchForTask(
      ctx.db,
      task,
      repo,
    );

    await ctx.db.patch(args.taskId, {
      reviewTaskSandboxStatus: "starting",
      updatedAt: Date.now(),
    });

    await workflow.start(
      ctx,
      internal.taskSandboxWorkflow.taskPreviewSandboxStartupWorkflow,
      {
        taskId: args.taskId,
        existingSandboxId: task.sandboxId,
        installationId: repo.installationId,
        repoOwner: repo.owner,
        repoName: repo.name,
        branchName,
        baseBranch,
        repoId: task.repoId,
        forceStartupCommands: true,
      },
    );

    return null;
  },
});

/**
 * Re-runs the dev server in an active preview sandbox using the repo App
 * settings (same resolution as sandbox startup). For recovery when preview
 * is stuck loading but the sandbox itself is running.
 */
export const runDevServer = authMutation({
  args: {
    taskId: v.id("agentTasks"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    if (!task.repoId) throw new Error("Task has no associated repository");

    if (task.reviewTaskSandboxStatus !== "active" || !task.sandboxId) {
      throw new Error("Start the sandbox before running the dev server");
    }

    if (!PREVIEW_ALLOWED_STATUSES.some((status) => status === task.status)) {
      throw new Error(
        `Task must be in code_review, business_review or done status. Current status: ${task.status}`,
      );
    }

    const hasAccess = await hasTaskAccess(ctx.db, task, ctx.userId);
    if (!hasAccess) throw new Error("No access to repository");

    await ctx.scheduler.runAfter(
      0,
      internal.sandbox.runDevServerInTaskSandbox,
      {
        taskId: args.taskId,
        sandboxId: task.sandboxId,
        repoId: task.repoId,
      },
    );

    return null;
  },
});

/**
 * Re-launches the repo's configured background commands (long-running daemons
 * like `npx convex dev`) in an active preview sandbox. Background commands
 * already run automatically on every sandbox start/resume; this is for
 * respawning a daemon that died while the sandbox kept running.
 */
export const runBackgroundCommands = authMutation({
  args: {
    taskId: v.id("agentTasks"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    if (!task.repoId) throw new Error("Task has no associated repository");

    if (task.reviewTaskSandboxStatus !== "active" || !task.sandboxId) {
      throw new Error("Start the sandbox before running background commands");
    }

    const hasAccess = await hasTaskAccess(ctx.db, task, ctx.userId);
    if (!hasAccess) throw new Error("No access to repository");

    await ctx.scheduler.runAfter(0, internal.sandbox.runBackgroundCommands, {
      sandboxId: task.sandboxId,
      repoId: task.repoId,
    });

    return null;
  },
});

/** Persists resolved dev server settings after a manual dev-server rerun. */
export const patchTaskDevServer = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    devPort: v.number(),
    devCommand: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.taskId, {
      devPort: args.devPort,
      devCommand: args.devCommand,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Shared stop path for the user Stop button, the idle auto-stop sweep and the
 * PR-merge webhook. Marks the task `"stopping"` then schedules provider
 * teardown (mirrors requestSessionSandboxStop in _sessions/sandbox.ts).
 */
export async function requestTaskSandboxStop(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
): Promise<void> {
  const task = await ctx.db.get(taskId);
  if (!task || !task.repoId) return;

  if (!task.sandboxId) {
    // Nothing to stop — close immediately.
    await ctx.db.patch(taskId, {
      reviewTaskSandboxStatus: "closed",
      updatedAt: Date.now(),
    });
    return;
  }

  if (task.reviewTaskSandboxStatus === "stopping") {
    // Already stopping — but a previous finalize may have stalled (e.g. its
    // action was killed while a racing resume held the VM). Re-issue the
    // idempotent finalize so stopping again recovers a stuck `stopping` row
    // instead of being a no-op that leaves it wedged forever.
    await scheduleFinalizeStopTask(ctx, {
      taskId,
      sandboxId: task.sandboxId,
      repoId: task.repoId,
    });
    return;
  }

  await scheduleFinalizeStopTask(ctx, {
    taskId,
    sandboxId: task.sandboxId,
    repoId: task.repoId,
  });

  // Clear leftover start steps so stop does not re-show startup activity.
  await clearSandboxStartupActivity(ctx.db, `task-sandbox-startup-${taskId}`);

  // Stopping kills the paused turn, so any blocking AskUserQuestion can
  // never be claimed — clear it or it hides the composer forever.
  await clearPendingQuestionsForEntity(ctx.db, String(taskId));

  // Keep sandboxId so we can resume the stopped sandbox later.
  await ctx.db.patch(taskId, {
    reviewTaskSandboxStatus: "stopping",
    updatedAt: Date.now(),
  });
}

/**
 * Stops the preview sandbox. Keeps `sandboxId` so the reviewer
 * can resume the same paused filesystem (DB state intact) on next start.
 *
 * Marks the task as `"stopping"` synchronously so the UI can show a spinner
 * and disable the Start button until the sandbox stop completes.
 * Without the transient `"stopping"` state, a quick Start click during the
 * stop window would race with `getOrCreateSandbox` and silently spawn an
 * orphan sandbox.
 */
export const stopTaskSandbox = authMutation({
  args: { taskId: v.id("agentTasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    if (!task.repoId) throw new Error("Task has no associated repository");

    const hasAccess = await hasTaskAccess(ctx.db, task, ctx.userId);
    if (!hasAccess) throw new Error("No access to repository");

    await requestTaskSandboxStop(ctx, args.taskId);

    return null;
  },
});

/**
 * Schedules task sandbox teardown. Every path that flips a task to
 * `"stopping"` must go through here, or a transient on the finalize action
 * wedges the task with no recovery (mirrors _sessions/sandbox.ts).
 */
export async function scheduleFinalizeStopTask(
  ctx: MutationCtx,
  args: {
    taskId: Id<"agentTasks">;
    sandboxId: string;
    repoId: Id<"githubRepos">;
  },
): Promise<void> {
  await ctx.scheduler.runAfter(
    0,
    internal._agentTasks.sandbox.finalizeStopTaskSandbox,
    args,
  );
  await ctx.scheduler.runAfter(
    STUCK_STOPPING_RECOVER_MS,
    internal._agentTasks.sandbox.recoverStuckStopping,
    { taskId: args.taskId },
  );
}

/**
 * Re-issues finalizeStopTaskSandbox if the task is still `"stopping"`.
 * Scheduled after Stop so a platform transient on the first action doesn't
 * leave the UI wedged; no-ops if stop already finished.
 */
export const recoverStuckStopping = internalMutation({
  args: { taskId: v.id("agentTasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (
      !task ||
      task.reviewTaskSandboxStatus !== "stopping" ||
      !task.sandboxId ||
      !task.repoId
    ) {
      return null;
    }
    await ctx.scheduler.runAfter(
      0,
      internal._agentTasks.sandbox.finalizeStopTaskSandbox,
      {
        taskId: args.taskId,
        sandboxId: task.sandboxId,
        repoId: task.repoId,
      },
    );
    return null;
  },
});

/**
 * Awaits provider stop and finalizes task sandbox status. Only marks `"closed"`
 * after a successful stop — on failure reverts to `"active"` so the UI matches
 * a still-running Vercel VM.
 */
export const finalizeStopTaskSandbox = internalAction({
  args: {
    taskId: v.id("agentTasks"),
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    let stopError: string | undefined;
    try {
      await ctx.runAction(internal.sandbox.stopSandbox, {
        sandboxId: args.sandboxId,
        repoId: args.repoId,
      });
    } catch (err) {
      stopError = err instanceof Error ? err.message : String(err);
    }
    await ctx.runMutation(internal._agentTasks.sandbox.markTaskSandboxClosed, {
      taskId: args.taskId,
      error: stopError,
    });
    return null;
  },
});

/**
 * Internal: after stop settles, either close (success) or revert to active
 * (failure) so Eva never shows off while Vercel is still running.
 */
export const markTaskSandboxClosed = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    // Only flip if still stopping — don't overwrite a fresh start.
    if (task.reviewTaskSandboxStatus !== "stopping") return null;
    if (args.error) {
      await ctx.db.insert("taskSandboxEvents", {
        taskId: args.taskId,
        event: "stop_failed",
        errorDetail: args.error,
        createdAt: Date.now(),
      });
      await ctx.db.insert("messages", {
        parentId: args.taskId,
        role: "assistant",
        content: "Failed to stop sandbox",
        timestamp: Date.now(),
        isSystemAlert: true,
        errorDetail: args.error,
      });
      await ctx.db.patch(args.taskId, {
        reviewTaskSandboxStatus: "active",
        updatedAt: Date.now(),
      });
      return null;
    }
    await ctx.db.insert("taskSandboxEvents", {
      taskId: args.taskId,
      event: "stopped",
      createdAt: Date.now(),
    });
    await ctx.db.insert("messages", {
      parentId: args.taskId,
      role: "assistant",
      content: "Sandbox stopped",
      timestamp: Date.now(),
      isSystemAlert: true,
    });
    await ctx.db.patch(args.taskId, {
      reviewTaskSandboxStatus: "closed",
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Marks a task preview sandbox as ready (internal use), and logs a `started`
 * event for fresh sandboxes or `reconnected` for resumed sandboxes.
 */
export const taskSandboxReady = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    sandboxId: v.string(),
    isNew: v.boolean(),
    devPort: v.optional(v.number()),
    devCommand: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;

    if (
      task.reviewTaskSandboxStatus === "stopping" ||
      task.reviewTaskSandboxStatus === "closed"
    ) {
      console.log(
        `[tasks] taskSandboxReady ignored taskId=${args.taskId} status=${task.reviewTaskSandboxStatus} sandboxId=${args.sandboxId}`,
      );
      return null;
    }

    // Early-ready (VM up) + final-ready (after services) both call this. Only
    // emit the system alert once; still patch latest sandbox/dev metadata.
    const alreadyActive =
      task.reviewTaskSandboxStatus === "active" &&
      task.sandboxId === args.sandboxId;
    if (!alreadyActive) {
      const content = args.isNew ? "Sandbox started" : "Sandbox reconnected";
      await ctx.db.insert("taskSandboxEvents", {
        taskId: args.taskId,
        event: args.isNew ? "started" : "reconnected",
        createdAt: Date.now(),
      });
      await ctx.db.insert("messages", {
        parentId: args.taskId,
        role: "assistant",
        content,
        timestamp: Date.now(),
        isSystemAlert: true,
      });
    }

    await ctx.db.patch(args.taskId, {
      sandboxId: args.sandboxId,
      reviewTaskSandboxStatus: "active",
      updatedAt: Date.now(),
      ...(args.devPort !== undefined ? { devPort: args.devPort } : {}),
      ...(args.devCommand !== undefined ? { devCommand: args.devCommand } : {}),
    });

    return null;
  },
});

/**
 * Records a task sandbox startup failure (internal use) and logs a `failed`
 * event with the error detail so the user can inspect what went wrong.
 */
export const taskSandboxError = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;

    await ctx.db.insert("taskSandboxEvents", {
      taskId: args.taskId,
      event: "failed",
      errorDetail: args.error,
      createdAt: Date.now(),
    });
    await ctx.db.insert("messages", {
      parentId: args.taskId,
      role: "assistant",
      content: "Failed to start sandbox",
      timestamp: Date.now(),
      isSystemAlert: true,
      errorDetail: args.error,
    });

    await ctx.db.patch(args.taskId, {
      reviewTaskSandboxStatus: "closed",
      updatedAt: Date.now(),
    });

    return null;
  },
});

/**
 * Polls until a preview sandbox is `active` or has failed back to `closed`.
 * Used when a start is already in flight so we do not kick off a second one.
 */
export const waitForTaskPreviewSandboxActive = internalAction({
  args: {
    taskId: v.id("agentTasks"),
    timeoutMs: v.optional(v.number()),
  },
  returns: v.object({ ready: v.boolean() }),
  handler: async (ctx, args) => {
    const deadline = Date.now() + (args.timeoutMs ?? 240_000);
    while (Date.now() < deadline) {
      const task = await ctx.runQuery(internal.agentTasks.getInternal, {
        id: args.taskId,
      });
      if (task?.reviewTaskSandboxStatus === "active") {
        return { ready: true };
      }
      if (
        task?.reviewTaskSandboxStatus === "closed" ||
        task?.reviewTaskSandboxStatus === undefined
      ) {
        return { ready: false };
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    return { ready: false };
  },
});
