import { v } from "convex/values";
import { findPrimaryPullRequest } from "../_pullRequests/store";
import { startTaskRun } from "../_taskWorkflow/startRun";
import { resolveProjectBaseBranch } from "../_taskWorkflow/resolveBaseBranch";
import { resolveProjectBranchName } from "../_git/branchNames";
import { internal } from "../_generated/api";
import {
  internalAction,
  internalMutation,
  type MutationCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  scheduleDrainAfterStopSettles,
  STUCK_STOPPING_RECOVER_MS,
} from "../_sandbox/stopRecovery";
import { authMutation, getProjectWithAccess, hasActiveRun } from "../functions";
import { workflow } from "../workflowManager";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import {
  seedSandboxStartupActivity,
  clearSandboxStartupActivity,
} from "../_sandbox/startupActivity";
import { detachPendingQuestions } from "../pendingQuestions";
import { clearPreviewToolCallsForParent } from "../_previewToolCalls/calls";
import {
  stopAlertText,
  stopReasonValidator,
  type StopReason,
} from "../_sandbox/stopReason";
import { touchUserActivity } from "../_sandbox/activity";
import {
  canRequestSandboxStart,
  canStartActionMarkStarting,
  discardUntrackedSandbox,
  isCurrentSandboxStartAttempt,
  nextSandboxStartAttempt,
  scheduleStuckStartExpiry,
  shouldApplySandboxStartFailure,
} from "../_sandbox/transitions";
import { settleOrphanedBackgroundAgents } from "../_sessions/backgroundAgents";

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
    const project = await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
    );

    if (!isPreviewAllowedPhase(project)) {
      throw new Error(
        `Project must be in in_progress, business_review, or code_review to start sandbox. Current phase: ${project.phase}`,
      );
    }

    await requestProjectSandboxStart(ctx, project);
    return null;
  },
});

function isPreviewAllowedPhase(project: Doc<"projects">): boolean {
  return PREVIEW_ALLOWED_PHASES.some((phase) => phase === project.phase);
}

/**
 * Marks the project's preview sandbox starting and schedules the start. Shared
 * by the wake button and the chat queue (`wakeProjectSandboxForQueue`).
 * Callers check access and the phase.
 */
async function requestProjectSandboxStart(
  ctx: MutationCtx,
  project: Doc<"projects">,
): Promise<void> {
  if (!canRequestSandboxStart(project.reviewProjectSandboxStatus)) {
    console.log(
      `[projects] startProjectSandbox skipped projectId=${project._id} status=${project.reviewProjectSandboxStatus}`,
    );
    return;
  }
  const repo = await ctx.db.get(project.repoId);
  if (!repo) throw new Error("Repository not found");

  const branchName =
    project.branchName ?? repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH;
  const baseBranch =
    project.baseBranch ?? repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH;

  const startAttempt = nextSandboxStartAttempt(project.sandboxStartAttempt);
  await ctx.db.patch(project._id, {
    reviewProjectSandboxStatus: "starting",
    sandboxStartAttempt: startAttempt,
  });
  // Seed startup streaming immediately so the UI shows a real step instead of
  // the random "Eva is inferring…" spinner while the workflow schedules.
  await seedSandboxStartupActivity(
    ctx.db,
    `project-sandbox-startup-${project._id}`,
  );
  const reusableSandboxId = project.sandboxId;
  console.log(
    `[projects] startProjectSandbox projectId=${project._id} existingSandboxId=${project.sandboxId ?? "none"} sandboxId=${reusableSandboxId ?? "none"}`,
  );

  const startArgs = {
    projectId: project._id,
    existingSandboxId: project.sandboxId,

    installationId: repo.installationId,
    repoOwner: repo.owner,
    repoName: repo.name,
    branchName,
    baseBranch,
    repoId: project.repoId,
    startAttempt,
  };
  await scheduleStuckStartExpiry(
    ctx,
    { kind: "project", id: project._id },
    startAttempt,
  );
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
}

/**
 * Wakes a sleeping project sandbox so its queued chat can send. Skipped in a
 * phase the wake button would refuse, leaving the message queued.
 */
export async function wakeProjectSandboxForQueue(
  ctx: MutationCtx,
  project: Doc<"projects">,
): Promise<void> {
  if (!isPreviewAllowedPhase(project)) return;
  await requestProjectSandboxStart(ctx, project);
}

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

    const startAttempt = nextSandboxStartAttempt(project.sandboxStartAttempt);
    await ctx.db.patch(args.projectId, {
      reviewProjectSandboxStatus: "starting",
      sandboxStartAttempt: startAttempt,
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
        startAttempt,
      },
    );
    await scheduleStuckStartExpiry(
      ctx,
      { kind: "project", id: args.projectId },
      startAttempt,
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
    const project = await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
    );

    const primaryPr = await findPrimaryPullRequest(ctx.db, {
      kind: "project",
      projectId: project._id,
    });
    if (
      !primaryPr ||
      primaryPr.state === "merged" ||
      primaryPr.state === "closed"
    ) {
      throw new Error("Project has no open PR to resolve conflicts for");
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

    await startTaskRun(ctx, {
      task: carrier,
      repo,
      userId: ctx.userId,
      baseBranch: resolveProjectBaseBranch(project, repo),
      isFirstTaskOnBranch: false,
      branchName: resolveProjectBranchName(args.projectId, project),
      projectId: args.projectId,
      mode: "resolve_conflicts",
      clearPendingChangeRequest: false,
      rollbackStatus: carrier.status,
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
    await getProjectWithAccess(ctx.db, args.projectId, ctx.userId);
    await requestProjectSandboxStop(ctx, args.projectId);
    return null;
  },
});

