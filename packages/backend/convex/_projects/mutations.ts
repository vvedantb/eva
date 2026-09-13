import { internal } from "../_generated/api";
import {
  assertPublicUserMessageRole,
  rejectSandboxCaller,
} from "../_auth/sandboxIdentity";
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import {
  roleValidator,
  phaseValidator,
  priorityValidator,
  aiModelValidator,
  reasoningLevelValidator,
} from "../validators";
import {
  authMutation,
  hasRepoAccess,
  getProjectWithAccess,
  softDeleteAgentTask,
} from "../functions";
import { allocateNumId } from "../numId";
import { assertPrUrlForRepo } from "../_github/prUrl";
import { preferPersistedSandboxId } from "../_sandbox/resolveExistingSandboxId";
import {
  getProjectConversation,
  setProjectConversation,
  setProjectGeneratedSpec,
  buildProjectBranchName,
} from "./helpers";
import { scheduleProjectPrSync } from "./prSync";
import { schedulePrTitleSync } from "../_github/prTitleSync";
import {
  assertProviderAccountUsableBy,
  reconcileProviderAccountForModel,
  resolveDefaultProviderAccountId,
} from "../_userProviderAccounts/defaults";

/**
 * Creates a new project. Defaults to `draft` phase with an initial conversation
 * message for the AI interview/plan flow. When `skipPlanning` is true, the
 * project goes straight to `business_review` as a plain tasks-only container —
 * no AI conversation, no generated spec, branch name set immediately.
 */
export const create = authMutation({
  args: {
    repoId: v.id("githubRepos"),
    title: v.string(),
    rawInput: v.string(),
    baseBranch: v.optional(v.string()),
    priority: v.optional(priorityValidator),
    skipPlanning: v.optional(v.boolean()),
    model: v.optional(aiModelValidator),
    providerAccountId: v.optional(
      v.union(v.id("userProviderAccounts"), v.null()),
    ),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const skipPlanning = args.skipPlanning ?? false;
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
    const projectId = await ctx.db.insert("projects", {
      repoId: args.repoId,
      userId: ctx.userId,
      title: args.title,
      rawInput: args.rawInput,
      description: skipPlanning ? args.rawInput : undefined,
      baseBranch: args.baseBranch,
      phase: skipPlanning ? "business_review" : "draft",
      planningMode: skipPlanning ? "tasks_only" : "interview",
      projectStartDate: Date.now(),
      priority: args.priority,
      numId,
      model,
      providerAccountId,
    });
    if (skipPlanning) {
      await ctx.db.patch(projectId, {
        branchName: buildProjectBranchName(projectId),
      });
      await setProjectConversation(ctx.db, projectId, []);
    } else {
      await setProjectConversation(ctx.db, projectId, [
        {
          role: "user",
          content: args.rawInput,
          userId: ctx.userId,
        },
      ]);
    }
    return projectId;
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
    await rejectSandboxCaller(ctx);
    const project = await getProjectWithAccess(ctx.db, args.id, ctx.userId);
    // `id` must be omitted — leaving it in the rest-spread patches a stray
    // `id` field onto the document and breaks projects:list return validation.
    const {
      id: _projectId,
      generatedSpec,
      projectLead,
      priority,
      codeReviewer,
      model,
      providerAccountId,
      phase,
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
    if (phase !== undefined) updates.phase = phase;
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.id, updates);
    }
    if (
      args.title !== undefined &&
      args.title !== project.title &&
      project.prUrl
    ) {
      await schedulePrTitleSync(ctx, {
        repoId: project.repoId,
        prUrl: project.prUrl,
        title: args.title,
      });
    }
    if (phase !== undefined && phase !== project.phase) {
      const updated = await ctx.db.get(args.id);
      if (updated) {
        await scheduleProjectPrSync(ctx, updated, project.phase, phase);
      }
    }
    if (generatedSpec !== undefined) {
      await setProjectGeneratedSpec(ctx.db, args.id, generatedSpec);
    }
    return null;
  },
});

