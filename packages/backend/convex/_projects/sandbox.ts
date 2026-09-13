import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  internalAction,
  internalMutation,
  type MutationCtx,
} from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { STUCK_STOPPING_RECOVER_MS } from "../_sandbox/stopRecovery";
import { authMutation, getProjectWithAccess, hasActiveRun } from "../functions";
import { rejectSandboxCaller } from "../_auth/sandboxIdentity";
import { workflow } from "../workflowManager";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { buildProjectBranchName } from "./helpers";
import {
  seedSandboxStartupActivity,
  clearSandboxStartupActivity,
} from "../_sandbox/startupActivity";
import { resolveCredentialSourceLabel } from "../_userProviderAccounts/credentialSource";
import { clearPendingQuestionsForEntity } from "../pendingQuestions";
import { normalizeAIModel } from "../validators";
import { setTaskLastRunStartedAt } from "../_agentTasks/runSummary";

const PREVIEW_ALLOWED_PHASES = [
  "in_progress",
  "business_review",
  "code_review",
] as const;

/** Starts a preview sandbox for a project, checking out the project branch and running startup commands. */
export const startProjectSandbox = authMutation({
  args: {
    projectId: v.id("projects"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const project = await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
    );

    if (!PREVIEW_ALLOWED_PHASES.some((phase) => phase === project.phase)) {
      throw new Error(
        `Project must be in in_progress, business_review, or code_review to start sandbox. Current phase: ${project.phase}`,
      );
    }

    const repo = await ctx.db.get(project.repoId);
    if (!repo) throw new Error("Repository not found");

    const branchName =
      project.branchName ?? repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH;
    const baseBranch =
      project.baseBranch ?? repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH;

    await ctx.db.patch(args.projectId, {
      reviewProjectSandboxStatus: "starting",
    });
    // Seed startup streaming immediately so the UI shows a real step instead of
    // the random "Eva is inferring…" spinner while the workflow schedules.
    await seedSandboxStartupActivity(
      ctx.db,
      `project-sandbox-startup-${args.projectId}`,
    );
    const reusableSandboxId = project.sandboxId;
    console.log(
      `[projects] startProjectSandbox projectId=${args.projectId} existingSandboxId=${project.sandboxId ?? "none"} sandboxId=${reusableSandboxId ?? "none"}`,
    );

    const startArgs = {
      projectId: args.projectId,
      existingSandboxId: project.sandboxId,

      installationId: repo.installationId,
      repoOwner: repo.owner,
      repoName: repo.name,
      branchName,
      baseBranch,
      repoId: project.repoId,
    };
    // Vercel: schedule start action directly (skip ~6s workflow scheduling).
    if (reusableSandboxId) {
      await ctx.scheduler.runAfter(
        0,
        internal.sandbox.startProjectPreviewSandbox,
        startArgs,
      );
    } else {
      await workflow.start(
        ctx,
        internal.projectSandboxWorkflow.projectPreviewSandboxStartupWorkflow,
        startArgs,
      );
    }

    return null;
  },
});

/**
 * Re-runs startup commands for a project's preview sandbox by kicking off the
 * regular sandbox startup workflow with `forceStartupCommands: true`. Used to
 * recover when seed/import failed. Normal Start only relaunches background
 * daemons; this is the explicit path that re-runs startupCommands.
 *
 * Auto-starts the sandbox if it isn't running yet — same workflow path either
 * way, just with the force flag set so commands always re-execute.
 */
