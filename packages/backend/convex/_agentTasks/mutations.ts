import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  taskStatusValidator,
  aiModelValidator,
  priorityValidator,
  reasoningLevelValidator,
} from "../validators";
import { createNotification } from "../notifications";
import { ensureSubscribed, notifySubscribers } from "../taskSubscribers";
import {
  authMutation,
  hasRepoAccess,
  hasTaskAccess,
  softDeleteAgentTask,
  recomputeProjectPhase,
} from "../functions";
import { allocateNumId } from "../numId";
import {
  normalizeTaskTags,
  buildTaskNotificationMessage,
  runTraitFields,
} from "./helpers";
import { buildProjectBranchName } from "../_projects/helpers";
import { resolveNewTaskBaseBranch } from "../_taskWorkflow/resolveBaseBranch";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { logTaskActivity } from "../taskActivity";
import { schedulePrTitleSync } from "../_github/prTitleSync";
import {
  assertProviderAccountUsableBy,
  reconcileProviderAccountForModel,
  resolveDefaultProviderAccountId,
} from "../_userProviderAccounts/defaults";
import { createTaskRunSummary, moveTaskRunSummary } from "./runSummary";
import { extractPrNumber } from "../_github/prUrl";
import {
  schedulePrLifecycleActions,
  selectPrLifecycleTransition,
} from "../_github/prLifecycleActions";

/** Highest taskNumber among a project's tasks, or 0 if none are numbered. */
function maxTaskNumberOf(tasks: Doc<"agentTasks">[]): number {
  let max = 0;
  for (const t of tasks) {
    if (t.taskNumber !== undefined && t.taskNumber > max) {
      max = t.taskNumber;
    }
  }
  return max;
}

// Status transitions that notify subscribers. Mid-run automated transitions
// (todo/in_progress) are intentionally excluded; those patch status directly
// elsewhere and never flow through this user-facing mutation anyway.
const STATUS_CHANGE_NOTIFY: ReadonlySet<string> = new Set([
  "code_review",
  "business_review",
  "done",
  "cancelled",
]);

