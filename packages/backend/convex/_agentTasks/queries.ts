import { v } from "convex/values";
import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { aiModelValidator, taskStatusValidator } from "../validators";
import { authQuery, hasRepoAccess, hasTaskAccess } from "../functions";
import { entityVisible, filterActiveEntities } from "../numId";
import { agentTaskValidator } from "./helpers";
import { resolveStorageEntries } from "../_chat/storageUrls";

/** Validator for a task document enriched with its latest run start time. */
export const agentTaskWithLastRunValidator = v.object({
  ...agentTaskValidator.fields,
  lastRunStartedAt: v.optional(v.number()),
});

/** Enriches each task with the start time of its most recent run. */
async function enrichTasksWithLastRun(
  db: QueryCtx["db"],
  tasks: Array<Doc<"agentTasks">>,
) {
  const repoIds = new Set<Id<"githubRepos">>();
  for (const task of tasks) {
    if (task.repoId) repoIds.add(task.repoId);
  }
  const summaryGroups = await Promise.all(
    [...repoIds].map((repoId) =>
      db
        .query("agentTaskRunSummaries")
        .withIndex("by_repo", (q) => q.eq("repoId", repoId))
        .collect(),
    ),
  );
  const summariesByTask = new Map(
    summaryGroups.flat().map((summary) => [String(summary.taskId), summary]),
  );

  return Promise.all(
    tasks.map(async (task) => {
      const summary = summariesByTask.get(String(task._id));
      if (summary) {
        return {
          ...task,
          lastRunStartedAt: summary.lastRunStartedAt,
        };
      }
      // Migration-safe fallback for tasks whose summary row is not backfilled.
      const latestRun = await db
        .query("agentRuns")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .order("desc")
        .first();
      return {
        ...task,
        lastRunStartedAt: latestRun?.startedAt,
      };
    }),
  );
}

/** Lists all tasks for a project, enriched with latest run time. */
export const listByProject = authQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(agentTaskWithLastRunValidator),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || !(await hasRepoAccess(ctx.db, project.repoId, ctx.userId)))
      return [];
    const tasks = filterActiveEntities(
      await ctx.db
        .query("agentTasks")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect(),
    );
    const sorted = tasks.sort(
      (a, b) => (a.taskNumber ?? 0) - (b.taskNumber ?? 0),
    );
    return enrichTasksWithLastRun(ctx.db, sorted);
  },
});

/** Retrieves a single task by ID, returning null if not found or unauthorized. */
export const get = authQuery({
  args: { id: v.id("agentTasks") },
  returns: v.union(agentTaskValidator, v.null()),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId))) return null;
    return entityVisible(task);
  },
});

/**
 * Resolves a task's attached files to signed URLs + content types, in the order
 * the user attached them. Mirrors the message attachment resolver in
 * `messages.ts` so the composer and the task detail view render alike.
 */
export const listAttachments = authQuery({
  args: { taskId: v.id("agentTasks") },
  returns: v.array(
    v.object({
      storageId: v.id("_storage"),
      url: v.union(v.string(), v.null()),
      contentType: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId))) return [];
    const entries = await resolveStorageEntries(
      (id) => ctx.storage.getUrl(id),
      (id) => ctx.db.system.get("_storage", id),
      task.attachmentStorageIds,
    );
    return entries.map((entry) => ({
      storageId: entry.id,
      url: entry.url,
      contentType: entry.contentType,
    }));
  },
});

/** Resolves a task by per-repo numeric id (URL segment). */
export const getByNumId = authQuery({
  args: {
    repoId: v.id("githubRepos"),
    numId: v.number(),
  },
  returns: v.union(agentTaskValidator, v.null()),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return null;
    const task = await ctx.db
      .query("agentTasks")
      .withIndex("by_repo_and_numId", (q) =>
        q.eq("repoId", args.repoId).eq("numId", args.numId),
      )
      .first();
    return entityVisible(task);
  },
});

/** Returns all non-draft, non-done tasks across accessible repos, sorted by most recently updated. */
/**
 * Active tasks across every repo the user can reach (or one named repo). Shared
 * by `getActiveTasks` and the slim orchestrator projection below so the scope
 * rules — team repos plus connected repos, active statuses only — exist once.
 */