/** Appends a message to the project conversation history. */
export const addMessage = authMutation({
  args: {
    id: v.id("projects"),
    role: roleValidator,
    content: v.string(),
    activityLog: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    assertPublicUserMessageRole(args);
    await getProjectWithAccess(ctx.db, args.id, ctx.userId);
    const conversation = await getProjectConversation(ctx.db, args.id);
    await setProjectConversation(ctx.db, args.id, [
      ...conversation,
      {
        role: args.role,
        content: args.content,
        activityLog: args.activityLog,
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
    await rejectSandboxCaller(ctx);
    await getProjectWithAccess(ctx.db, args.id, ctx.userId);
    await ctx.db.patch(args.id, { deletedAt: Date.now() });
    return null;
  },
});

/** Soft-deletes a project and all its tasks. */
export const deleteCascade = authMutation({
  args: { id: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    await getProjectWithAccess(ctx.db, args.id, ctx.userId);
    const tasks = await ctx.db
      .query("agentTasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();
    for (const task of tasks) {
      if (task.status === "draft" && task.createdBy !== ctx.userId) continue;
      await softDeleteAgentTask(ctx, task._id);
    }
    await ctx.db.patch(args.id, { deletedAt: Date.now() });
    return null;
  },
});

/** Clears all conversation messages from a project. */
export const clearMessages = authMutation({
  args: { id: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    await getProjectWithAccess(ctx.db, args.id, ctx.userId);
    await setProjectConversation(ctx.db, args.id, []);
    return null;
  },
});

/** Sets the pull request URL on a project. */
export const updatePrUrl = authMutation({
  args: {
    id: v.id("projects"),
    prUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const project = await getProjectWithAccess(ctx.db, args.id, ctx.userId);
    const prUrl = await assertPrUrlForRepo(ctx.db, project.repoId, args.prUrl);
    await ctx.db.patch(args.id, { prUrl });
    return null;
  },
});

/** Internal-only setter so server-side actions can persist a project's PR URL
 * without going through user auth. Used by the manual Create PR action. */
export const setProjectPrUrl = internalMutation({
  args: {
    projectId: v.id("projects"),
    prUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    const prUrl = await assertPrUrlForRepo(ctx.db, project.repoId, args.prUrl);
    await ctx.db.patch(args.projectId, { prUrl });
    return null;
  },
});

/** Associates a sandbox ID with a project and records the activity timestamp. */
export const updateProjectSandbox = authMutation({
  args: {
    id: v.id("projects"),
    sandboxId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    await getProjectWithAccess(ctx.db, args.id, ctx.userId);
    const boundSession = await ctx.db
      .query("sessions")
      .withIndex("by_sandbox", (q) => q.eq("sandboxId", args.sandboxId))
      .first();
    if (boundSession) throw new Error("Not authorized");
    const boundTask = await ctx.db
      .query("agentTasks")
      .withIndex("by_sandbox", (q) => q.eq("sandboxId", args.sandboxId))
      .first();
    if (boundTask) throw new Error("Not authorized");
    const boundProject = await ctx.db
      .query("projects")
      .withIndex("by_sandbox", (q) => q.eq("sandboxId", args.sandboxId))
      .first();
    if (boundProject && boundProject._id !== args.id) {
      throw new Error("Not authorized");
    }
    await ctx.db.patch(args.id, {
      sandboxId: args.sandboxId,
      lastSandboxActivity: Date.now(),
    });
    return null;
  },
});

/** Removes the sandbox association from a project and triggers sandbox deletion. */
export const clearProjectSandbox = authMutation({
  args: { id: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const project = await getProjectWithAccess(ctx.db, args.id, ctx.userId);
    const deleteId = preferPersistedSandboxId({
      sandboxId: project.sandboxId,
    });
    if (deleteId) {
      const boundSession = await ctx.db
        .query("sessions")
        .withIndex("by_sandbox", (q) => q.eq("sandboxId", deleteId))
        .first();
      const boundTask = await ctx.db
        .query("agentTasks")
        .withIndex("by_sandbox", (q) => q.eq("sandboxId", deleteId))
        .first();
      if (!boundSession && !boundTask) {
        await ctx.scheduler.runAfter(0, internal.sandbox.deleteSandbox, {
          sandboxId: deleteId,
          repoId: project.repoId,
        });
      }
    }
    await ctx.db.patch(args.id, {
      sandboxId: undefined,

      lastSandboxActivity: undefined,
    });
    return null;
  },
});

/** Updates the last sandbox activity timestamp on a project. */
export const updateLastSandboxActivity = authMutation({
  args: { id: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    await getProjectWithAccess(ctx.db, args.id, ctx.userId);
    await ctx.db.patch(args.id, { lastSandboxActivity: Date.now() });
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
    await rejectSandboxCaller(ctx);
    await getProjectWithAccess(ctx.db, args.id, ctx.userId);
    const messages = [...(await getProjectConversation(ctx.db, args.id))];
    const last = messages[messages.length - 1];
    if (!last) return null;
    if (args.content !== undefined) last.content = args.content;
    if (args.activityLog !== undefined) last.activityLog = args.activityLog;
    await setProjectConversation(ctx.db, args.id, messages);
    return null;
  },
});

/**
 * Sticky sandbox-chat model (`lastChatModel`). No `updatedAt` bump — picker
 * changes are not conversation activity. Distinct from `projects.model`
 * (metadata / build prefs). A cross-provider pick also reconciles the owner's
 * sticky account to the new model's provider.
 */
export const setChatModel = authMutation({
  args: {
    id: v.id("projects"),
    model: aiModelValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const project = await getProjectWithAccess(ctx.db, args.id, ctx.userId);
    const patch: {
      lastChatModel: typeof args.model;
      providerAccountId?: typeof project.providerAccountId;
    } = { lastChatModel: args.model };
    if (ctx.userId === project.userId) {
      patch.providerAccountId = await reconcileProviderAccountForModel(
        ctx.db,
        project.userId,
        args.model,
        project.providerAccountId,
      );
    }
    await ctx.db.patch(args.id, patch);
    return null;
  },
});

/**
 * Sticky sandbox-chat traits (effort / thinking / 1M). No `updatedAt` bump.
 * Only provided fields are patched.
 */
export const setTraits = authMutation({
  args: {
    id: v.id("projects"),
    reasoningLevel: v.optional(reasoningLevelValidator),
    thinkingEnabled: v.optional(v.boolean()),
    use1mContext: v.optional(v.boolean()),
    fastMode: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    await getProjectWithAccess(ctx.db, args.id, ctx.userId);
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
