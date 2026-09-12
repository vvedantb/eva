import { v } from "convex/values";
import { authQuery, hasRepoAccess, hasTaskAccess } from "../functions";
import { internalQuery } from "../_generated/server";
import { entityVisible, filterActiveEntities } from "../numId";
import { taskSandboxStatusValidator } from "../_validators/enums";
import {
  taskProgressValidator,
  taskProgressFields,
} from "../_validators/shapes";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc } from "../_generated/dataModel";
import {
  projectWithDetailsValidator,
  projectListItemValidator,
  resolveProjectPlanningMode,
  getProjectDetails,
  buildProjectBranchName,
} from "./helpers";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";

/** Builds a project's detail payload (conversation history + optional generated
 *  spec) from a single projectDetails read, matching projectWithDetailsValidator.
 *  Shared by `get` and `getByNumId` so both stay in sync and avoid reading the
 *  projectDetails row twice. */
async function buildProjectWithDetails(
  db: GenericDatabaseReader<DataModel>,
  project: Doc<"projects">,
) {
  const details = await getProjectDetails(db, project._id);
  return {
    ...project,
    conversationHistory: details?.conversationHistory ?? [],
    ...(details?.generatedSpec !== undefined
      ? { generatedSpec: details.generatedSpec }
      : {}),
  };
}

/** Lists all projects for a repo. */
export const list = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(projectListItemValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const projects = filterActiveEntities(
      await ctx.db
        .query("projects")
        .withIndex("by_repo", (q) => q.eq("repoId", args.repoId))
        .collect(),
    );
    return await Promise.all(
      projects.map(async (project) => ({
        ...project,
        planningMode: await resolveProjectPlanningMode(ctx.db, project),
      })),
    );
  },
});

/** Retrieves a project by ID with its conversation history and generated spec. */
export const get = authQuery({
  args: { id: v.id("projects") },
  returns: v.union(projectWithDetailsValidator, v.null()),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (!project) {
      return null;
    }
    if (!(await hasRepoAccess(ctx.db, project.repoId, ctx.userId))) return null;
    const visible = entityVisible(project);
    if (!visible) return null;
    return await buildProjectWithDetails(ctx.db, visible);
  },
});

/** Resolves a project by per-repo numeric id (URL segment). */
export const getByNumId = authQuery({
  args: {
    repoId: v.id("githubRepos"),
    numId: v.number(),
  },
  returns: v.union(projectWithDetailsValidator, v.null()),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return null;
    const project = await ctx.db
      .query("projects")
      .withIndex("by_repo_and_numId", (q) =>
        q.eq("repoId", args.repoId).eq("numId", args.numId),
      )
      .first();
    const visible = entityVisible(project);
    if (!visible) return null;
    return await buildProjectWithDetails(ctx.db, visible);
  },
});

/** Returns the number of tasks in a project. */
export const getTaskCount = authQuery({
  args: { projectId: v.id("projects") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || !(await hasRepoAccess(ctx.db, project.repoId, ctx.userId)))
      return 0;
    const tasks = filterActiveEntities(
      await ctx.db
        .query("agentTasks")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect(),
    );
    let count = 0;
    for (const task of tasks) {
      if (await hasTaskAccess(ctx.db, task, ctx.userId)) count += 1;
    }
    return count;
  },
});

/** Counts projects that currently have an active build workflow running. */
export const countBuilding = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.number(),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return 0;
    const projects = filterActiveEntities(
      await ctx.db
        .query("projects")
        .withIndex("by_repo", (q) => q.eq("repoId", args.repoId))
        .collect(),
    );
    return projects.filter((p) => p.activeBuildWorkflowId !== undefined).length;
  },
});

/** Returns projects with an active build workflow or an active/starting preview sandbox. */
export const getActive = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(
    v.object({
      _id: v.id("projects"),
      numId: v.optional(v.number()),
      title: v.string(),
      activeBuildWorkflowId: v.optional(v.string()),
      reviewProjectSandboxStatus: v.optional(taskSandboxStatusValidator),
    }),
  ),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const projects = filterActiveEntities(
      await ctx.db
        .query("projects")
        .withIndex("by_repo", (q) => q.eq("repoId", args.repoId))
        .collect(),
    );
    return projects
      .map((p) => ({
        _id: p._id,
        numId: p.numId,
        title: p.title,
        activeBuildWorkflowId: p.activeBuildWorkflowId,
        reviewProjectSandboxStatus: p.reviewProjectSandboxStatus,
      }))
      .filter(
        (p) =>
          p.activeBuildWorkflowId !== undefined ||
          p.reviewProjectSandboxStatus === "active" ||
          p.reviewProjectSandboxStatus === "starting",
      );
  },
});