/** Updates editable fields on an agent task and notifies on assignment changes. */
export const update = authMutation({
  args: {
    id: v.id("agentTasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    repoId: v.optional(v.id("githubRepos")),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    tags: v.optional(v.array(v.string())),
    taskNumber: v.optional(v.number()),
    assignedTo: v.optional(v.union(v.id("users"), v.null())),
    model: v.optional(aiModelValidator),
    // null = clear to team credentials. undefined = no change.
    providerAccountId: v.optional(
      v.union(v.id("userProviderAccounts"), v.null()),
    ),
    ...runTraitFields,
    baseBranch: v.optional(v.string()),
    priority: v.optional(v.union(priorityValidator, v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId)))
      throw new Error("Task not found");
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;
    if (args.repoId !== undefined) updates.repoId = args.repoId;
    if (args.projectId !== undefined) {
      const newProjectId = args.projectId ?? undefined;
      updates.projectId = newProjectId;
      // Position the task at the end when moving it into a different project
      // by computing taskNumber as max(existing) + 1. Mirrors createQuickTask
      // and assignToProject.
      if (newProjectId && newProjectId !== task.projectId) {
        const existingTasks = await ctx.db
          .query("agentTasks")
          .withIndex("by_project", (q) => q.eq("projectId", newProjectId))
          .collect();
        updates.taskNumber = maxTaskNumberOf(existingTasks) + 1;
      }
    }
    if (args.tags !== undefined) updates.tags = normalizeTaskTags(args.tags);
    if (args.taskNumber !== undefined) updates.taskNumber = args.taskNumber;
    if (args.assignedTo !== undefined)
      updates.assignedTo = args.assignedTo ?? undefined;
    if (args.model !== undefined) updates.model = args.model;
    // Only the task owner may set a personal account; must be their own.
    let nextProviderAccountId = task.providerAccountId;
    if (args.providerAccountId !== undefined) {
      if (ctx.userId !== task.createdBy) {
        throw new Error("Only the task owner can change the provider account");
      }
      nextProviderAccountId = await assertProviderAccountUsableBy(
        ctx.db,
        args.providerAccountId,
        task.createdBy,
      );
      updates.providerAccountId = nextProviderAccountId;
    }
    // Owner changes model alone → keep matching personal account or re-default.
    // When providerAccountId is also in this update (picker chose Team/personal
    // with the model), the explicit account wins — do not reconcile over it.
    if (
      args.model !== undefined &&
      args.providerAccountId === undefined &&
      ctx.userId === task.createdBy
    ) {
      nextProviderAccountId = await reconcileProviderAccountForModel(
        ctx.db,
        task.createdBy,
        args.model,
        nextProviderAccountId,
      );
      updates.providerAccountId = nextProviderAccountId;
    }
    if (args.reasoningLevel !== undefined)
      updates.reasoningLevel = args.reasoningLevel;
    if (args.thinkingEnabled !== undefined)
      updates.thinkingEnabled = args.thinkingEnabled;
    if (args.use1mContext !== undefined)
      updates.use1mContext = args.use1mContext;
    if (args.fastMode !== undefined) updates.fastMode = args.fastMode;
    if (args.baseBranch !== undefined) updates.baseBranch = args.baseBranch;
    if (args.priority !== undefined)
      updates.priority = args.priority ?? undefined;
    await ctx.db.patch(args.id, updates);
    if (args.repoId !== undefined && args.repoId !== task.repoId) {
      await moveTaskRunSummary(ctx, args.id, args.repoId);
    }

    if (args.title !== undefined && args.title !== task.title) {
      await logTaskActivity(
        ctx,
        args.id,
        ctx.userId,
        "title",
        task.title,
        args.title,
      );
      if (task.repoId) {
        const runs = await ctx.db
          .query("agentRuns")
          .withIndex("by_task", (q) => q.eq("taskId", args.id))
          .collect();
        const prUrl = runs
          .sort(
            (a, b) =>
              (b.startedAt ?? b._creationTime) -
              (a.startedAt ?? a._creationTime),
          )
          .find((run) => run.prUrl)?.prUrl;
        if (prUrl) {
          await schedulePrTitleSync(ctx, {
            repoId: task.repoId,
            prUrl,
            title: args.title,
          });
        }
      }
    }
    if (
      args.description !== undefined &&
      args.description !== task.description
    ) {
      await logTaskActivity(
        ctx,
        args.id,
        ctx.userId,
        "description",
        task.description ?? undefined,
        args.description,
      );
    }
    if (
      args.assignedTo !== undefined &&
      (args.assignedTo ?? undefined) !== task.assignedTo
    ) {
      await logTaskActivity(
        ctx,
        args.id,
        ctx.userId,
        "assignee",
        task.assignedTo,
        args.assignedTo ?? undefined,
      );
    }
    if (
      args.projectId !== undefined &&
      (args.projectId ?? undefined) !== task.projectId
    ) {
      await logTaskActivity(
        ctx,
        args.id,
        ctx.userId,
        "project",
        task.projectId,
        args.projectId ?? undefined,
      );
    }
    if (
      args.priority !== undefined &&
      (args.priority ?? undefined) !== task.priority
    ) {
      await logTaskActivity(
        ctx,
        args.id,
        ctx.userId,
        "priority",
        task.priority,
        args.priority ?? undefined,
      );
    }
    if (args.tags !== undefined) {
      const oldTags = (task.tags ?? []).join(", ");
      const normalized = normalizeTaskTags(args.tags) ?? [];
      const newTags = normalized.join(", ");
      if (oldTags !== newTags) {
        await logTaskActivity(
          ctx,
          args.id,
          ctx.userId,
          "tags",
          oldTags || undefined,
          newTags || undefined,
        );
      }
    }
    if (args.model !== undefined && args.model !== task.model) {
      await logTaskActivity(
        ctx,
        args.id,
        ctx.userId,
        "model",
        task.model,
        args.model,
      );
    }
    if (args.baseBranch !== undefined && args.baseBranch !== task.baseBranch) {
      await logTaskActivity(
        ctx,
        args.id,
        ctx.userId,
        "baseBranch",
        task.baseBranch,
        args.baseBranch,
      );
    }

    if (args.assignedTo !== undefined && args.assignedTo !== task.assignedTo) {
      if (args.assignedTo) {
        await ensureSubscribed(ctx, args.id, args.assignedTo);
      }
      if (args.assignedTo && args.assignedTo !== ctx.userId) {
        await createNotification(ctx, {
          userId: args.assignedTo,
          type: "task_assigned",
          title: `Assigned: "${task.title}"`,
          repoId: task.repoId,
          projectId: task.projectId,
          taskId: args.id,
          message: buildTaskNotificationMessage(task, "assigned"),
        });
      }
    }
    return null;
  },
});

