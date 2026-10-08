import { v } from "convex/values";
import { aiModelValidator } from "../validators";
import { internal } from "../_generated/api";
import {
  authQuery,
  authMutation,
  hasRepoAccess,
  recomputeProjectPhase,
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
import { resolveNewTaskBaseBranch } from "../_taskWorkflow/resolveBaseBranch";
import {
  assertProviderAccountUsableBy,
  resolveDefaultProviderAccountId,
} from "../_userProviderAccounts/defaults";
import { createTaskRunSummary } from "./runSummary";

/** Lists all draft tasks for the current user in a given repo, sorted by most recently updated. */
export const listDrafts = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(agentTaskValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    // Index by status + deletedAt so a soft-deleted draft does not linger in
    // the quick-task modal (or the Drafts page) after Remove.
    const drafts = await ctx.db
      .query("agentTasks")
      .withIndex("by_repo_status_and_deleted", (q) =>
        q
          .eq("repoId", args.repoId)
          .eq("status", "draft")
          .eq("deletedAt", undefined),
      )
      .collect();
    return drafts
      .filter((t) => t.createdBy === ctx.userId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

/** Counts draft tasks for the current user in a repo (badge path — no full docs). */
export const countDrafts = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.number(),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return 0;
    const drafts = await ctx.db
      .query("agentTasks")
      .withIndex("by_repo_status_and_deleted", (q) =>
        q
          .eq("repoId", args.repoId)
          .eq("status", "draft")
          .eq("deletedAt", undefined),
      )
      .collect();
    return drafts.filter((t) => t.createdBy === ctx.userId).length;
  },
});

/** Creates or updates a draft task. Returns the task ID. */
export const saveDraft = authMutation({
  args: {
    id: v.optional(v.id("agentTasks")),
    repoId: v.id("githubRepos"),
    title: v.optional(v.string()),
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
    const project = args.projectId ? await ctx.db.get(args.projectId) : null;

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
        title: args.title ?? "",
        description: args.description,
        baseBranch: args.baseBranch,
        attachmentStorageIds: args.attachmentStorageIds,
        updatedAt: now,
      });
      return args.id;
    }

    const draftId = await ctx.db.insert("agentTasks", {
      title: args.title ?? "",
      description: args.description,
      attachmentStorageIds: args.attachmentStorageIds,
      repoId: args.repoId,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      createdBy: ctx.userId,
      baseBranch: resolveNewTaskBaseBranch(args.baseBranch, repo, project),
      projectId: args.projectId,
      numId: await allocateNumId(ctx.db, args.repoId, "agentTasks"),
    });
    await createTaskRunSummary(ctx, draftId, args.repoId);
    await ensureSubscribed(ctx, draftId, ctx.userId);
    return draftId;
  },
});

/** Promotes a draft task to "todo" status so it can be executed. */
export const activateDraft = authMutation({
  args: {
    id: v.id("agentTasks"),
    title: v.string(),
    description: v.optional(v.string()),
    baseBranch: v.optional(v.string()),
    model: v.optional(aiModelValidator),
    providerAccountId: v.optional(
      v.union(v.id("userProviderAccounts"), v.null()),
    ),
    ...runTraitFields,
    tags: v.optional(v.array(v.string())),
    assignedTo: v.optional(v.id("users")),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task || task.createdBy !== ctx.userId || task.status !== "draft")
      throw new Error("Draft not found");

    const repo = task.repoId ? await ctx.db.get(task.repoId) : null;
    const project = task.projectId ? await ctx.db.get(task.projectId) : null;

    const providerAccountId =
      args.providerAccountId === undefined
        ? await resolveDefaultProviderAccountId(ctx.db, ctx.userId, args.model)
        : await assertProviderAccountUsableBy(
            ctx.db,
            args.providerAccountId,
            ctx.userId,
          );

    await ctx.db.patch(args.id, {
      title: args.title,
      description: args.description,
      baseBranch: resolveNewTaskBaseBranch(args.baseBranch, repo, project),
      model: args.model,
      providerAccountId,
      reasoningLevel: args.reasoningLevel,
      thinkingEnabled: args.thinkingEnabled,
      use1mContext: args.use1mContext,
      fastMode: args.fastMode,
      status: "todo",
      updatedAt: Date.now(),
      tags: normalizeTaskTags(args.tags),
      assignedTo: args.assignedTo,
      attachmentStorageIds: args.attachmentStorageIds,
    });
    await ctx.scheduler.runAfter(0, internal.textGen.generateTaskTags, {
      taskId: args.id,
      title: args.title,
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
        title: `Assigned: "${args.title}"`,
        repoId: task.repoId,
        projectId: task.projectId,
        taskId: args.id,
        message: buildTaskNotificationMessage(
          { ...task, status: "todo" },
          "assigned",
        ),
      });
    }
    if (task.projectId) {
      await recomputeProjectPhase(ctx, task.projectId);
    }
    return null;
  },
});
