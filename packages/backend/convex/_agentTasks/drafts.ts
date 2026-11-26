import { v } from "convex/values";
import { aiModelValidator } from "../validators";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  authQuery,
  authMutation,
  getProjectWithAccess,
  hasRepoAccess,
  hasTaskAccess,
  onProjectTasksChanged,
} from "../functions";
import { allocateNumId } from "../numId";
import { createNotification } from "../notifications";
import { ensureSubscribed } from "../taskSubscribers";
import {
  agentTaskValidator,
  normalizeTaskTags,
  buildTaskNotificationMessage,
  runTraitFields,
} from "./helpers";
import { resolveNewTaskBaseBranch } from "../_agentTasks/resolveBaseBranch";
import { createTaskRunSummary } from "./runSummary";
import { seedNewTaskChat } from "./taskChatSeed";
import { startTaskExecution } from "./execution";
import { handTasksToCoordinator } from "../_projects/scheduler";
import { initialTitle, scheduleGeneratedTitle } from "../_shared/ownerTitle";
import { titleFromPrompt } from "@eva/shared";

/**
 * The user's drafts in a repo. A draft is never archived (`deleteDraft`
 * deletes it), so `archivedAt` is only the index prefix; `createdBy` is in the
 * range so other users' drafts are never read.
 */
function myLiveDrafts(
  db: QueryCtx["db"],
  repoId: Id<"githubRepos">,
  userId: Id<"users">,
) {
  return db
    .query("agentTasks")
    .withIndex("by_repo_status_archived_and_creator", (q) =>
      q
        .eq("repoId", repoId)
        .eq("status", "draft")
        .eq("archivedAt", undefined)
        .eq("createdBy", userId),
    )
    .collect();
}

/** Lists all draft tasks for the current user in a given repo, sorted by most recently updated. */
export const listDrafts = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(agentTaskValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const drafts = await myLiveDrafts(ctx.db, args.repoId, ctx.userId);
    return drafts.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

/** Counts draft tasks for the current user in a repo (badge path — no full docs). */
export const countDrafts = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.number(),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return 0;
    return (await myLiveDrafts(ctx.db, args.repoId, ctx.userId)).length;
  },
});

/**
 * Creates or updates a draft task from the form's prompt (`description`).
 * Returns the task ID. Its title is the prompt's first line, which the
 * Drafts lists show.
 */
export const saveDraft = authMutation({
  args: {
    id: v.optional(v.id("agentTasks")),
    repoId: v.id("githubRepos"),
    description: v.optional(v.string()),
    baseBranch: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
  },
  returns: v.id("agentTasks"),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId)))
      throw new Error("Not authorized");

    const repo = await ctx.db.get(args.repoId);
    if (!repo) throw new Error("Repo not found");
    if (args.projectId) {
      await getProjectWithAccess(ctx.db, args.projectId, ctx.userId);
    }

    const now = Date.now();

    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (
        !existing ||
        existing.createdBy !== ctx.userId ||
        existing.status !== "draft"
      )
        throw new Error("Draft not found");
      await ctx.db.patch(args.id, {
        title: titleFromPrompt(args.description ?? ""),
        description: args.description,
        baseBranch: args.baseBranch,
        attachmentStorageIds: args.attachmentStorageIds,
        updatedAt: now,
      });
      return args.id;
    }

    const draftId = await ctx.db.insert("agentTasks", {
      title: titleFromPrompt(args.description ?? ""),
      description: args.description,
      attachmentStorageIds: args.attachmentStorageIds,
      repoId: args.repoId,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      createdBy: ctx.userId,
      baseBranch: resolveNewTaskBaseBranch(args.baseBranch, repo),
      projectId: args.projectId,
      numId: await allocateNumId(ctx.db, args.repoId, "agentTasks"),
    });
    await createTaskRunSummary(ctx, draftId, args.repoId);
    await ensureSubscribed(ctx, draftId, ctx.userId);
    return draftId;
  },
});

/**
 * Promotes a draft task to "todo" from the form's prompt, as
 * `createQuickTask`: the title comes from the prompt, and `run` ("Save and
 * Run") approves a project task or starts any other task now. A saved
 * project task goes to the project's coordinator.
 */
