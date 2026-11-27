import { ConvexError, v, type ObjectType } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  taskStatusValidator,
  aiModelValidator,
  priorityValidator,
} from "../validators";
import { createNotification } from "../notifications";
import { ensureSubscribed, notifySubscribers } from "../taskSubscribers";
import {
  assertProjectNotArchived,
  assertTaskNotArchived,
  authMutation,
  getProjectWithAccess,
  getRepoWithAccess,
  hasRepoAccess,
  hasTaskAccess,
  archiveAgentTask,
  normalizeIdOrThrow,
  onProjectTasksChanged,
} from "../functions";
import { allocateNumId } from "../numId";
import {
  normalizeTaskTags,
  buildTaskNotificationMessage,
  runTraitFields,
} from "./helpers";
import { resolveNewTaskBaseBranch } from "../_taskWorkflow/resolveBaseBranch";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { logTaskActivity } from "../taskActivity";
import {
  assertProviderAccountUsableBy,
  resolveDefaultProviderAccountId,
} from "../_userProviderAccounts/defaults";
import { createTaskRunSummary, moveTaskRunSummary } from "./runSummary";
import { cancelTaskRunSchedule } from "./runState";
import {
  detachOwnedSession,
  isTerminalTaskStatus,
  mirrorOwnerIntoSession,
  retireOwnedSession,
  reviveOwnedSession,
  syncOwnedSessionWithTaskStatus,
  taskMoveDetachesSession,
} from "../_sessions/ownedSession";
import { findOwnedSession } from "../_sessions/owner";
import {
  applyPrLifecycleTransition,
  findPrimaryPullRequest,
} from "../_pullRequests/store";
import {
  selectPrLifecycleTransition,
} from "../_github/prLifecycleActions";
import {
  buildTaskUpdates,
  logTaskUpdateActivity,
  maxTaskNumberOf,
  notifyTaskAssignee,
  updateTaskArgs,
} from "./updateTask";
import { closeTaskReports } from "../_projects/reports";
import { initialTitle, scheduleGeneratedTitle } from "../_shared/ownerTitle";
import { startTaskExecution } from "./execution";

const STATUS_CHANGE_NOTIFY: ReadonlySet<string> = new Set([
  "code_review",
  "business_review",
  "done",
  "cancelled",
]);

/** Updates editable fields on an agent task and notifies on assignment changes. */
export const update = authMutation({
  args: updateTaskArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId)))
      throw new Error("Task not found");
    await assertTaskNotArchived(ctx.db, task);
    if (args.repoId !== undefined && args.repoId !== task.repoId) {
      await getRepoWithAccess(ctx.db, args.repoId, ctx.userId);
    }
    if (args.projectId && args.projectId !== task.projectId) {
      assertProjectNotArchived(
        await getProjectWithAccess(ctx.db, args.projectId, ctx.userId),
      );
    }
    const updates = await buildTaskUpdates(ctx, task, args);
    if (taskMoveDetachesSession(task, args)) {
      await detachOwnedSession(ctx, task._id);
    }
    await ctx.db.patch(args.id, updates);
    await mirrorOwnerIntoSession(ctx, {
      kind: "task",
      task: { ...task, ...updates },
    });
    if (args.repoId !== undefined && args.repoId !== task.repoId) {
      await moveTaskRunSummary(ctx, args.id, args.repoId);
    }
    await logTaskUpdateActivity(ctx, task, args);
    await notifyTaskAssignee(ctx, task, args);
    return null;
  },
});

