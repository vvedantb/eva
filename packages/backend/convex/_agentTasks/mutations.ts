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
import { resolveNewTaskBaseBranch } from "../_agentTasks/resolveBaseBranch";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { logTaskActivity } from "../taskActivity";
import { createTaskRunSummary, moveTaskRunSummary } from "./runSummary";
import { seedNewTaskChat } from "./taskChatSeed";
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
import { handTasksToCoordinator } from "../_projects/scheduler";
import { initialTitle, scheduleGeneratedTitle } from "../_shared/ownerTitle";
import { startTaskExecution } from "./execution";

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
  args: updateTaskArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId)))
      throw new Error("Task not found");
    await assertTaskNotArchived(ctx.db, task);
    // Moving a task needs access to where it lands, not only where it is.
    if (args.repoId !== undefined && args.repoId !== task.repoId) {
      await getRepoWithAccess(ctx.db, args.repoId, ctx.userId);
    }
    if (args.projectId && args.projectId !== task.projectId) {
      assertProjectNotArchived(
        await getProjectWithAccess(ctx.db, args.projectId, ctx.userId),
      );
    }
    const updates = await buildTaskUpdates(ctx, task, args);
    // A task moved to another repo gets a fresh session there; moving into
    // a project keeps its own session (`workSessionOwner`).
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
    // A task moved into a project goes to its coordinator, unless it started.
    if (args.projectId && args.projectId !== task.projectId) {
      await handTasksToCoordinator(ctx, args.projectId, [task._id]);
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
    // Only a todo task runs from a schedule, so leaving todo drops it.
    if (args.status !== "todo") await cancelTaskRunSchedule(ctx, args.id);
    const previousStatus = task.status;
    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
    });
    // A project task back in todo that nobody approved goes to the coordinator.
    if (task.projectId !== undefined && args.status === "todo") {
      await handTasksToCoordinator(ctx, task.projectId, [task._id]);
    }

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

    // Sync the task's GitHub PR state (a quick task's or a project child
    // task's: each owns its PR).
    //   entering code_review → mark PR ready for review
    //   leaving code_review (not to done/cancelled) → convert PR back to draft
    //   entering cancelled → close PR (mirrors the PR-closed → task-cancelled webhook)
    //   leaving cancelled (not to done) → reopen PR; ready for code_review, draft otherwise
    const enteringCodeReview =
      args.status === "code_review" && previousStatus !== "code_review";
    const enteringCancelled =
      args.status === "cancelled" && previousStatus !== "cancelled";
    // A cancelled task's open question to its coordinator closes with it.
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

      // Write the reviewer-facing description here rather than at the end of
      // every run: this is the moment the work is offered for review, so the
      // diff is final and it costs one model call per review instead of one
      // per run (mirrors a session's "Send for review"). Scheduled, not
      // awaited, and best-effort — a failure leaves the static PR body in
      // place. The run stops the sandbox on its way out, so the action resumes
      // it for the model call and stops it again unless the reviewer already
      // has it open.
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
    // A draft is unsent text: `deleteDraft` deletes it.
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

/** A new task's fields, apart from its title and prompt. */
const newTaskFields = {
  repoId: v.id("githubRepos"),
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
};

/**
 * What `createTodoTask` makes a task from. People's forms send the prompt
 * (`description`) alone and the title comes from it (`initialTitle`); agents
 * (MCP, the coordinator) may pass their own `title`.
 */
type NewTodoTask = ObjectType<typeof newTaskFields> & {
  title?: string;
  description?: string;
  /** A project task's phase label (`agentTasks.phaseLabel`). */
  phaseLabel?: string;
  /** Repos besides `repoId` (`agentTasks.linkedRepoIds`); the caller checks access. */
  linkedRepoIds?: Id<"githubRepos">[];
};

/**
 * Creates one `todo` task, in a project when `projectId` is set (next
 * `taskNumber`; the repo may be any the user can access).
 * The one insert for `createQuickTask`, agents' `create_task` and the
 * coordinator's tasks (`_projects/batches.ts`). A project task either starts
 * (`start`: approved, the scheduler runs it) or goes to the project's
 * coordinator at once (`handTasksToCoordinator`), which starts it or adds it
 * to an open task.
 */
export async function createTodoTask(
  ctx: MutationCtx & { userId: Id<"users"> },
  args: NewTodoTask,
  options: {
    /** A project task starts at once; else it is handed to the coordinator. */
    start: boolean;
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
    projectId: args.projectId,
    taskNumber,
    tags: normalizeTaskTags(args.tags),
    assignedTo: args.assignedTo,
    priority: args.priority,
    attachmentStorageIds: args.attachmentStorageIds,
    phaseLabel:
      args.projectId !== undefined ? args.phaseLabel?.trim() || undefined : undefined,
    approvedAt:
      args.projectId !== undefined && options.start ? now : undefined,
    numId,
  });
  await createTaskRunSummary(ctx, taskId, args.repoId);
  await seedNewTaskChat(ctx, taskId, repo, args);
  await ensureSubscribed(ctx, taskId, ctx.userId);
  if (generate) {
    await scheduleGeneratedTitle(
      ctx,
      { kind: "task", taskId },
      args.description ?? "",
      title,
    );
  }
  if (args.projectId !== undefined) {
    if (options.start) {
      await ctx.scheduler.runAfter(
        0,
        internal.buildWorkflow.scheduleReadyTasks,
        { projectId: args.projectId },
      );
    } else {
      await handTasksToCoordinator(ctx, args.projectId, [taskId]);
    }
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
 * files it in To Do, or hands a project task to the project's coordinator.
 * "Save and Run" (`run`) starts it: a project task is approved, so the
 * project's scheduler runs it; any other task starts now.
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
      start: run === true,
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
 * title when it gives one. A project task starts when `run` (its project's
 * scheduler runs it), else it goes to the project's coordinator.
 */
export const createAgentTask = internalMutation({
  args: {
    userId: v.string(),
    run: v.boolean(),
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
      { start: args.run },
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
    const moved: Id<"agentTasks">[] = [];
    for (const taskId of args.taskIds) {
      if (existingProjectTaskIds.has(taskId)) continue;
      const task = await ctx.db.get(taskId);
      if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId)))
        throw new Error(`Task ${taskId} not found`);
      await assertTaskNotArchived(ctx.db, task);
      moved.push(taskId);
      await ctx.db.patch(taskId, {
        projectId: args.projectId,
        taskNumber: maxTaskNumber + moved.length,
        updatedAt: Date.now(),
      });
    }
    // A moved task that has not started goes to the coordinator at once.
    await handTasksToCoordinator(ctx, args.projectId, moved);
    return null;
  },
});

/** Creates multiple tasks and optionally wraps them in a new project. */
export const createTasksBatch = authMutation({
  args: {
    repoId: v.id("githubRepos"),
    /** A task without a title takes one from its description (`initialTitle`). */
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
        numId,
      });
      await createTaskRunSummary(ctx, taskId, args.repoId);
      // Without a pick the chat starts on the repo's defaults when first needed.
      if (args.model !== undefined) {
        await seedNewTaskChat(ctx, taskId, repo, { model: args.model });
      }
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
      await handTasksToCoordinator(ctx, projectId, taskIds);
      await onProjectTasksChanged(ctx, projectId);
    }

    return { taskIds, projectId };
  },
});