export const activateDraft = authMutation({
  args: {
    id: v.id("agentTasks"),
    description: v.string(),
    baseBranch: v.optional(v.string()),
    model: v.optional(aiModelValidator),
    providerAccountId: v.optional(
      v.union(v.id("userProviderAccounts"), v.null()),
    ),
    ...runTraitFields,
    tags: v.optional(v.array(v.string())),
    assignedTo: v.optional(v.id("users")),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    run: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (
      !task ||
      task.createdBy !== ctx.userId ||
      task.status !== "draft" ||
      !(await hasTaskAccess(ctx.db, task, ctx.userId))
    )
      throw new Error("Draft not found");

    const repo = task.repoId ? await ctx.db.get(task.repoId) : null;
    const approved = task.projectId !== undefined && args.run === true;
    const { title } = initialTitle(undefined, args.description);

    await ctx.db.patch(args.id, {
      title,
      description: args.description,
      baseBranch: resolveNewTaskBaseBranch(args.baseBranch, repo),
      status: "todo",
      approvedAt: approved ? Date.now() : undefined,
      updatedAt: Date.now(),
      tags: normalizeTaskTags(args.tags),
      assignedTo: args.assignedTo,
      attachmentStorageIds: args.attachmentStorageIds,
    });
    if (repo) {
      await seedNewTaskChat(ctx, args.id, repo, {
        projectId: task.projectId,
        model: args.model,
        providerAccountId: args.providerAccountId,
        reasoningLevel: args.reasoningLevel,
        thinkingEnabled: args.thinkingEnabled,
        use1mContext: args.use1mContext,
        fastMode: args.fastMode,
      });
    }
    await scheduleGeneratedTitle(
      ctx,
      { kind: "task", taskId: args.id },
      args.description,
      title,
    );
    await ctx.scheduler.runAfter(0, internal.textGen.generateTaskTags, {
      taskId: args.id,
      title,
      description: args.description,
      existingTags: normalizeTaskTags(args.tags) ?? [],
    });
    if (args.assignedTo) {
      await ensureSubscribed(ctx, args.id, args.assignedTo);
    }
    if (args.assignedTo && args.assignedTo !== ctx.userId) {
      await createNotification(ctx, {
        userId: args.assignedTo,
        type: "task_assigned",
        title: `Assigned: "${title}"`,
        repoId: task.repoId,
        projectId: task.projectId,
        taskId: args.id,
        message: buildTaskNotificationMessage(
          { ...task, status: "todo" },
          "assigned",
        ),
      });
    }
    // A project task that runs may start: the scheduler picks it up. Else
    // it goes to the project's coordinator at once.
    if (task.projectId && approved) {
      await ctx.scheduler.runAfter(
        0,
        internal.buildWorkflow.scheduleReadyTasks,
        { projectId: task.projectId },
      );
    } else if (task.projectId) {
      await handTasksToCoordinator(ctx, task.projectId, [task._id]);
    }
    if (task.projectId) {
      await onProjectTasksChanged(ctx, task.projectId);
    } else if (args.run) {
      await startTaskExecution(ctx, args.id);
    }
    return null;
  },
});

/**
 * Deletes a draft row with the run summary and subscription `saveDraft` made.
 * A draft is unsent text: it is deleted, never archived.
 */
async function deleteDraftRow(
  ctx: MutationCtx,
  draftId: Id<"agentTasks">,
): Promise<void> {
  const runSummaries = await ctx.db
    .query("agentTaskRunSummaries")
    .withIndex("by_task", (q) => q.eq("taskId", draftId))
    .collect();
  const subscribers = await ctx.db
    .query("taskSubscribers")
    .withIndex("by_task", (q) => q.eq("taskId", draftId))
    .collect();
  for (const row of [...runSummaries, ...subscribers]) {
    await ctx.db.delete(row._id);
  }
  await ctx.db.delete(draftId);
}

/** Deletes one of the user's drafts. */
export const deleteDraft = authMutation({
  args: { id: v.id("agentTasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.id);
    if (
      !draft ||
      draft.createdBy !== ctx.userId ||
      draft.status !== "draft"
    )
      throw new Error("Draft not found");
    await deleteDraftRow(ctx, args.id);
    return null;
  },
});