/** Fetches everything the manual Create PR action needs for a project: repo
 * metadata for the GitHub call, branch derivation, and the list of completed
 * tasks to include in the PR body. */
export const getProjectPrCreationData = internalQuery({
  args: {
    projectId: v.id("projects"),
  },
  returns: v.object({
    repoId: v.id("githubRepos"),
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    branchName: v.string(),
    baseBranch: v.string(),
    projectTitle: v.string(),
    projectDescription: v.optional(v.string()),
    rootDirectory: v.string(),
    existingPrUrl: v.union(v.string(), v.null()),
    completedTasks: v.array(
      v.object({
        title: v.string(),
        description: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    const repo = await ctx.db.get(project.repoId);
    if (!repo) throw new Error("Repository not found");

    const branchName =
      project.branchName ??
      buildProjectBranchName(args.projectId, project.branchVersion);

    const tasks = filterActiveEntities(
      await ctx.db
        .query("agentTasks")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect(),
    );
    const completedTasks = tasks
      .filter(
        (t) =>
          t.status === "code_review" ||
          t.status === "business_review" ||
          t.status === "done",
      )
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((t) => ({ title: t.title, description: t.description }));

    return {
      repoId: repo._id,
      installationId: repo.installationId,
      repoOwner: repo.owner,
      repoName: repo.name,
      branchName,
      baseBranch:
        project.baseBranch ??
        repo.defaultBaseBranch ??
        FALLBACK_GIT_BASE_BRANCH,
      projectTitle: project.title,
      projectDescription: project.description,
      rootDirectory: repo.rootDirectory ?? "",
      existingPrUrl: project.prUrl ?? null,
      completedTasks,
    };
  },
});

/** Reduces a project's tasks into a status-count breakdown. Shared by the
 *  single-project and batched progress queries so the shape stays in sync. */
function computeTaskProgress(tasks: Doc<"agentTasks">[]) {
  return {
    total: tasks.length,
    todo: tasks.filter((t) => t.status === "todo").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    code_review: tasks.filter((t) => t.status === "code_review").length,
    business_review: tasks.filter((t) => t.status === "business_review").length,
    done: tasks.filter((t) => t.status === "done").length,
    cancelled: tasks.filter((t) => t.status === "cancelled").length,
  };
}

/** Returns a breakdown of task counts by status for a project. */
export const getTaskProgress = authQuery({
  args: { projectId: v.id("projects") },
  returns: taskProgressValidator,
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (
      !project ||
      !(await hasRepoAccess(ctx.db, project.repoId, ctx.userId))
    ) {
      return computeTaskProgress([]);
    }
    const tasks = filterActiveEntities(
      await ctx.db
        .query("agentTasks")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect(),
    );
    const visible = [];
    for (const task of tasks) {
      if (await hasTaskAccess(ctx.db, task, ctx.userId)) visible.push(task);
    }
    return computeTaskProgress(visible);
  },
});

/** Returns task-progress breakdowns for every project in a repo in a single
 *  query, so the timeline can render per-project progress without issuing one
 *  request per row. */
export const listTaskProgress = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(
    v.object({ projectId: v.id("projects"), ...taskProgressFields }),
  ),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const projects = filterActiveEntities(
      await ctx.db
        .query("projects")
        .withIndex("by_repo", (q) => q.eq("repoId", args.repoId))
        .collect(),
    );
    return await Promise.all(
      projects.map(async (project) => {
        const tasks = filterActiveEntities(
          await ctx.db
            .query("agentTasks")
            .withIndex("by_project", (q) => q.eq("projectId", project._id))
            .collect(),
        );
        const visible = [];
        for (const task of tasks) {
          if (await hasTaskAccess(ctx.db, task, ctx.userId)) visible.push(task);
        }
        return { projectId: project._id, ...computeTaskProgress(visible) };
      }),
    );
  },
});