/** Transitions a task to a new status and notifies on completion. */
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
    await assertTaskNotArchived(ctx.db, task);
      if (args.status !== "todo") await cancelTaskRunSchedule(ctx, args.id);
    const previousStatus = task.status;
    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
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
    await syncOwnedSessionWithTaskStatus(
      ctx,
      task,
      previousStatus,
      args.status,
    );

    const enteringCodeReview =
      args.status === "code_review" && previousStatus !== "code_review";
    const enteringCancelled =
      args.status === "cancelled" && previousStatus !== "cancelled";
    if (enteringCancelled) await closeTaskReports(ctx, task._id);
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
      task.repoId &&
      (enteringCodeReview ||
        leavingCodeReview ||
        enteringCancelled ||
        leavingCancelled)
    ) {
      const owner = { kind: "task" as const, taskId: args.id };
      const primaryPr = await findPrimaryPullRequest(ctx.db, owner);
      const prUrl = primaryPr?.prUrl;
      const repo = await ctx.db.get(task.repoId);
      const transition = selectPrLifecycleTransition({
        enteringCancelled,
        leavingCancelled,
        enteringCodeReview,
        leavingCodeReview,
        asReadyOnReopen: args.status === "code_review",
      });
      if (transition) {
        await applyPrLifecycleTransition(ctx, owner, transition);
      }

      const session = await findOwnedSession(ctx.db, {
        kind: "task",
        taskId: task._id,
      });
      const sandboxId = session?.sandboxId;
      const sandboxActive = session?.status === "active";
      if (enteringCodeReview && prUrl && repo && sandboxId) {
        await ctx.scheduler.runAfter(0, internal.github.generatePrDescription, {
          installationId: repo.installationId,
          repoOwner: repo.owner,
          repoName: repo.name,
          prUrl,
          sandboxId,
          repoId: task.repoId,
          restoreStoppedSandbox: !sandboxActive,
        });
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
      await onProjectTasksChanged(ctx, task.projectId);
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
    await assertTaskNotArchived(ctx.db, task);
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

/**
 * Archives a task: hidden from lists, its page still opens read-only. Cancels
 * its scheduled run and retires its session (sandbox stopped).
 */
export const archive = authMutation({
  args: { id: v.id("agentTasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId)))
      throw new Error("Task not found");
    if (task.status === "draft") throw new ConvexError("Delete the draft instead");
    await archiveAgentTask(ctx, args.id);
    await retireOwnedSession(ctx, { kind: "task", taskId: args.id });
    if (task.projectId) await onProjectTasksChanged(ctx, task.projectId);
    return null;
  },
});

/**
 * Brings an archived task back to the lists it left. A cancelled scheduled
 * run stays cancelled. A live task gets its session back; a done or cancelled
 * task's session stays retired with its status.
 */
export const unarchive = authMutation({
  args: { id: v.id("agentTasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId)))
      throw new Error("Task not found");
    if (task.archivedAt === undefined) return null;
    await ctx.db.patch(args.id, {
      archivedAt: undefined,
      updatedAt: Date.now(),
    });
    if (!isTerminalTaskStatus(task.status)) {
      await reviveOwnedSession(ctx, { kind: "task", taskId: task._id });
    }
    if (task.projectId) await onProjectTasksChanged(ctx, task.projectId);
    return null;
  },
});

const newTaskFields = {
  repoId: v.id("githubRepos"),
  baseBranch: v.optional(v.string()),
  model: v.optional(aiModelValidator),
  providerAccountId: v.optional(
    v.union(v.id("userProviderAccounts"), v.null()),
  ),
  ...runTraitFields,
  projectId: v.optional(v.id("projects")),
  tags: v.optional(v.array(v.string())),
  assignedTo: v.optional(v.id("users")),
  priority: v.optional(priorityValidator),
  attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
};

type NewTodoTask = ObjectType<typeof newTaskFields> & {
  title?: string;
  description?: string;
  phaseLabel?: string;
  linkedRepoIds?: Id<"githubRepos">[];
};

/**
 * Creates one `todo` task, in a project when `projectId` is set (next
 * `taskNumber`; the repo may be any the user can access).
 * The one insert for `createQuickTask`, agents' `create_task` and the
 * coordinator's tasks (`_projects/batches.ts`).
 */
export async function createTodoTask(
  ctx: MutationCtx & { userId: Id<"users"> },
  args: NewTodoTask,
  options: {
    approved: boolean;
  },
): Promise<Id<"agentTasks">> {
  if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId)))
    throw new Error("Not authorized");
  const repo = await ctx.db.get(args.repoId);
  if (!repo) throw new Error("Repo not found");
  const { title, generate } = initialTitle(args.title, args.description);
  const now = Date.now();
  if (args.projectId) {
    await getProjectWithAccess(ctx.db, args.projectId, ctx.userId);
  }
  let taskNumber: number | undefined;
  if (args.projectId) {
    const existingTasks = await ctx.db
      .query("agentTasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    taskNumber = maxTaskNumberOf(existingTasks) + 1;
  }
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
    title,
    description: args.description,
    repoId: args.repoId,
    ...(args.linkedRepoIds !== undefined && args.linkedRepoIds.length > 0
      ? { linkedRepoIds: args.linkedRepoIds }
      : {}),
    status: "todo",
    createdAt: now,
    updatedAt: now,
    createdBy: ctx.userId,
    baseBranch: resolveNewTaskBaseBranch(args.baseBranch, repo),
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
    phaseLabel:
      args.projectId !== undefined ? args.phaseLabel?.trim() || undefined : undefined,
    approvedAt:
      args.projectId !== undefined && options.approved ? now : undefined,
    numId,
  });
  await createTaskRunSummary(ctx, taskId, args.repoId);
  await ensureSubscribed(ctx, taskId, ctx.userId);
  if (generate) {
    await scheduleGeneratedTitle(
      ctx,
      { kind: "task", taskId },
      args.description ?? "",
      title,
    );
  }
  if (args.projectId !== undefined && options.approved) {
    await ctx.scheduler.runAfter(
      0,
      internal.buildWorkflow.scheduleReadyTasks,
      { projectId: args.projectId },
    );
  }
  await ctx.scheduler.runAfter(0, internal.textGen.generateTaskTags, {
    taskId,
    title,
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
        title: `Assigned: "${title}"`,
        repoId: args.repoId,
        projectId: args.projectId,
        taskId,
        message: buildTaskNotificationMessage(task, "assigned"),
      });
    }
  }
  return taskId;
}