export const retryProjectStartupCommands = authMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const project = await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
    );

    if (!PREVIEW_ALLOWED_PHASES.some((phase) => phase === project.phase)) {
      throw new Error(
        `Project must be in in_progress, business_review, or code_review to run startup commands. Current phase: ${project.phase}`,
      );
    }

    if (
      project.reviewProjectSandboxStatus === "starting" ||
      project.reviewProjectSandboxStatus === "stopping"
    ) {
      throw new Error(
        "Sandbox is currently starting or stopping. Wait for it to settle before retrying.",
      );
    }

    const repo = await ctx.db.get(project.repoId);
    if (!repo) throw new Error("Repository not found");

    const branchName =
      project.branchName ?? repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH;
    const baseBranch =
      project.baseBranch ?? repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH;

    await ctx.db.patch(args.projectId, {
      reviewProjectSandboxStatus: "starting",
    });

    await workflow.start(
      ctx,
      internal.projectSandboxWorkflow.projectPreviewSandboxStartupWorkflow,
      {
        projectId: args.projectId,
        existingSandboxId: project.sandboxId,

        installationId: repo.installationId,
        repoOwner: repo.owner,
        repoName: repo.name,
        branchName,
        baseBranch,
        repoId: project.repoId,
        forceStartupCommands: true,
      },
    );

    return null;
  },
});

/**
 * Re-launches the repo's configured background commands (long-running daemons
 * like `npx convex dev`) in an active project preview sandbox. Background
 * commands already run automatically on every sandbox start/resume; this is for
 * respawning a daemon that died while the sandbox kept running.
 */
export const runProjectBackgroundCommands = authMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const project = await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
    );

    if (project.reviewProjectSandboxStatus !== "active" || !project.sandboxId) {
      throw new Error("Start the sandbox before running background commands");
    }

    await ctx.scheduler.runAfter(0, internal.sandbox.runBackgroundCommands, {
      sandboxId: project.sandboxId,
      repoId: project.repoId,
    });

    return null;
  },
});

/**
 * Spawns an agent run on the project branch with the resolve_conflicts prompt.
 * Reuses the project's persistent sandbox and the existing task workflow
 * machinery. Picks the project's most recently updated non-draft task as the
 * carrier for the run — that task's status will be bumped to in_progress for
 * the duration and end up in code_review on completion (same lifecycle as a
 * task-level resolve_conflicts run).
 */
export const resolveProjectConflicts = authMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const project = await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
    );

    if (!project.prUrl) {
      throw new Error("Project has no PR to resolve conflicts for");
    }
    if (project.activeBuildWorkflowId) {
      throw new Error(
        "Cannot resolve conflicts while a build is active. Stop the build first.",
      );
    }

    const repo = await ctx.db.get(project.repoId);
    if (!repo) throw new Error("Repository not found");

    const projectTasks = await ctx.db
      .query("agentTasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const pt of projectTasks) {
      if (await hasActiveRun(ctx.db, pt._id)) {
        throw new Error(
          "Another task in this project is already running. Wait for it to finish.",
        );
      }
    }

    const carrier = projectTasks
      .filter((t) => t.status !== "draft")
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];

    if (!carrier) {
      throw new Error("No task in project to carry a resolve-conflicts run");
    }

    const branchName =
      project.branchName ??
      buildProjectBranchName(args.projectId, project.branchVersion);
    const baseBranch =
      project.baseBranch ?? repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH;

    const previousStatus = carrier.status;
    const startedAt = Date.now();
    const runId = await ctx.db.insert("agentRuns", {
      taskId: carrier._id,
      status: "queued",
      logs: [],
      startedAt,
      mode: "resolve_conflicts",
      credentialSourceLabel: await resolveCredentialSourceLabel(
        ctx.db,
        carrier.providerAccountId,
        carrier.createdBy,
      ),
      model: normalizeAIModel(carrier.model),
    });
    await setTaskLastRunStartedAt(ctx, carrier._id, project.repoId, startedAt);
    await ctx.db.patch(carrier._id, {
      status: "in_progress",
      updatedAt: Date.now(),
    });

    let workflowIdString = "";
    try {
      const workflowId = await workflow.start(
        ctx,
        internal.taskWorkflow.taskExecutionWorkflow,
        {
          runId,
          taskId: carrier._id,
          repoId: project.repoId,
          installationId: repo.installationId,
          projectId: args.projectId,
          branchName,
          baseBranch,
          isFirstTaskOnBranch: false,
          model: carrier.model ?? repo.defaultModel,
          providerAccountId: carrier.providerAccountId,
          credentialOwnerUserId: carrier.createdBy,
          userId: ctx.userId,
          mode: "resolve_conflicts",
        },
      );
      workflowIdString = String(workflowId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start workflow";
      await ctx.db.patch(runId, {
        status: "error",
        error: message,
        finishedAt: Date.now(),
        exitReason: "workflow_start_failed",
      });
      await ctx.db.patch(carrier._id, {
        status: previousStatus,
        activeWorkflowId: undefined,
        updatedAt: Date.now(),
      });
      throw error;
    }

    await ctx.db.patch(carrier._id, {
      activeWorkflowId: workflowIdString,
    });

    return null;
  },
});

