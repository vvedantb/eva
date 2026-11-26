import { findPrimaryPullRequest } from "../_pullRequests/store";
import { ConvexError, v } from "convex/values";
import { tokenizedToDisplayText } from "@eva/shared";
import { initialTitle, scheduleGeneratedTitle } from "../_shared/ownerTitle";
import { sendOwnerChatMessage } from "../_sessions/execution";
import { priorityValidator } from "../validators";
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

/**
 * Creates a new project from one prompt. It plans in its coordinator chat
 * (decision 1): no interview, no spec, no project branch. `rawInput` (the
 * prompt, with mention tokens) becomes the description as display text: the
 * project context every coordinator and child task turn carries
 * (`projectBriefBlock`). The title is the prompt's first line until a
 * generated one replaces it (`_shared/ownerTitle.ts`). With `run` ("Save and
 * Run") the prompt is also the first message in the coordinator chat; without
 * it nothing is sent. The client opens the project either way.
 */
export const create = authMutation({
  args: {
    repoId: v.id("githubRepos"),
    rawInput: v.string(),
    baseBranch: v.optional(v.string()),
    priority: v.optional(priorityValidator),
    run: v.optional(v.boolean()),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const prompt = args.rawInput.trim();
    const { title } = initialTitle(undefined, prompt);
    const numId = await allocateNumId(ctx.db, args.repoId, "projects");
    const projectId = await ctx.db.insert("projects", {
      repoId: args.repoId,
      userId: ctx.userId,
      title,
      rawInput: prompt,
      description: tokenizedToDisplayText(prompt),
      baseBranch: args.baseBranch,
      projectStartDate: Date.now(),
      priority: args.priority,
      numId,
    });
    await scheduleGeneratedTitle(ctx, { kind: "project", projectId }, prompt, title);
    if (args.run) {
      const project = await ctx.db.get(projectId);
      if (!project) throw new Error("Project not found");
      await sendOwnerChatMessage(ctx, {
        entity: { kind: "project", project },
        userId: ctx.userId,
        content: prompt,
      });
    }
    return projectId;
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
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.id, updates);
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
