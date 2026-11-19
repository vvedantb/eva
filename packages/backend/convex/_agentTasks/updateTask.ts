import { v, type ObjectType } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { aiModelValidator, priorityValidator } from "../validators";
import { createNotification } from "../notifications";
import { ensureSubscribed } from "../taskSubscribers";
import { logTaskActivity } from "../taskActivity";
import { schedulePrTitleSync } from "../_github/prTitleSync";
import { findPrimaryPullRequest } from "../_pullRequests/store";
import {
  assertProviderAccountUsableBy,
  reconcileProviderAccountForModel,
} from "../_userProviderAccounts/defaults";
import {
  normalizeTaskTags,
  buildTaskNotificationMessage,
  runTraitFields,
} from "./helpers";

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
  model: v.optional(aiModelValidator),
  // null = clear to team credentials. undefined = no change.
  providerAccountId: v.optional(
    v.union(v.id("userProviderAccounts"), v.null()),
  ),
  ...runTraitFields,
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

/** Builds the patch for `update`. Reads only; throws on a bad provider account. */
export async function buildTaskUpdates(
  ctx: AuthMutationCtx,
  task: Doc<"agentTasks">,
  args: UpdateTaskArgs,
): Promise<TaskUpdates> {
  const updates: TaskUpdates = { updatedAt: Date.now() };
  await applyProjectUpdate(ctx, task, args, updates);
  // After the project move, so an explicit taskNumber still wins.
  applyPlainFieldUpdates(args, updates);
  await applyProviderAccountUpdate(ctx, task, args, updates);
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
  if (args.model !== undefined) updates.model = args.model;
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
}

async function applyProviderAccountUpdate(
  ctx: AuthMutationCtx,
  task: Doc<"agentTasks">,
  args: UpdateTaskArgs,
  updates: TaskUpdates,
): Promise<void> {
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
}

/** Logs one activity entry per changed field, in a fixed field order. */
export async function logTaskUpdateActivity(
  ctx: AuthMutationCtx,
  task: Doc<"agentTasks">,
  args: UpdateTaskArgs,
): Promise<void> {
  await logTitleChange(ctx, task, args);
  await logDetailChanges(ctx, task, args);
  await logTagsModelBranchChanges(ctx, task, args);
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
  // A project task's PR carries the project's title, not the task's.
  const primaryPr = task.projectId
    ? null
    : await findPrimaryPullRequest(ctx.db, {
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

async function logTagsModelBranchChanges(
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
