import { v } from "convex/values";
import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { internalQuery } from "../_generated/server";
import {
  NON_DRAFT_TASK_STATUSES,
  OPEN_TASK_STATUSES,
  aiModelValidator,
  taskStatusValidator,
} from "../validators";
import {
  authQuery,
  hasRepoAccess,
  hasTaskAccess,
  isTaskVisibleTo,
} from "../functions";
import { entityVisible, filterActiveEntities } from "../numId";
import { agentTaskValidator } from "./helpers";
import { listRow } from "../_validators/listRows";
import { resolveStorageEntries } from "../_chat/storageUrls";
import {
  chatTurnFlagsForRepos,
  openChatEntityIdsForRepo,
  taskIsExecuting,
} from "../_chat/turnProjection";
import {
  POINT_READ_LIMIT,
  hasUnreadByPointRead,
  unreadLookupForRepo,
} from "../chatReads";
import { gatherAccessibleRepos } from "../_githubRepos/helpers";

/**
 * A task list row (`listRow`) enriched with its latest run and busy state. The
 * open task's panel reads the dropped fields from `get`.
 */
export const agentTaskWithLastRunValidator = v.object({
  ...listRow(agentTaskValidator.fields),
  lastRunStartedAt: v.optional(v.number()),
  /** Main run or chat turn (synthetic turns too): `taskIsExecuting`. */
  isExecuting: v.boolean(),
  /** Unread chat reply for this user (`chatReads.ts`). Autonomous runs do not count. */
  hasUnread: v.boolean(),
  /** A chat turn is paused on a blocking question for the user. */
  isAwaitingAnswer: v.boolean(),
});

function repoIdsOf(
  tasks: ReadonlyArray<Doc<"agentTasks">>,
): Set<Id<"githubRepos">> {
  const repoIds = new Set<Id<"githubRepos">>();
  for (const task of tasks) {
    if (task.repoId) repoIds.add(task.repoId);
  }
  return repoIds;
}

/** Per-repo turn ids across every repo the tasks belong to, one query per repo. */
async function turnIdsForRepos(
  db: QueryCtx["db"],
  tasks: ReadonlyArray<Doc<"agentTasks">>,
  idsForRepo: (
    db: QueryCtx["db"],
    repoId: Id<"githubRepos">,
  ) => Promise<ReadonlySet<string>>,
): Promise<ReadonlySet<string>> {
  const sets = await Promise.all(
    [...repoIdsOf(tasks)].map((repoId) => idsForRepo(db, repoId)),
  );
  return new Set(sets.flatMap((set) => [...set]));
}

type RunSummary = Doc<"agentTaskRunSummaries">;

/** Each task's run summary and unread flag, one point read per task. */
async function pointReadLookups(
  db: QueryCtx["db"],
  userId: Id<"users">,
  tasks: ReadonlyArray<Doc<"agentTasks">>,
  repoIds: ReadonlySet<Id<"githubRepos">>,
) {
  const summaries = await Promise.all(
    tasks.map((task) =>
      db
        .query("agentTaskRunSummaries")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .order("desc")
        .first(),
    ),
  );
  const summariesByTask = new Map<string, RunSummary>();
  tasks.forEach((task, i) => {
    const summary = summaries[i];
    // The repo-wide path only sees summaries filed under the listed repos.
    if (summary && repoIds.has(summary.repoId)) {
      summariesByTask.set(String(task._id), summary);
    }
  });
  return {
    summariesByTask,
    hasUnread: (task: Doc<"agentTasks">) =>
      hasUnreadByPointRead(db, userId, task),
  };
}