/** Transitions a task to a new status, enforcing dependency constraints and notifying on completion. */
export const updateStatus = authMutation({
  args: {
    id: v.id("agentTasks"),
    status: taskStatusValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId)))
      throw new Error("Task not found");
    const workStatuses = [
      "todo",
      "in_progress",
      "code_review",
      "business_review",
    ];
    if (workStatuses.includes(args.status)) {
      const dependencies = await ctx.db
        .query("taskDependencies")
        .withIndex("by_task", (q) => q.eq("taskId", args.id))
        .collect();
      for (const dep of dependencies) {
        const dependsOnTask = await ctx.db.get(dep.dependsOnId);
        if (dependsOnTask && dependsOnTask.status !== "done") {
          throw new Error(
            `Cannot move to ${args.status}: task is blocked by "${dependsOnTask.title}"`,
          );
        }
      }
    }
    const clearSchedule =
      args.status !== "todo" && task.scheduledFunctionId !== undefined;
    if (clearSchedule && task.scheduledFunctionId) {
      try {
        await ctx.scheduler.cancel(task.scheduledFunctionId);
      } catch {
        // may have already fired
      }
    }
    const previousStatus = task.status;
    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
      ...(clearSchedule && {
        scheduledAt: undefined,
        scheduledFunctionId: undefined,
      }),
    });

    if (previousStatus !== args.status) {
      await logTaskActivity(
        ctx,
        args.id,
        ctx.userId,
        "status",
        previousStatus,
        args.status,
      );
    }

    // Sync the GitHub PR state for quick tasks. Project tasks share one PR
    // across many tasks, so individual task status changes don't map cleanly
    // to PR state — skip them.
    //   entering code_review → mark PR ready for review
    //   leaving code_review (not to done/cancelled) → convert PR back to draft
    //   entering cancelled → close PR (mirrors the PR-closed → task-cancelled webhook)
    //   leaving cancelled (not to done) → reopen PR; ready for code_review, draft otherwise
    const enteringCodeReview =
      args.status === "code_review" && previousStatus !== "code_review";
    const enteringCancelled =
      args.status === "cancelled" && previousStatus !== "cancelled";
    const leavingCancelled =
      previousStatus === "cancelled" &&
      args.status !== "cancelled" &&
      args.status !== "done";
    const leavingCodeReview =
      previousStatus === "code_review" &&
      args.status !== "code_review" &&
      args.status !== "done" &&
      args.status !== "cancelled";
    if (
      !task.projectId &&
      task.repoId &&
      (enteringCodeReview ||
        leavingCodeReview ||
        enteringCancelled ||
        leavingCancelled)
    ) {
      const run = await ctx.db
        .query("agentRuns")
        .withIndex("by_task", (q) => q.eq("taskId", args.id))
        .order("desc")
        .first();
      const prUrl = run?.prUrl;
      const prNumber = prUrl ? extractPrNumber(prUrl) : null;
      const repo = prNumber ? await ctx.db.get(task.repoId) : null;
      const transition = selectPrLifecycleTransition({
        enteringCancelled,
        leavingCancelled,
        enteringCodeReview,
        leavingCodeReview,
        asReadyOnReopen: args.status === "code_review",
      });
      if (prNumber && repo && transition) {
        await schedulePrLifecycleActions(
          ctx,
          {
            installationId: repo.installationId,
            repoOwner: repo.owner,
            repoName: repo.name,
            prNumber,
          },
          transition,
        );
      }
    }

    if (
      previousStatus !== args.status &&
      STATUS_CHANGE_NOTIFY.has(args.status)
    ) {
      const isDone = args.status === "done";
      await notifySubscribers(ctx, {
        taskId: args.id,
        type: isDone ? "task_complete" : "status_changed",
        title: isDone
          ? `Completed: "${task.title}"`
          : `"${task.title}" moved to ${args.status.replace(/_/g, " ")}`,
        message: isDone
          ? buildTaskNotificationMessage(task, "done")
          : `Status changed to ${args.status.replace(/_/g, " ")}.`,
        repoId: task.repoId,
        projectId: task.projectId,
        actorId: ctx.userId,
      });
    }
    if (task.projectId) {
      await recomputeProjectPhase(ctx, task.projectId);
    }
    return null;
  },
});