/**
 * Stops the preview sandbox. Keeps `sandboxId` so the user can
 * resume the same paused filesystem on next start.
 *
 * Marks the project as `"stopping"` synchronously so the UI can show a spinner
 * and disable the Start button until the sandbox stop completes.
 */
export const stopProjectSandbox = authMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const project = await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
    );

    if (!project.sandboxId) {
      // Nothing to stop — close immediately.
      await ctx.db.patch(args.projectId, {
        reviewProjectSandboxStatus: "closed",
      });
      return null;
    }

    await scheduleFinalizeStopProject(ctx, {
      projectId: args.projectId,
      sandboxId: project.sandboxId,
      repoId: project.repoId,
    });

    // Clear leftover start steps so stop does not re-show startup activity.
    await clearSandboxStartupActivity(
      ctx.db,
      `project-sandbox-startup-${args.projectId}`,
    );

    // Stopping kills the paused turn, so any blocking AskUserQuestion can
    // never be claimed — clear it or it hides the composer forever.
    await clearPendingQuestionsForEntity(ctx.db, String(args.projectId));

    // Keep sandboxId so we can resume the stopped sandbox later.
    await ctx.db.patch(args.projectId, {
      reviewProjectSandboxStatus: "stopping",
    });

    return null;
  },
});

/**
 * Schedules project sandbox teardown. Every path that flips a project to
 * `"stopping"` must go through here, or a transient on the finalize action
 * wedges the project with no recovery (mirrors _sessions/sandbox.ts).
 */
export async function scheduleFinalizeStopProject(
  ctx: MutationCtx,
  args: {
    projectId: Id<"projects">;
    sandboxId: string;
    repoId: Id<"githubRepos">;
  },
): Promise<void> {
  await ctx.scheduler.runAfter(
    0,
    internal._projects.sandbox.finalizeStopProjectSandbox,
    args,
  );
  await ctx.scheduler.runAfter(
    STUCK_STOPPING_RECOVER_MS,
    internal._projects.sandbox.recoverStuckStopping,
    { projectId: args.projectId },
  );
}

/**
 * Re-issues finalizeStopProjectSandbox if the project is still `"stopping"`.
 * Scheduled after Stop so a platform transient on the first action doesn't
 * leave the UI wedged; no-ops if stop already finished.
 */
export const recoverStuckStopping = internalMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (
      !project ||
      project.reviewProjectSandboxStatus !== "stopping" ||
      !project.sandboxId
    ) {
      return null;
    }
    await ctx.scheduler.runAfter(
      0,
      internal._projects.sandbox.finalizeStopProjectSandbox,
      {
        projectId: args.projectId,
        sandboxId: project.sandboxId,
        repoId: project.repoId,
      },
    );
    return null;
  },
});

/**
 * Awaits provider stop and finalizes project sandbox status. Only marks
 * `"closed"` after a successful stop — on failure reverts to `"active"`.
 */
export const finalizeStopProjectSandbox = internalAction({
  args: {
    projectId: v.id("projects"),
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
    await ctx.runMutation(internal._projects.sandbox.markProjectSandboxClosed, {
      projectId: args.projectId,
      error: stopError,
    });
    return null;
  },
});