/**
 * Shared stop path for a project sandbox: the Stop button, the daily auto-stop
 * sweep and the idle sweep all go through here (mirrors
 * `requestSessionSandboxStop` / `requestTaskSandboxStop`), so every stop clears
 * the same leftover UI state. Callers own the auth check.
 */
export async function requestProjectSandboxStop(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  options: { stopReason?: StopReason } = {},
): Promise<void> {
  const project = await ctx.db.get(projectId);
  if (!project) return;
  const { stopReason } = options;

  if (!project.sandboxId) {
    // Nothing to stop — close immediately.
    await ctx.db.patch(projectId, {
      reviewProjectSandboxStatus: "closed",
    });
    return;
  }

  if (project.reviewProjectSandboxStatus === "stopping") {
    // Already stopping — re-issue the idempotent finalize so a stalled first
    // attempt recovers instead of leaving the row wedged.
    await scheduleFinalizeStopProject(ctx, {
      projectId,
      sandboxId: project.sandboxId,
      repoId: project.repoId,
      stopReason,
    });
    return;
  }

  await scheduleFinalizeStopProject(ctx, {
    projectId,
    sandboxId: project.sandboxId,
    repoId: project.repoId,
    stopReason,
  });

  // Clear leftover start steps so stop does not re-show startup activity.
  await clearSandboxStartupActivity(
    ctx.db,
    `project-sandbox-startup-${projectId}`,
  );

  // Stopping kills the paused turn, so any blocking AskUserQuestion can
  // never be claimed — move it onto the chat message so the card stays.
  await detachPendingQuestions(ctx.db, String(projectId));
  await clearPreviewToolCallsForParent(ctx.db, projectId);

  // Keep sandboxId so we can resume the stopped sandbox later.
  await ctx.db.patch(projectId, {
    reviewProjectSandboxStatus: "stopping",
  });
}

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
    stopReason?: StopReason;
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
    { projectId: args.projectId, stopReason: args.stopReason },
  );
}

/**
 * Re-issues finalizeStopProjectSandbox if the project is still `"stopping"`.
 * Scheduled after Stop so a platform transient on the first action doesn't
 * leave the UI wedged; no-ops if stop already finished. Carries the original
 * stop reason so the divider matches the request even when this finalize wins
 * the race against a slow provider stop.
 */
export const recoverStuckStopping = internalMutation({
  args: { projectId: v.id("projects"), stopReason: stopReasonValidator },
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
        stopReason: args.stopReason,
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
    stopReason: stopReasonValidator,
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
      stopReason: args.stopReason,
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
    stopReason: stopReasonValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    // Only flip if still stopping — don't overwrite a fresh start.
    if (project.reviewProjectSandboxStatus !== "stopping") return null;
    await scheduleDrainAfterStopSettles(ctx, args.projectId);
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
      content: stopAlertText(args.stopReason),
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
    startAttempt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    if (
      !isCurrentSandboxStartAttempt(
        project.sandboxStartAttempt,
        args.startAttempt,
      )
    ) {
      console.log(
        `[projects] projectSandboxReady ignored stale attempt ${args.startAttempt} (current ${project.sandboxStartAttempt}) projectId=${args.projectId}`,
      );
      await discardUntrackedSandbox(ctx, {
        sandboxId: args.sandboxId,
        trackedSandboxId: project.sandboxId,
        repoId: project.repoId,
        isNew: args.isNew,
      });
      return null;
    }

    if (
      project.reviewProjectSandboxStatus === "stopping" ||
      project.reviewProjectSandboxStatus === "closed"
    ) {
      console.log(
        `[projects] projectSandboxReady ignored projectId=${args.projectId} status=${project.reviewProjectSandboxStatus} sandboxId=${args.sandboxId}`,
      );
      // Only a start request's own attempt (it carries a number) made this
      // VM for nobody else. Untokened callers such as sessionExecuteWorkflow
      // go on to use the VM they prepared, so it must not be deleted here.
      if (args.startAttempt !== undefined) {
        await discardUntrackedSandbox(ctx, {
          sandboxId: args.sandboxId,
          trackedSandboxId: project.sandboxId,
          repoId: project.repoId,
          isNew: args.isNew,
        });
      }
      return null;
    }

    // Early-ready (VM up) + final-ready (after services) both call this. Only
    // emit the system alert once; still patch latest sandbox/dev metadata.
    const alreadyActive =
      project.reviewProjectSandboxStatus === "active" &&
      project.sandboxId === args.sandboxId;
    if (!alreadyActive) {
      // Subagents died with the old VM; unsettled, they hold the chat queue
      // (`runningBackgroundAgents`). Mirrors the session `sandboxReady`.
      const settledAgents = settleOrphanedBackgroundAgents(
        project.backgroundAgents,
        Date.now(),
      );
      if (settledAgents) {
        await ctx.db.patch(args.projectId, { backgroundAgents: settledAgents });
      }
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
    // A wake is an interaction: the idle sweep grants a full grace window.
    await touchUserActivity(
      ctx,
      { kind: "project", entityId: String(args.projectId) },
      { source: "start" },
    );
    // Sends what was queued while Eva slept. Early + final ready both land
    // here; the second no-ops once the first turn is running.
    // Scheduled, not imported: the queue helpers import this module to wake a
    // stopped sandbox, so a direct call would make an import cycle.
    await ctx.scheduler.runAfter(
      0,
      internal._queues.helpers.drainQueueQuietly,
      {
        parentId: args.projectId,
      },
    );

    return null;
  },
});