/**
 * Detaches one user-attached file from a task and deletes its blob. Destructive
 * and irreversible: the blob is gone, so the UI confirms first. A no-op when the
 * file is already detached, which keeps double-clicks harmless.
 */
export const removeAttachment = authMutation({
  args: { taskId: v.id("agentTasks"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId)))
      throw new Error("Task not found");
    const remaining = (task.attachmentStorageIds ?? []).filter(
      (storageId) => storageId !== args.storageId,
    );
    if (remaining.length === (task.attachmentStorageIds ?? []).length)
      return null;
    await ctx.db.patch(args.taskId, {
      attachmentStorageIds: remaining,
      updatedAt: Date.now(),
    });
    await ctx.storage.delete(args.storageId);
    return null;
  },
});

/** Soft-deletes a task (row retained; hidden from lists and direct URLs). */
export const remove = authMutation({
  args: { id: v.id("agentTasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId)))
      throw new Error("Task not found");
    await softDeleteAgentTask(ctx, args.id);
    return null;
  },
});

/** Creates a single task in "todo" status, optionally assigned to a project. */
export const createQuickTask = authMutation({
  args: {
    repoId: v.id("githubRepos"),
    title: v.string(),
    description: v.optional(v.string()),
    baseBranch: v.optional(v.string()),
    model: v.optional(aiModelValidator),
    // null = Team; omitted = default to creator's personal account for model.
    providerAccountId: v.optional(
      v.union(v.id("userProviderAccounts"), v.null()),
    ),
    ...runTraitFields,
    projectId: v.optional(v.id("projects")),
    tags: v.optional(v.array(v.string())),
    assignedTo: v.optional(v.id("users")),
    priority: v.optional(priorityValidator),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
  },
  returns: v.id("agentTasks"),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId)))
      throw new Error("Not authorized");
    const repo = await ctx.db.get(args.repoId);
    if (!repo) throw new Error("Repo not found");
    const now = Date.now();
    let taskNumber: number | undefined;
    if (args.projectId) {
      const existingTasks = await ctx.db
        .query("agentTasks")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
      taskNumber = maxTaskNumberOf(existingTasks) + 1;
    }
    const project = args.projectId ? await ctx.db.get(args.projectId) : null;
    const numId = await allocateNumId(ctx.db, args.repoId, "agentTasks");
    const model = args.model ?? repo.defaultModel;
    const providerAccountId =
      args.providerAccountId === undefined
        ? await resolveDefaultProviderAccountId(ctx.db, ctx.userId, model)
        : await assertProviderAccountUsableBy(
            ctx.db,
            args.providerAccountId,
            ctx.userId,
          );
    const taskId = await ctx.db.insert("agentTasks", {
      title: args.title,
      description: args.description,
      repoId: args.repoId,
      status: "todo",
      createdAt: now,
      updatedAt: now,
      createdBy: ctx.userId,
      baseBranch: resolveNewTaskBaseBranch(args.baseBranch, repo, project),
      model,
      providerAccountId,
      reasoningLevel: args.reasoningLevel ?? repo.defaultReasoningLevel,
      thinkingEnabled: args.thinkingEnabled ?? repo.defaultThinkingEnabled,
      use1mContext: args.use1mContext ?? repo.defaultUse1mContext,
      fastMode: args.fastMode ?? repo.defaultFastMode,
      projectId: args.projectId,
      taskNumber,
      tags: normalizeTaskTags(args.tags),
      assignedTo: args.assignedTo,
      priority: args.priority,
      attachmentStorageIds: args.attachmentStorageIds,
      numId,
    });
    await createTaskRunSummary(ctx, taskId, args.repoId);
    await ensureSubscribed(ctx, taskId, ctx.userId);
    await ctx.scheduler.runAfter(0, internal.textGen.generateTaskTags, {
      taskId,
      title: args.title,
      description: args.description,
      existingTags: normalizeTaskTags(args.tags) ?? [],
    });
    if (args.assignedTo) {
      await ensureSubscribed(ctx, taskId, args.assignedTo);
    }
    if (args.assignedTo && args.assignedTo !== ctx.userId) {
      const task = await ctx.db.get(taskId);
      if (task) {
        await createNotification(ctx, {
          userId: args.assignedTo,
          type: "task_assigned",
          title: `Assigned: "${args.title}"`,
          repoId: args.repoId,
          projectId: args.projectId,
          taskId,
          message: buildTaskNotificationMessage(task, "assigned"),
        });
      }
    }
    return taskId;
  },
});

