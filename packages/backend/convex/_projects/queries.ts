import { v } from "convex/values";
import { findLivePullRequestOnBranch } from "../_pullRequests/store";
import { authQuery, hasRepoAccess } from "../functions";
import { internalQuery } from "../_generated/server";
import { filterUnarchived } from "../numId";
import {
  taskProgressValidator,
  taskProgressFields,
} from "../_validators/shapes";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import {
  projectValidator,
  projectListItemValidator,
} from "./helpers";
import { resolveProjectBranchName } from "../_git/branchNames";
import { resolveProjectBaseBranch } from "../_agentTasks/resolveBaseBranch";
import { unreadLookupForList } from "../chatReads";
import { awaitingAnswerEntityIdsForRepo } from "../_chat/turnProjection";
import { projectStatus } from "@eva/shared/projectStatus";
import { loadProjectTaskFacts } from "./taskTable";
import {
  projectSandboxStatus,
} from "../_sessions/ownedSession";

/**
 * A repo's live or archived projects: live in creation order, archived most
 * recently archived first.
 */
function projectsForRepo(
  db: GenericDatabaseReader<DataModel>,
  repoId: Id<"githubRepos">,
  archived = false,
) {
  const query = db.query("projects").withIndex("by_repo_and_archived", (q) =>
    archived
      ? q.eq("repoId", repoId).gte("archivedAt", 0)
      : q.eq("repoId", repoId).eq("archivedAt", undefined),
  );
  return archived ? query.order("desc").collect() : query.collect();
}

/** List rows for `list` and `listArchived`, which differ only in `archived`. */
async function toProjectListItems(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
  repoId: Id<"githubRepos">,
  archived: boolean,
) {
  const [projects, awaitingAnswerIds] = await Promise.all([
    projectsForRepo(db, repoId, archived),
    awaitingAnswerEntityIdsForRepo(db, repoId),
  ]);
  const hasUnread = await unreadLookupForList(
    db,
    userId,
    repoId,
    projects.length,
  );
  return await Promise.all(
    projects.map(async (project) => ({
      ...project,
      // A project's sandbox lives on its session; the row shows that.
      sandboxStatus: await projectSandboxStatus(db, project),
      hasUnread: await hasUnread(project),
      isAwaitingAnswer: awaitingAnswerIds.has(String(project._id)),
    })),
  );
}

/** Lists the live projects of a repo. */
export const list = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(projectListItemValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    return toProjectListItems(ctx.db, ctx.userId, args.repoId, false);
  },
});

/** Lists the archived projects of a repo, most recently archived first. */
export const listArchived = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(projectListItemValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    return toProjectListItems(ctx.db, ctx.userId, args.repoId, true);
  },
});

/** A project's tasks by display status (`projectTaskDisplayStatus`). */
const displayStatusCountsValidator = v.object({
  working: v.number(),
  blocked: v.number(),
  idle: v.number(),
  archived: v.number(),
});

/**
 * Every live (or, with `archived`, archived) project of a repo with its
 * derived status, in one call for the projects list (`projectStatus` over each project's task facts): its stage,
 * task counts by display status, how many tasks need a person, and whether its
 * coordinator's automatic turns are paused at the hourly cap (that needs a
 * person too). Tasks in repos the caller cannot open still count.
 */
export const listStatusesForRepo = authQuery({
  args: { repoId: v.id("githubRepos"), archived: v.optional(v.boolean()) },
  returns: v.array(
    v.object({
      projectId: v.id("projects"),
      stage: v.union(
        v.literal("done"),
        v.literal("in_progress"),
        v.literal("todo"),
      ),
      counts: displayStatusCountsValidator,
      needsYouCount: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const projects = await projectsForRepo(ctx.db, args.repoId, args.archived);
    return await Promise.all(
      projects.map(async (project) => {
        const facts = await loadProjectTaskFacts(ctx.db, project);
        const status = projectStatus([...facts.values()]);
        return {
          projectId: project._id,
          stage: status.stage,
          counts: status.counts,
          needsYouCount: status.needsYou.length,
        };
      }),
    );
  },
});

/** Retrieves a project by ID, archived ones too (its page opens read-only). */
export const get = authQuery({
  args: { id: v.id("projects") },
  returns: v.union(projectValidator, v.null()),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (!project) {
      return null;
    }
    if (!(await hasRepoAccess(ctx.db, project.repoId, ctx.userId))) return null;
    return project;
  },
});

/** Resolves a project by per-repo numeric id (URL segment), archived ones too. */
export const getByNumId = authQuery({
  args: {
    repoId: v.id("githubRepos"),
    numId: v.number(),
  },
  returns: v.union(projectValidator, v.null()),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return null;
    const project = await ctx.db
      .query("projects")
      .withIndex("by_repo_and_numId", (q) =>
        q.eq("repoId", args.repoId).eq("numId", args.numId),
      )
      .first();
    return project;
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
    const tasks = filterUnarchived(
      await ctx.db
        .query("agentTasks")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect(),
    );
    return tasks.length;
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

    const branchName = resolveProjectBranchName(args.projectId, project);

    const tasks = filterUnarchived(
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
      baseBranch: resolveProjectBaseBranch(project, repo),
      projectTitle: project.title,
      projectDescription: project.description,
      rootDirectory: repo.rootDirectory ?? "",
      // Only a live PR on the current branch counts: a merged one belongs to
      // an earlier branch version, and the next cycle needs its own PR.
      existingPrUrl:
        (await findLivePullRequestOnBranch(ctx.db, project.repoId, branchName))
          ?.prUrl ?? null,
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
    const tasks = filterUnarchived(
      await ctx.db
        .query("agentTasks")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect(),
    );
    return computeTaskProgress(tasks);
  },
});

/** Returns task-progress breakdowns for every project in a repo in a single
 *  query, so the timeline can render per-project progress without issuing one
 *  request per row. */
export const listTaskProgress = authQuery({
  args: { repoId: v.id("githubRepos"), archived: v.optional(v.boolean()) },
  returns: v.array(
    v.object({ projectId: v.id("projects"), ...taskProgressFields }),
  ),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const projects = await projectsForRepo(ctx.db, args.repoId, args.archived);
    return await Promise.all(
      projects.map(async (project) => {
        const tasks = filterUnarchived(
          await ctx.db
            .query("agentTasks")
            .withIndex("by_project", (q) => q.eq("projectId", project._id))
            .collect(),
        );
        return { projectId: project._id, ...computeTaskProgress(tasks) };
      }),
    );
  },
});
