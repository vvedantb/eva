import { findPrimaryPullRequest } from "../_pullRequests/store";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import {
  phaseValidator,
  priorityValidator,
  aiModelValidator,
} from "../validators";
import {
  authMutation,
  EMPTY_PROJECT_PHASE,
  hasRepoAccess,
  getProjectWithAccess,
  softDeleteAgentTask,
} from "../functions";
import { allocateNumId } from "../numId";
import {
  getProjectConversation,
  setProjectConversation,
  setProjectGeneratedSpec,
} from "./helpers";
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
 * interview, no spec, no project branch. `rawInput` becomes the description,
 * which every coordinator turn carries with the title (`withProjectContext`),
 * so the person need not repeat it. The client opens the coordinator chat;
 * nothing is sent for them. `skipPlanning` stays accepted for older clients
 * and is ignored: every project starts the same way, and nothing starts the
 * old interview for it (`resolveProjectPlanningMode` reads it as
 * `tasks_only`).
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
      phase: EMPTY_PROJECT_PHASE,
      projectStartDate: Date.now(),
      priority: args.priority,
      numId,
      model,
      providerAccountId,
    });
  },
});

/** Updates editable fields on a project, including its generated spec. */
export const update = authMutation({
  args: {
    id: v.id("projects"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    branchName: v.optional(v.string()),
    generatedSpec: v.optional(v.string()),
    /** Ignored: the phase is derived. Kept for older clients. */
    phase: v.optional(phaseValidator),
    priority: v.optional(v.union(priorityValidator, v.null())),
    projectLead: v.optional(v.union(v.id("users"), v.null())),
    members: v.optional(v.array(v.id("users"))),
    projectStartDate: v.optional(v.number()),
    projectEndDate: v.optional(v.number()),
    codeReviewer: v.optional(v.union(v.id("users"), v.null())),
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
      "contributor",
    );
    // `id` must be omitted — leaving it in the rest-spread patches a stray
    // `id` field onto the document and breaks projects:list return validation.
    // `phase` is derived (`recomputeProjectPhase`): an older client's write is
    // ignored.
    const {
      id: _projectId,
      phase: _phase,
      generatedSpec,
      projectLead,
      priority,
      codeReviewer,
      model,
      providerAccountId,
      ...fields
    } = args;
    void _projectId;
    void _phase;
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
    if (codeReviewer !== undefined)
      updates.codeReviewer = codeReviewer ?? undefined;
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
    if (generatedSpec !== undefined) {
      await setProjectGeneratedSpec(ctx.db, args.id, generatedSpec);
    }
    return null;
  },
});

/**
 * Appends the caller's own answer to the project interview. Assistant turns
 * are written only by the interview workflow (internal mutations).
 */
export const addMessage = authMutation({
  args: {
    id: v.id("projects"),
    role: v.literal("user"),
    content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getProjectWithAccess(ctx.db, args.id, ctx.userId, "contributor");
    const conversation = await getProjectConversation(ctx.db, args.id);
    await setProjectConversation(ctx.db, args.id, [
      ...conversation,
      {
        role: args.role,
        content: args.content,
        userId: ctx.userId,
        startedAt: Date.now(),
      },
    ]);
    return null;
  },
});

/** Soft-deletes a project (row retained; hidden from lists and direct URLs). */
export const remove = authMutation({
  args: { id: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getProjectWithAccess(ctx.db, args.id, ctx.userId, "contributor");
    await ctx.db.patch(args.id, { deletedAt: Date.now() });
    await syncProjectSession(ctx, args.id);
    return null;
  },
});

/** Soft-deletes a project and all its tasks. */
export const deleteCascade = authMutation({
  args: { id: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getProjectWithAccess(ctx.db, args.id, ctx.userId, "contributor");
    const tasks = await ctx.db
      .query("agentTasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();
    for (const task of tasks) {
      await softDeleteAgentTask(ctx, task._id);
    }
    await ctx.db.patch(args.id, { deletedAt: Date.now() });
    await syncProjectSession(ctx, args.id);
    return null;
  },
});

/** Clears all conversation messages from a project. */
export const clearMessages = authMutation({
  args: { id: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getProjectWithAccess(ctx.db, args.id, ctx.userId, "contributor");
    await setProjectConversation(ctx.db, args.id, []);
    return null;
  },
});

/** Updates the content or activity log of the last conversation message in a project. */
export const updateLastConversationMessage = authMutation({
  args: {
    id: v.id("projects"),
    content: v.optional(v.string()),
    activityLog: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getProjectWithAccess(ctx.db, args.id, ctx.userId, "contributor");
    const messages = [...(await getProjectConversation(ctx.db, args.id))];
    const last = messages[messages.length - 1];
    if (!last) return null;
    if (args.content !== undefined) last.content = args.content;
    if (args.activityLog !== undefined) last.activityLog = args.activityLog;
    await setProjectConversation(ctx.db, args.id, messages);
    return null;
  },
});