/**
 * Internal: after stop settles, either close (success) or revert to active
 * (failure) so Eva never shows off while Vercel is still running.
 */
export const markProjectSandboxClosed = internalMutation({
  args: {
    projectId: v.id("projects"),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    // Only flip if still stopping — don't overwrite a fresh start.
    if (project.reviewProjectSandboxStatus !== "stopping") return null;
    if (args.error) {
      await ctx.db.insert("messages", {
        parentId: args.projectId,
        role: "assistant",
        content: "Failed to stop sandbox",
        timestamp: Date.now(),
        isSystemAlert: true,
        errorDetail: args.error,
      });
      await ctx.db.patch(args.projectId, {
        reviewProjectSandboxStatus: "active",
      });
      return null;
    }
    await ctx.db.insert("messages", {
      parentId: args.projectId,
      role: "assistant",
      content: "Sandbox stopped",
      timestamp: Date.now(),
      isSystemAlert: true,
    });
    await ctx.db.patch(args.projectId, {
      reviewProjectSandboxStatus: "closed",
    });
    return null;
  },
});

/** Marks a project preview sandbox as ready (internal use). */
export const projectSandboxReady = internalMutation({
  args: {
    projectId: v.id("projects"),
    sandboxId: v.string(),

    isNew: v.boolean(),
    devPort: v.optional(v.number()),
    devCommand: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;

    if (
      project.reviewProjectSandboxStatus === "stopping" ||
      project.reviewProjectSandboxStatus === "closed"
    ) {
      console.log(
        `[projects] projectSandboxReady ignored projectId=${args.projectId} status=${project.reviewProjectSandboxStatus} sandboxId=${args.sandboxId}`,
      );
      return null;
    }

    // Early-ready (VM up) + final-ready (after services) both call this. Only
    // emit the system alert once; still patch latest sandbox/dev metadata.
    const alreadyActive =
      project.reviewProjectSandboxStatus === "active" &&
      project.sandboxId === args.sandboxId;
    if (!alreadyActive) {
      const content = args.isNew ? "Sandbox started" : "Sandbox reconnected";
      await ctx.db.insert("messages", {
        parentId: args.projectId,
        role: "assistant",
        content,
        timestamp: Date.now(),
        isSystemAlert: true,
      });
    }
    await ctx.db.patch(args.projectId, {
      sandboxId: args.sandboxId,
      reviewProjectSandboxStatus: "active",
      lastSandboxActivity: Date.now(),
      ...(args.devPort !== undefined ? { devPort: args.devPort } : {}),
      ...(args.devCommand !== undefined ? { devCommand: args.devCommand } : {}),
    });

    return null;
  },
});

/** Marks a project preview sandbox as starting (internal use). */
export const projectSandboxStarting = internalMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;

    await ctx.db.patch(args.projectId, {
      reviewProjectSandboxStatus: "starting",
      lastSandboxActivity: Date.now(),
    });

    return null;
  },
});

/** Persists the sandbox id as soon as the sandbox is created, before long startup steps. */
export const projectSandboxAllocated = internalMutation({
  args: {
    projectId: v.id("projects"),
    sandboxId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;

    await ctx.db.patch(args.projectId, {
      sandboxId: args.sandboxId,
      reviewProjectSandboxStatus: "starting",
      lastSandboxActivity: Date.now(),
    });

    return null;
  },
});

/** Records a project sandbox startup failure (internal use). */
export const projectSandboxError = internalMutation({
  args: {
    projectId: v.id("projects"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;

    await ctx.db.insert("messages", {
      parentId: args.projectId,
      role: "assistant",
      content: "Failed to start sandbox",
      timestamp: Date.now(),
      isSystemAlert: true,
      errorDetail: args.error,
    });
    await ctx.db.patch(args.projectId, {
      reviewProjectSandboxStatus: "closed",
    });

    return null;
  },
});