/**
 * Creates a task from a person's prompt; the title comes from it. "Save"
 * files it in To Do, or a project's Triage. "Save and Run" (`run`) starts
 * it: a project task is approved, so the project's scheduler runs it; any
 * other task starts now.
 */
export const createQuickTask = authMutation({
  args: {
    ...newTaskFields,
    description: v.string(),
    run: v.optional(v.boolean()),
  },
  returns: v.id("agentTasks"),
  handler: async (ctx, args) => {
    const { run, ...fields } = args;
    const taskId = await createTodoTask(ctx, fields, {
      approved: run === true,
    });
    if (run && args.projectId === undefined) {
      await startTaskExecution(ctx, taskId);
    }
    return taskId;
  },
});

/**
 * An agent's `create_task` / `create_and_run_task` outside a project's
 * coordinator (`mcp/tools.ts`): as `createQuickTask`, with the agent's own
 * title when it gives one. A project task waits in Triage for a person.
 */
export const createAgentTask = internalMutation({
  args: {
    userId: v.string(),
    repoId: v.string(),
    projectId: v.optional(v.string()),
    title: v.optional(v.string()),
    description: v.string(),
    baseBranch: v.optional(v.string()),
    phaseLabel: v.optional(v.string()),
  },
  returns: v.id("agentTasks"),
  handler: async (ctx, args) => {
    const userId = normalizeIdOrThrow(ctx.db, "users", args.userId, "User");
    return await createTodoTask(
      { ...ctx, userId },
      {
        repoId: normalizeIdOrThrow(ctx.db, "githubRepos", args.repoId, "Repo"),
        projectId:
          args.projectId === undefined
            ? undefined
            : normalizeIdOrThrow(ctx.db, "projects", args.projectId, "Project"),
        title: args.title,
        description: args.description,
        baseBranch: args.baseBranch,
        phaseLabel: args.phaseLabel,
      },
      { approved: false },
    );
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
    assertProjectNotArchived(
      await getProjectWithAccess(ctx.db, args.projectId, ctx.userId),
    );
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
      if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId)))
        throw new Error(`Task ${taskId} not found`);
      await assertTaskNotArchived(ctx.db, task);
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

/** Creates multiple tasks and optionally wraps them in a new project. */
export const createTasksBatch = authMutation({
  args: {
    repoId: v.id("githubRepos"),
    tasks: v.array(
      v.object({
        title: v.optional(v.string()),
        description: v.optional(v.string()),
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
      const { title, generate } = initialTitle(task.title, task.description);
      const numId = await allocateNumId(ctx.db, args.repoId, "agentTasks");
      const taskId = await ctx.db.insert("agentTasks", {
        title,
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
      if (generate) {
        await scheduleGeneratedTitle(
          ctx,
          { kind: "task", taskId },
          task.description ?? "",
          title,
        );
      }
      taskIds.push(taskId);
    }

    let projectId: Id<"projects"> | undefined;
    if (args.projectTitle) {
      const projectNumId = await allocateNumId(ctx.db, args.repoId, "projects");
      projectId = await ctx.db.insert("projects", {
        repoId: args.repoId,
        userId: ctx.userId,
        title: args.projectTitle,
        rawInput: args.projectTitle,
        baseBranch,
        projectStartDate: now,
        numId: projectNumId,
      });
      for (const taskId of taskIds) {
        await ctx.db.patch(taskId, { projectId });
      }
      await onProjectTasksChanged(ctx, projectId);
    }

    return { taskIds, projectId };
  },
});