/** Creates multiple tasks at once for a given repo. */
export const createQuickTasksBatch = authMutation({
  args: {
    repoId: v.id("githubRepos"),
    tasks: v.array(
      v.object({
        title: v.string(),
        description: v.optional(v.string()),
      }),
    ),
  },
  returns: v.array(v.id("agentTasks")),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId)))
      throw new Error("Not authorized");
    const repo = await ctx.db.get(args.repoId);
    if (!repo) throw new Error("Repo not found");
    const now = Date.now();
    const taskIds: Id<"agentTasks">[] = [];
    for (const task of args.tasks) {
      const numId = await allocateNumId(ctx.db, args.repoId, "agentTasks");
      const taskId = await ctx.db.insert("agentTasks", {
        title: task.title,
        description: task.description,
        repoId: args.repoId,
        status: "todo",
        createdAt: now,
        updatedAt: now,
        createdBy: ctx.userId,
        baseBranch: repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH,
        model: repo.defaultModel,
        reasoningLevel: repo.defaultReasoningLevel,
        thinkingEnabled: repo.defaultThinkingEnabled,
        use1mContext: repo.defaultUse1mContext,
        fastMode: repo.defaultFastMode,
        numId,
      });
      await createTaskRunSummary(ctx, taskId, args.repoId);
      await ensureSubscribed(ctx, taskId, ctx.userId);
      taskIds.push(taskId);
    }
    return taskIds;
  },
});

