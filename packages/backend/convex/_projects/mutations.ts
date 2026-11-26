import { findPrimaryPullRequest } from "../_pullRequests/store";
import { internal } from "../_generated/api";
import { ConvexError, v } from "convex/values";
import {
  priorityValidator,
  aiModelValidator,
} from "../validators";
import {
  assertProjectNotArchived,
  authMutation,
  hasRepoAccess,
  getProjectWithAccess,
  onProjectTasksChanged,
  taskRunPending,
} from "../functions";
import { listProjectTasks, taskLabel } from "./scheduler";
import { allocateNumId } from "../numId";
import {
  mirrorOwnerIntoSession,
  syncProjectSession,
  syncProjectSessionBranch,
} from "../_sessions/ownedSession";
import { schedulePrTitleSync } from "../_github/prTitleSync";
import {
  assertProviderAccountUsableBy,
  reconcileProviderAccountForModel,
  resolveDefaultProviderAccountId,
} from "../_userProviderAccounts/defaults";

/**
 * Creates a new project. It plans in its coordinator chat (decision 1): no
 * interview, no spec, no project branch. `rawInput` becomes the description:
 * the project context every coordinator and child task turn carries
 * (`projectBriefBlock`), so the person need not repeat it. The client opens
 * the coordinator chat;
 * nothing is sent for them. `skipPlanning` stays accepted for older clients
 * and is ignored: every project starts the same way, and nothing starts the
 * old interview for it.
 */
export const create = authMutation({
  args: {
    repoId: v.id("githubRepos"),
    title: v.string(),
    rawInput: v.string(),
    baseBranch: v.optional(v.string()),
    priority: v.optional(priorityValidator),
    /** Ignored; kept for older clients. */
    skipPlanning: v.optional(v.boolean()),
    model: v.optional(aiModelValidator),
    providerAccountId: v.optional(
      v.union(v.id("userProviderAccounts"), v.null()),
    ),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const numId = await allocateNumId(ctx.db, args.repoId, "projects");
    const repo = await ctx.db.get(args.repoId);
    const model = args.model ?? repo?.defaultModel;
    const providerAccountId =
      args.providerAccountId === undefined
        ? await resolveDefaultProviderAccountId(ctx.db, ctx.userId, model)
        : await assertProviderAccountUsableBy(
            ctx.db,
            args.providerAccountId,
            ctx.userId,
          );
    const description = args.rawInput.trim();
    return await ctx.db.insert("projects", {
      repoId: args.repoId,
      userId: ctx.userId,
      title: args.title,
      rawInput: args.rawInput,
      ...(description ? { description } : {}),
      baseBranch: args.baseBranch,
      projectStartDate: Date.now(),
      priority: args.priority,
      numId,
      model,
      providerAccountId,
    });
  },
});

/** Updates editable fields on a project. */
export const update = authMutation({
  args: {
    id: v.id("projects"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    branchName: v.optional(v.string()),
    priority: v.optional(v.union(priorityValidator, v.null())),
    projectLead: v.optional(v.union(v.id("users"), v.null())),
    members: v.optional(v.array(v.id("users"))),
    projectStartDate: v.optional(v.number()),
    projectEndDate: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    model: v.optional(v.union(aiModelValidator, v.null())),
    // null = clear to team credentials. undefined = no change.
    providerAccountId: v.optional(
      v.union(v.id("userProviderAccounts"), v.null()),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await getProjectWithAccess(
      ctx.db,
      args.id,
      ctx.userId,
    );
    assertProjectNotArchived(project);
    // `id` must be omitted — leaving it in the rest-spread patches a stray
    // `id` field onto the document and breaks projects:list return validation.
    const {
      id: _projectId,
      projectLead,
      priority,
      model,
      providerAccountId,
      ...fields
    } = args;
    void _projectId;
    const updates: Record<
      string,
      string | number | boolean | Array<string> | undefined
    > = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) updates[key] = value;
    }
    if (projectLead !== undefined)
      updates.projectLead = projectLead ?? undefined;
    if (priority !== undefined) updates.priority = priority ?? undefined;
    if (model !== undefined) updates.model = model ?? undefined;
    let nextProviderAccountId = project.providerAccountId;
    if (providerAccountId !== undefined) {
      if (ctx.userId !== project.userId) {
        throw new Error(
          "Only the project owner can change the provider account",
        );
      }
      nextProviderAccountId = await assertProviderAccountUsableBy(
        ctx.db,
        providerAccountId,
        project.userId,
      );
      updates.providerAccountId = nextProviderAccountId;
    }
    // Explicit account in this update wins; only reconcile when model alone changes.
    if (
      model !== undefined &&
      providerAccountId === undefined &&
      ctx.userId === project.userId
    ) {
      nextProviderAccountId = await reconcileProviderAccountForModel(
        ctx.db,
        project.userId,
        model ?? undefined,
        nextProviderAccountId,
      );
      updates.providerAccountId = nextProviderAccountId;
    }
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.id, updates);
    }
    // A new account lifts a usage-limit hold: the scheduler goes on.
    if (nextProviderAccountId !== project.providerAccountId) {
      await ctx.scheduler.runAfter(
        0,
        internal.buildWorkflow.scheduleReadyTasks,
        { projectId: args.id },
      );
    }
    // The session mirrors the title and base branch, and moves to an edited
    // branch (the one branch writer).
    const edited = await ctx.db.get(args.id);
    if (edited) {
      await mirrorOwnerIntoSession(ctx, { kind: "project", project: edited });
      await syncProjectSessionBranch(ctx, args.id);
    }
    if (args.title !== undefined && args.title !== project.title) {
      const primaryPr = await findPrimaryPullRequest(ctx.db, {
        kind: "project",
        projectId: project._id,
      });
      if (primaryPr) {
        await schedulePrTitleSync(ctx, {
          repoId: primaryPr.repoId,
          prUrl: primaryPr.prUrl,
          title: args.title,
        });
      }
    }
    return null;
  },
});

/**
 * Archives a project as one unit: its tasks stay in it, the coordinator
 * session retires and the scheduler skips it. Hidden from lists; its page
 * still opens read-only. Refused while one of its tasks runs.
 */
export const archive = authMutation({
  args: { id: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await getProjectWithAccess(ctx.db, args.id, ctx.userId);
    if (project.archivedAt !== undefined) return null;
    for (const task of await listProjectTasks(ctx.db, args.id)) {
      if (task.status === "in_progress" || (await taskRunPending(ctx.db, task))) {
        throw new ConvexError(
          `Task ${taskLabel(task)} is running. Stop it or wait for it to end, then archive the project.`,
        );
      }
    }
    await ctx.db.patch(args.id, { archivedAt: Date.now() });
    await syncProjectSession(ctx, args.id);
    return null;
  },
});

/** Brings an archived project back with its tasks and coordinator session. */
export const unarchive = authMutation({
  args: { id: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await getProjectWithAccess(ctx.db, args.id, ctx.userId);
    if (project.archivedAt === undefined) return null;
    await ctx.db.patch(args.id, { archivedAt: undefined });
    await syncProjectSession(ctx, args.id);
    await onProjectTasksChanged(ctx, args.id);
    return null;
  },
});