/** Marks a project preview sandbox as starting (internal use). */
export const projectSandboxStarting = internalMutation({
  args: {
    projectId: v.id("projects"),
    startAttempt: v.optional(v.number()),
  },
  // False: this start no longer owns the sandbox (stale attempt, or a stop
  // landed). The caller must give up without creating or touching a VM.
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return false;
    if (
      !isCurrentSandboxStartAttempt(
        project.sandboxStartAttempt,
        args.startAttempt,
      )
    ) {
      console.log(
        `[projects] projectSandboxStarting ignored stale attempt ${args.startAttempt} (current ${project.sandboxStartAttempt}) projectId=${args.projectId}`,
      );
      return false;
    }
    // Tokened: the request already marked `starting`; this is a re-mark and
    // must not revive a sandbox stopped since. Untokened (the project
    // interview): this call *is* the start request, so the request rule
    // applies and a stopped sandbox may start again.
    const mayMarkStarting =
      args.startAttempt === undefined
        ? canRequestSandboxStart(project.reviewProjectSandboxStatus)
        : canStartActionMarkStarting(project.reviewProjectSandboxStatus);
    if (!mayMarkStarting) return false;

    await ctx.db.patch(args.projectId, {
      reviewProjectSandboxStatus: "starting",
      lastSandboxActivity: Date.now(),
      // An untokened start is a new request: take a new attempt number so an
      // older attempt's stuck-start expiry cannot close this one.
      ...(args.startAttempt === undefined
        ? {
            sandboxStartAttempt: nextSandboxStartAttempt(
              project.sandboxStartAttempt,
            ),
          }
        : {}),
    });

    return true;
  },
});

/** Persists the sandbox id as soon as the sandbox is created, before long startup steps. */
export const projectSandboxAllocated = internalMutation({
  args: {
    projectId: v.id("projects"),
    sandboxId: v.string(),
    startAttempt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    if (
      !isCurrentSandboxStartAttempt(
        project.sandboxStartAttempt,
        args.startAttempt,
      )
    ) {
      console.log(
        `[projects] projectSandboxAllocated ignored stale attempt ${args.startAttempt} (current ${project.sandboxStartAttempt}) projectId=${args.projectId}`,
      );
      await discardUntrackedSandbox(ctx, {
        sandboxId: args.sandboxId,
        trackedSandboxId: project.sandboxId,
        repoId: project.repoId,
        isNew: true,
      });
      return null;
    }

    // Always record the VM so a stop or the idle sweep can still find it;
    // only the status respects a stop that landed while it was being created.
    await ctx.db.patch(args.projectId, {
      sandboxId: args.sandboxId,
      lastSandboxActivity: Date.now(),
      ...(canStartActionMarkStarting(project.reviewProjectSandboxStatus)
        ? { reviewProjectSandboxStatus: "starting" as const }
        : {}),
    });

    return null;
  },
});

/** Records a project sandbox startup failure (internal use). */
export const projectSandboxError = internalMutation({
  args: {
    projectId: v.id("projects"),
    error: v.string(),
    startAttempt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    if (
      !isCurrentSandboxStartAttempt(
        project.sandboxStartAttempt,
        args.startAttempt,
      )
    ) {
      console.log(
        `[projects] projectSandboxError ignored stale attempt ${args.startAttempt} (current ${project.sandboxStartAttempt}) projectId=${args.projectId}`,
      );
      return null;
    }
    if (!shouldApplySandboxStartFailure(project.reviewProjectSandboxStatus)) {
      console.log(
        `[projects] projectSandboxError ignored projectId=${args.projectId} status=${project.reviewProjectSandboxStatus}: ${args.error}`,
      );
      return null;
    }

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