/** Assigns one or more existing tasks to a project with sequential task numbers. */
export const assignToProject = authMutation({
  args: {
    taskIds: v.array(v.id("agentTasks")),
    projectId: v.id("projects"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || !(await hasRepoAccess(ctx.db, project.repoId, ctx.userId)))
      throw new Error("Project not found");
    if (args.taskIds.length === 0) {
      throw new Error("At least one task is required");
    }
    const existingProjectTaskIds = new Set<string>();
    const existingTasks = await ctx.db
      .query("agentTasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    let maxTaskNumber = 0;
    for (const t of existingTasks) {
      existingProjectTaskIds.add(t._id);
      if (t.taskNumber !== undefined && t.taskNumber > maxTaskNumber) {
        maxTaskNumber = t.taskNumber;
      }
    }
    let assigned = 0;
    for (const taskId of args.taskIds) {
      if (existingProjectTaskIds.has(taskId)) continue;
      const task = await ctx.db.get(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      assigned++;
      await ctx.db.patch(taskId, {
        projectId: args.projectId,
        taskNumber: maxTaskNumber + assigned,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

/** Creates multiple tasks with inter-task dependencies and optionally wraps them in a new project. */
export const createBatchWithDependencies = authMutation({
  args: {
    repoId: v.id("githubRepos"),
    tasks: v.array(
      v.object({
        title: v.string(),
        description: v.optional(v.string()),
        dependsOn: v.optional(v.array(v.number())),
      }),
    ),
    projectTitle: v.optional(v.string()),
    baseBranch: v.optional(v.string()),
    model: v.optional(aiModelValidator),
  },
  returns: v.object({
    taskIds: v.array(v.id("agentTasks")),
    projectId: v.optional(v.id("projects")),
  }),
  handler: async (ctx, args) => {
    if (args.tasks.length === 0) {
      throw new Error("At least one task is required");
    }
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId)))
      throw new Error("Not authorized");
    const repo = await ctx.db.get(args.repoId);
    if (!repo) throw new Error("Repo not found");

    const now = Date.now();
    const baseBranch =
      args.baseBranch ?? repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH;
    const model = args.model ?? repo.defaultModel;

    const taskIds: Id<"agentTasks">[] = [];
    for (let i = 0; i < args.tasks.length; i++) {
      const task = args.tasks[i];
      const numId = await allocateNumId(ctx.db, args.repoId, "agentTasks");
      const taskId = await ctx.db.insert("agentTasks", {
        title: task.title,
        description: task.description,
        repoId: args.repoId,
        taskNumber: i + 1,
        status: "todo",
        createdAt: now,
        updatedAt: now,
        createdBy: ctx.userId,
        baseBranch,
        model,
        reasoningLevel: repo.defaultReasoningLevel,
        thinkingEnabled: repo.defaultThinkingEnabled,
        use1mContext: repo.defaultUse1mContext,
        fastMode: repo.defaultFastMode,
        numId,
      });
      await createTaskRunSummary(ctx, taskId, args.repoId);
      await ensureSubscribed(ctx, taskId, ctx.userId);
      taskIds.push(taskId);
    }

    for (let i = 0; i < args.tasks.length; i++) {
      const deps = args.tasks[i].dependsOn;
      if (!deps) continue;
      for (const depIndex of deps) {
        if (depIndex < 0 || depIndex >= args.tasks.length) {
          throw new Error(`Task ${i} has invalid dependency index ${depIndex}`);
        }
        if (depIndex === i) {
          throw new Error(`Task ${i} cannot depend on itself`);
        }
        await ctx.db.insert("taskDependencies", {
          taskId: taskIds[i],
          dependsOnId: taskIds[depIndex],
        });
      }
    }

    let projectId: Id<"projects"> | undefined;
    if (args.projectTitle) {
      const projectNumId = await allocateNumId(ctx.db, args.repoId, "projects");
      projectId = await ctx.db.insert("projects", {
        repoId: args.repoId,
        userId: ctx.userId,
        title: args.projectTitle,
        rawInput: args.projectTitle,
        phase: "business_review",
        planningMode: "tasks_only",
        baseBranch,
        projectStartDate: now,
        numId: projectNumId,
      });
      await ctx.db.patch(projectId, {
        branchName: buildProjectBranchName(projectId),
      });
      for (const taskId of taskIds) {
        await ctx.db.patch(taskId, { projectId });
      }
    }

    return { taskIds, projectId };
  },
});

/** Reorders tasks within a project by reassigning task numbers. */
export const reorderProjectTasks = authMutation({
  args: {
    projectId: v.id("projects"),
    taskIds: v.array(v.id("agentTasks")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || !(await hasRepoAccess(ctx.db, project.repoId, ctx.userId)))
      throw new Error("Project not found");
    const now = Date.now();
    const existingNumbers: number[] = [];
    for (const taskId of args.taskIds) {
      const task = await ctx.db.get(taskId);
      existingNumbers.push(task?.taskNumber ?? 0);
    }
    const sortedNumbers = [...existingNumbers].sort((a, b) => a - b);
    for (let i = 0; i < args.taskIds.length; i++) {
      await ctx.db.patch(args.taskIds[i], {
        taskNumber: sortedNumbers[i],
        updatedAt: now,
      });
    }
    return null;
  },
});

/** Soft-deletes a task and all tasks that transitively depend on it. */
export const deleteCascade = authMutation({
  args: { id: v.id("agentTasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId)))
      throw new Error("Task not found");
    const tasksToDelete: Id<"agentTasks">[] = [args.id];
    const collectDependents = async (taskId: Id<"agentTasks">) => {
      const dependents = await ctx.db
        .query("taskDependencies")
        .withIndex("by_dependency", (q) => q.eq("dependsOnId", taskId))
        .collect();
      for (const dep of dependents) {
        if (!tasksToDelete.includes(dep.taskId)) {
          tasksToDelete.push(dep.taskId);
          await collectDependents(dep.taskId);
        }
      }
    };
    await collectDependents(args.id);
    for (const taskId of tasksToDelete) {
      await softDeleteAgentTask(ctx, taskId);
    }
    return null;
  },
});

/**
 * Sticky sandbox-chat traits (effort / thinking / 1M). No `updatedAt` bump.
 * Only provided fields are patched.
 */
export const setTraits = authMutation({
  args: {
    id: v.id("agentTasks"),
    reasoningLevel: v.optional(reasoningLevelValidator),
    thinkingEnabled: v.optional(v.boolean()),
    use1mContext: v.optional(v.boolean()),
    fastMode: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId))) {
      throw new Error("Task not found");
    }
    if (
      args.reasoningLevel === undefined &&
      args.thinkingEnabled === undefined &&
      args.use1mContext === undefined &&
      args.fastMode === undefined
    ) {
      return null;
    }
    await ctx.db.patch(args.id, {
      ...(args.reasoningLevel !== undefined
        ? { lastReasoningLevel: args.reasoningLevel }
        : {}),
      ...(args.thinkingEnabled !== undefined
        ? { lastThinkingEnabled: args.thinkingEnabled }
        : {}),
      ...(args.use1mContext !== undefined
        ? { lastUse1mContext: args.use1mContext }
        : {}),
      ...(args.fastMode !== undefined ? { lastFastMode: args.fastMode } : {}),
    });
    return null;
  },
});