/** Run summaries and unread flags for every task, from one range per repo. */
async function repoWideLookups(
  db: QueryCtx["db"],
  userId: Id<"users">,
  repoIds: ReadonlyArray<Id<"githubRepos">>,
) {
  const [unreadByRepo, summaryGroups] = await Promise.all([
    Promise.all(
      repoIds.map((repoId) => unreadLookupForRepo(db, userId, repoId)),
    ),
    Promise.all(
      repoIds.map((repoId) =>
        db
          .query("agentTaskRunSummaries")
          .withIndex("by_repo", (q) => q.eq("repoId", repoId))
          .collect(),
      ),
    ),
  ]);
  const unreadLookups = new Map<
    string,
    (task: Doc<"agentTasks">) => Promise<boolean>
  >();
  repoIds.forEach((repoId, i) => {
    unreadLookups.set(String(repoId), unreadByRepo[i]);
  });
  return {
    summariesByTask: new Map<string, RunSummary>(
      summaryGroups.flat().map((summary) => [String(summary.taskId), summary]),
    ),
    hasUnread: async (task: Doc<"agentTasks">) => {
      const unreadLookup = unreadLookups.get(String(task.repoId));
      return unreadLookup ? await unreadLookup(task) : false;
    },
  };
}

/** Enriches each task with its most recent run start and its busy state. */
async function enrichTasksWithLastRun(
  db: QueryCtx["db"],
  userId: Id<"users">,
  tasks: Array<Doc<"agentTasks">>,
) {
  const repoIds = repoIdsOf(tasks);
  const [
    { openIds: openChatEntityIds, awaitingAnswerIds },
    { summariesByTask, hasUnread: unreadOf },
  ] = await Promise.all([
    chatTurnFlagsForRepos(db, repoIds),
    tasks.length <= POINT_READ_LIMIT
      ? pointReadLookups(db, userId, tasks, repoIds)
      : repoWideLookups(db, userId, [...repoIds]),
  ]);

  return Promise.all(
    tasks.map(async (task) => {
      const summary = summariesByTask.get(String(task._id));
      const isExecuting = taskIsExecuting(task, openChatEntityIds);
      const hasUnread = await unreadOf(task);
      const isAwaitingAnswer = awaitingAnswerIds.has(String(task._id));
      if (summary) {
        return {
          ...listRow(task),
          lastRunStartedAt: summary.lastRunStartedAt,
          isExecuting,
          hasUnread,
          isAwaitingAnswer,
        };
      }
      // Migration-safe fallback for tasks whose summary row is not backfilled.
      const latestRun = await db
        .query("agentRuns")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .order("desc")
        .first();
      return {
        ...listRow(task),
        lastRunStartedAt: latestRun?.startedAt,
        isExecuting,
        hasUnread,
        isAwaitingAnswer,
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
    ).filter((task) => isTaskVisibleTo(task, ctx.userId));
    const sorted = tasks.sort(
      (a, b) => (a.taskNumber ?? 0) - (b.taskNumber ?? 0),
    );
    return enrichTasksWithLastRun(ctx.db, ctx.userId, sorted);
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
    if (task && !isTaskVisibleTo(task, ctx.userId)) return null;
    return entityVisible(task);
  },
});

/** Task statuses that count as active (not draft, done or cancelled). */
const ACTIVE_TASK_STATUSES: ReadonlySet<Doc<"agentTasks">["status"]> = new Set(
  OPEN_TASK_STATUSES,
);

/**
 * Active tasks across every repo the user can reach, most recently updated
 * first. Scope rules: team repos plus connected repos, active statuses only.
 */
async function activeTasksForUser(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Array<Doc<"agentTasks">>> {
  const repos = await gatherAccessibleRepos(ctx.db, userId, true);
  const taskArrays = await Promise.all(
    repos.flatMap((repo) =>
      [...ACTIVE_TASK_STATUSES].map((status) =>
        ctx.db
          .query("agentTasks")
          .withIndex("by_repo_and_status", (q) =>
            q.eq("repoId", repo._id).eq("status", status),
          )
          .collect(),
      ),
    ),
  );
  return filterActiveEntities(taskArrays.flat()).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );
}

/**
 * Quick tasks in the repo with a live sandbox: the sidebar badge count.
 *
 * Reads only sandbox-live rows (`by_repo_and_sandbox_status`). It replaced a
 * query that sent every active task document to the always-mounted sidebar,
 * 259 KB for 150 tasks in the load test, resent on every task change.
 */
export const countSandboxTasks = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.number(),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return 0;
    const live = await Promise.all(
      (["active", "starting"] as const).map((status) =>
        ctx.db
          .query("agentTasks")
          .withIndex("by_repo_and_sandbox_status", (q) =>
            q.eq("repoId", args.repoId).eq("reviewTaskSandboxStatus", status),
          )
          .collect(),
      ),
    );
    return filterActiveEntities(live.flat()).filter(
      (task) => !task.projectId && ACTIVE_TASK_STATUSES.has(task.status),
    ).length;
  },
});