async function activeTasksForUser(
  ctx: QueryCtx,
  userId: Id<"users">,
  repoId?: Id<"githubRepos">,
): Promise<Array<Doc<"agentTasks">>> {
  const args = { repoId };
  const ctxUserId = userId;
  {
    const activeStatuses = [
      "todo",
      "in_progress",
      "code_review",
      "business_review",
    ] as const;

    let repoIds: Array<Id<"githubRepos">>;
    if (args.repoId) {
      if (!(await hasRepoAccess(ctx.db, args.repoId, ctxUserId))) return [];
      repoIds = [args.repoId];
    } else {
      const memberships = await ctx.db
        .query("teamMembers")
        .withIndex("by_user", (q) => q.eq("userId", ctxUserId))
        .collect();
      const teamRepos = await Promise.all(
        memberships.map((m) =>
          ctx.db
            .query("githubRepos")
            .withIndex("by_team", (q) => q.eq("teamId", m.teamId))
            .collect(),
        ),
      );
      const connectedRepos = await ctx.db
        .query("githubRepos")
        .withIndex("by_connected_by", (q) => q.eq("connectedBy", ctxUserId))
        .collect();
      const seen = new Set<string>();
      repoIds = [];
      for (const repo of [...connectedRepos, ...teamRepos.flat()]) {
        if (seen.has(String(repo._id))) continue;
        seen.add(String(repo._id));
        repoIds.push(repo._id);
      }
    }

    const taskArrays = await Promise.all(
      repoIds.flatMap((repoId) =>
        activeStatuses.map((status) =>
          ctx.db
            .query("agentTasks")
            .withIndex("by_repo_and_status", (q) =>
              q.eq("repoId", repoId).eq("status", status),
            )
            .collect(),
        ),
      ),
    );

    return filterActiveEntities(taskArrays.flat()).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }
}

/** Active tasks for the user (or one repo), as full documents. */
export const getActiveTasks = authQuery({
  args: { repoId: v.optional(v.id("githubRepos")) },
  returns: v.array(agentTaskValidator),
  handler: async (ctx, args) =>
    await activeTasksForUser(ctx, ctx.userId, args.repoId),
});

/**
 * Fields the orchestrator's `list_agents` needs from a task — and nothing else.
 *
 * `getActiveTasks` returns whole documents, whose `backgroundAgents` and
 * `description` measured up to 35KB and 8KB on real data; the fleet list keeps
 * eight small fields and drops the rest, so a supervision round was moving
 * hundreds of KB per call for no benefit.
 */
const orchestratorTaskValidator = v.object({
  _id: v.id("agentTasks"),
  _creationTime: v.number(),
  numId: v.optional(v.number()),
  repoId: v.optional(v.id("githubRepos")),
  title: v.string(),
  status: taskStatusValidator,
  updatedAt: v.number(),
  model: v.optional(aiModelValidator),
  lastChatModel: v.optional(aiModelValidator),
  activeWorkflowId: v.optional(v.string()),
  activeChatWorkflowId: v.optional(v.string()),
});

/** Slim projection of {@link getActiveTasks} for the orchestrator fleet list. */
export const getActiveTasksSlim = authQuery({
  args: {},
  returns: v.array(orchestratorTaskValidator),
  handler: async (ctx): Promise<Array<Infer<typeof orchestratorTaskValidator>>> => {
    const tasks = await activeTasksForUser(ctx, ctx.userId);
    return tasks.map((task) => ({
      _id: task._id,
      _creationTime: task._creationTime,
      numId: task.numId,
      repoId: task.repoId,
      title: task.title,
      status: task.status,
      updatedAt: task.updatedAt,
      model: task.model,
      lastChatModel: task.lastChatModel,
      activeWorkflowId: task.activeWorkflowId,
      activeChatWorkflowId: task.activeChatWorkflowId,
    }));
  },
});

/** Returns all non-draft tasks for a repo, enriched with latest run time, sorted by creation date. */
export const getAllTasks = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(agentTaskWithLastRunValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const nonDraftStatuses = [
      "todo",
      "in_progress",
      "code_review",
      "business_review",
      "done",
      "cancelled",
    ] as const;
    const taskArrays = await Promise.all(
      nonDraftStatuses.map((status) =>
        ctx.db
          .query("agentTasks")
          .withIndex("by_repo_status_and_deleted", (q) =>
            q
              .eq("repoId", args.repoId)
              .eq("status", status)
              .eq("deletedAt", undefined),
          )
          .collect(),
      ),
    );
    const tasks = taskArrays.flat().sort((a, b) => a.createdAt - b.createdAt);
    return enrichTasksWithLastRun(ctx.db, tasks);
  },
});

/** Returns the tasks that depend on a given task (its downstream dependents). */
export const getDependentTasks = authQuery({
  args: { taskId: v.id("agentTasks") },
  returns: v.array(
    v.object({
      _id: v.id("agentTasks"),
      title: v.string(),
      taskNumber: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId))) return [];
    const dependents = await ctx.db
      .query("taskDependencies")
      .withIndex("by_dependency", (q) => q.eq("dependsOnId", args.taskId))
      .collect();
    const depTasks = await Promise.all(
      dependents.map((dep) => ctx.db.get(dep.taskId)),
    );
    return filterActiveEntities(
      depTasks.filter((t): t is Exclude<typeof t, null> => t !== null),
    ).map((t) => ({
      _id: t._id,
      title: t.title,
      taskNumber: t.taskNumber,
    }));
  },
});

/** Returns the status of multiple tasks by their IDs. */
export const getStatusesByIds = authQuery({
  args: { ids: v.array(v.id("agentTasks")) },
  returns: v.array(
    v.object({
      id: v.id("agentTasks"),
      status: taskStatusValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const tasks = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    return tasks
      .filter((t): t is Exclude<typeof t, null> => t !== null)
      .map((t) => ({ id: t._id, status: t.status }));
  },
});
