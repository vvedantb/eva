import { v, type ObjectType } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { priorityValidator } from "../validators";
import { createNotification } from "../notifications";
import { ensureSubscribed } from "../taskSubscribers";
import { logTaskActivity } from "../taskActivity";
import { schedulePrTitleSync } from "../_github/prTitleSync";
import { findPrimaryPullRequest } from "../_pullRequests/store";
import { normalizeTaskTags, buildTaskNotificationMessage } from "./helpers";

/** Args for `agentTasks.update`. */
export const updateTaskArgs = {
  id: v.id("agentTasks"),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  repoId: v.optional(v.id("githubRepos")),
  projectId: v.optional(v.union(v.id("projects"), v.null())),
  tags: v.optional(v.array(v.string())),
  taskNumber: v.optional(v.number()),
  assignedTo: v.optional(v.union(v.id("users"), v.null())),
  baseBranch: v.optional(v.string()),
  priority: v.optional(v.union(priorityValidator, v.null())),
};

type UpdateTaskArgs = ObjectType<typeof updateTaskArgs>;
type AuthMutationCtx = MutationCtx & { userId: Id<"users"> };
type TaskUpdates = Partial<Doc<"agentTasks">>;

/** Highest taskNumber among a project's tasks, or 0 if none are numbered. */
export function maxTaskNumberOf(tasks: Doc<"agentTasks">[]): number {
  let max = 0;
  for (const t of tasks) {
    if (t.taskNumber !== undefined && t.taskNumber > max) {
      max = t.taskNumber;
    }
  }
  return max;
}

/** Builds the patch for `update`. Reads only. The model lives on the task's chat. */
export async function buildTaskUpdates(
  ctx: AuthMutationCtx,
  task: Doc<"agentTasks">,
  args: UpdateTaskArgs,
): Promise<TaskUpdates> {
  const updates: TaskUpdates = { updatedAt: Date.now() };
  await applyProjectUpdate(ctx, task, args, updates);
  applyPlainFieldUpdates(args, updates);
  return updates;
}

async function applyProjectUpdate(
  ctx: AuthMutationCtx,
  task: Doc<"agentTasks">,
  args: UpdateTaskArgs,
  updates: TaskUpdates,
): Promise<void> {
  if (args.projectId === undefined) return;
  const newProjectId = args.projectId ?? undefined;
  updates.projectId = newProjectId;
  if (newProjectId && newProjectId !== task.projectId) {
    const existingTasks = await ctx.db
      .query("agentTasks")
      .withIndex("by_project", (q) => q.eq("projectId", newProjectId))
      .collect();
    updates.taskNumber = maxTaskNumberOf(existingTasks) + 1;
  }
}

function applyPlainFieldUpdates(
  args: UpdateTaskArgs,
  updates: TaskUpdates,
): void {
  if (args.title !== undefined) updates.title = args.title;
  if (args.description !== undefined) updates.description = args.description;
  if (args.repoId !== undefined) updates.repoId = args.repoId;
  if (args.tags !== undefined) updates.tags = normalizeTaskTags(args.tags);
  if (args.taskNumber !== undefined) updates.taskNumber = args.taskNumber;
  if (args.assignedTo !== undefined)
    updates.assignedTo = args.assignedTo ?? undefined;
  if (args.baseBranch !== undefined) updates.baseBranch = args.baseBranch;
  if (args.priority !== undefined)
    updates.priority = args.priority ?? undefined;
}

/** Logs one activity entry per changed field, in a fixed field order. */
export async function logTaskUpdateActivity(
  ctx: AuthMutationCtx,
  task: Doc<"agentTasks">,
  args: UpdateTaskArgs,
): Promise<void> {
  await logTitleChange(ctx, task, args);
  await logDetailChanges(ctx, task, args);
  await logTagsBranchChanges(ctx, task, args);
}

async function logTitleChange(
  ctx: AuthMutationCtx,
  task: Doc<"agentTasks">,
  args: UpdateTaskArgs,
): Promise<void> {
  if (args.title === undefined || args.title === task.title) return;
  await logTaskActivity(
    ctx,
    args.id,
    ctx.userId,
    "title",
    task.title,
    args.title,
  );
  const primaryPr = await findPrimaryPullRequest(ctx.db, {
    kind: "task",
    taskId: args.id,
  });
  if (primaryPr) {
    await schedulePrTitleSync(ctx, {
      repoId: primaryPr.repoId,
      prUrl: primaryPr.prUrl,
      title: args.title,
    });
  }
}

async function logDetailChanges(
  ctx: AuthMutationCtx,
  task: Doc<"agentTasks">,
  args: UpdateTaskArgs,
): Promise<void> {
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
}

async function logTagsBranchChanges(
  ctx: AuthMutationCtx,
  task: Doc<"agentTasks">,
  args: UpdateTaskArgs,
): Promise<void> {
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
}

/** Subscribes and notifies a newly assigned user. */
export async function notifyTaskAssignee(
  ctx: AuthMutationCtx,
  task: Doc<"agentTasks">,
  args: UpdateTaskArgs,
): Promise<void> {
  if (args.assignedTo === undefined || args.assignedTo === task.assignedTo)
    return;
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