/**
 * Fields the orchestrator's `list_agents` needs from a task — and nothing else.
 *
 * Whole task documents carry `backgroundAgents` and `description` that
 * measured up to 35KB and 8KB on real data; the fleet list keeps
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
  /** Main run or chat turn: one sandbox-busy status (`taskIsExecuting`). */
  isExecuting: v.boolean(),
});

/** Active tasks (`activeTasksForUser`), slim, for the orchestrator fleet list. */
export const getActiveTasksSlim = authQuery({
  args: {},
  returns: v.array(orchestratorTaskValidator),
  handler: async (
    ctx,
  ): Promise<Array<Infer<typeof orchestratorTaskValidator>>> => {
    const tasks = await activeTasksForUser(ctx, ctx.userId);
    const openChatEntityIds = await turnIdsForRepos(
      ctx.db,
      tasks,
      openChatEntityIdsForRepo,
    );
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
      isExecuting: taskIsExecuting(task, openChatEntityIds),
    }));
  },
});

/** Returns all non-draft tasks for a repo, enriched with latest run time, sorted by creation date. */
export const getAllTasks = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(agentTaskWithLastRunValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];

    const taskArrays = await Promise.all(
      NON_DRAFT_TASK_STATUSES.map((status) =>
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
    return enrichTasksWithLastRun(ctx.db, ctx.userId, tasks);
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
      depTasks.filter(
        (t): t is Exclude<typeof t, null> =>
          t !== null && isTaskVisibleTo(t, ctx.userId),
      ),
    ).map((t) => ({
      _id: t._id,
      title: t.title,
      taskNumber: t.taskNumber,
    }));
  },
});

type TaskStatusRow = {
  id: Id<"agentTasks">;
  status: Doc<"agentTasks">["status"];
};

/** Returns the status of the given tasks the caller can access. */
export const getStatusesByIds = authQuery({
  args: { ids: v.array(v.id("agentTasks")) },
  returns: v.array(
    v.object({
      id: v.id("agentTasks"),
      status: taskStatusValidator,
    }),
  ),
  handler: async (ctx, args) => {
    // The Chrome extension polls ids it has seen; ids the caller cannot
    // access are dropped exactly like deleted tasks.
    const statuses: TaskStatusRow[] = [];
    for (const id of args.ids) {
      const task = await ctx.db.get(id);
      if (task && (await hasTaskAccess(ctx.db, task, ctx.userId))) {
        statuses.push({ id: task._id, status: task.status });
      }
    }
    return statuses;
  },
});


/**
 * Cap on duplicate candidates handed to findings triage. Jev takes at most 255
 * choice options, and a longer list costs tokens without helping — the most
 * recently touched open tasks are the ones a fresh finding can duplicate.
 */
const OPEN_TASK_TITLE_LIMIT = 150;

/**
 * Titles of a repo's open tasks, newest-touched first. Internal: findings
 * triage asks Jev whether a finding is already tracked, and only needs an id,
 * a number and a title per candidate.
 */
export const listOpenTaskTitles = internalQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(
    v.object({
      _id: v.id("agentTasks"),
      numId: v.optional(v.number()),
      title: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const perStatus = await Promise.all(
      OPEN_TASK_STATUSES.map((status) =>
        ctx.db
          .query("agentTasks")
          .withIndex("by_repo_status_and_deleted", (q) =>
            q
              .eq("repoId", args.repoId)
              .eq("status", status)
              .eq("deletedAt", undefined),
          )
          .order("desc")
          .take(OPEN_TASK_TITLE_LIMIT),
      ),
    );
    return perStatus
      .flat()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, OPEN_TASK_TITLE_LIMIT)
      .map((task) => ({
        _id: task._id,
        numId: task.numId,
        title: task.title,
      }));
  },
});
