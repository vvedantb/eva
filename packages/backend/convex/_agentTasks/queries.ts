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
  listProjectTasksForUser,
} from "../functions";
import {
  archivedProjectIds,
  filterLiveTasks,
  filterUnarchived,
} from "../numId";
import { agentTaskValidator } from "./helpers";
import { sessionStatusValidator } from "../_validators/enums";
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
import { loadProjectTaskFacts } from "../_projects/taskTable";
import { projectTaskFactsValidator } from "../_validators/projectTasks";
import {
  liveOwnedSessionStatuses,
  liveTaskSandboxStatuses,
} from "../_sessions/ownedSession";

/**
 * A task list row enriched with its latest run, busy state and session
 * sandbox status.
 */
export const agentTaskWithLastRunValidator = v.object({
  ...agentTaskValidator.fields,
  lastRunStartedAt: v.optional(v.number()),
  /** Main run or chat turn (synthetic turns too): `taskIsExecuting`. */
  isExecuting: v.boolean(),
  /** The sandbox status of the session the task works on (`taskSandboxStatus`). */
  sandboxStatus: v.optional(sessionStatusValidator),
  /** Unread chat reply for this user (`chatReads.ts`). Autonomous runs do not count. */
  hasUnread: v.boolean(),
  /** A chat turn is paused on a blocking question for the user. */
  isAwaitingAnswer: v.boolean(),
  /**
   * A project task in a repo the caller cannot access (`listByProject`): only
   * its number, status and PR state are kept, so project status still counts
   * it. The title is empty.
   */
  locked: v.optional(v.boolean()),
  /**
   * `listByProject` only: the task as the shared status rules read it
   * (`@eva/shared/projectStatus`), with the usage limit, open ask and
   * coordinator retries the row alone does not carry.
   */
  facts: v.optional(projectTaskFactsValidator),
});

/** A locked `listByProject` row: what derived project status needs, nothing more. */
function lockedTaskRow(
  task: Doc<"agentTasks">,
): Infer<typeof agentTaskWithLastRunValidator> {
  return {
    _id: task._id,
    _creationTime: task._creationTime,
    title: "",
    status: task.status,
    projectId: task.projectId,
    taskNumber: task.taskNumber,
    prState: task.prState,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    createdBy: task.createdBy,
    isExecuting: false,
    hasUnread: false,
    isAwaitingAnswer: false,
    locked: true,
  };
}

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
    taskSandboxStatus,
  ] = await Promise.all([
    chatTurnFlagsForRepos(db, repoIds),
    tasks.length <= POINT_READ_LIMIT
      ? pointReadLookups(db, userId, tasks, repoIds)
      : repoWideLookups(db, userId, [...repoIds]),
    liveTaskSandboxStatuses(db, repoIds),
  ]);

  return Promise.all(
    tasks.map(async (task) => {
      const summary = summariesByTask.get(String(task._id));
      const isExecuting = taskIsExecuting(task, openChatEntityIds);
      const hasUnread = await unreadOf(task);
      const isAwaitingAnswer = awaitingAnswerIds.has(String(task._id));
      // The same session the task page reads (`liveTaskSandboxStatuses`).
      const row = { ...task, sandboxStatus: taskSandboxStatus(task) };
      if (summary) {
        return {
          ...row,
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
        ...row,
        lastRunStartedAt: latestRun?.startedAt,
        isExecuting,
        hasUnread,
        isAwaitingAnswer,
      };
    }),
  );
}

/**
 * Lists all tasks for a project in `taskNumber` order, enriched with latest
 * run time. A task in a repo the caller cannot access is a locked row
 * (`lockedTaskRow`). With `archived`, only the tasks archived on their own
 * (the task list's Archived group); they never count in the project's status.
 */
export const listByProject = authQuery({
  args: { projectId: v.id("projects"), archived: v.optional(v.boolean()) },
  returns: v.array(agentTaskWithLastRunValidator),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || !(await hasRepoAccess(ctx.db, project.repoId, ctx.userId)))
      return [];
    const [listed, factsById] = await Promise.all([
      listProjectTasksForUser(
        ctx.db,
        args.projectId,
        ctx.userId,
        args.archived === true,
      ),
      loadProjectTaskFacts(ctx.db, project),
    ]);
    const withFacts = (
      row: Infer<typeof agentTaskWithLastRunValidator>,
    ): Infer<typeof agentTaskWithLastRunValidator> => {
      const facts = factsById.get(String(row._id));
      return facts ? { ...row, facts } : row;
    };
    const rows = listed.sort(
      (a, b) => (a.task.taskNumber ?? 0) - (b.task.taskNumber ?? 0),
    );
    const enriched = await enrichTasksWithLastRun(
      ctx.db,
      ctx.userId,
      rows.filter((row) => row.canAccess).map((row) => row.task),
    );
    const enrichedById = new Map(enriched.map((row) => [String(row._id), row]));
    return rows.flatMap<Infer<typeof agentTaskWithLastRunValidator>>(
      ({ task, canAccess }) => {
        if (!canAccess) return [withFacts(lockedTaskRow(task))];
        const row = enrichedById.get(String(task._id));
        return row ? [withFacts(row)] : [];
      },
    );
  },
});

/**
 * Retrieves a single task by ID, returning null if not found or unauthorized.
 * An archived task still returns (`archivedAt` set): its page opens read-only.
 */
export const get = authQuery({
  args: { id: v.id("agentTasks") },
  returns: v.union(agentTaskValidator, v.null()),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId))) return null;
    return task;
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

/** Resolves a task by per-repo numeric id (URL segment), archived ones too. */
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
    if (!task || !isTaskVisibleTo(task, ctx.userId)) return null;
    return task;
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
  const [taskArrays, archivedPerRepo] = await Promise.all([
    Promise.all(
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
    ),
    Promise.all(repos.map((repo) => archivedProjectIds(ctx.db, repo._id))),
  ]);
  const archivedProjects = new Set(
    archivedPerRepo.flatMap((ids) => [...ids]),
  );
  return filterLiveTasks(taskArrays.flat(), archivedProjects).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );
}

/**
 * Quick tasks in the repo with a live sandbox: the sidebar badge count.
 *
 * Reads only the live task sessions (`liveOwnedSessionStatuses`). It replaced
 * a query that sent every active task document to the always-mounted sidebar,
 * 259 KB for 150 tasks in the load test, resent on every task change.
 */
export const countSandboxTasks = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.number(),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return 0;
    // A quick task's sandbox lives on its session.
    const sessionStatuses = await liveOwnedSessionStatuses(ctx.db, [
      args.repoId,
    ], "task");
    const liveSessionTasks = await Promise.all(
      [...sessionStatuses]
        .filter(([, status]) => status === "active" || status === "starting")
        .map(([taskId]) => {
          const id = ctx.db.normalizeId("agentTasks", taskId);
          return id ? ctx.db.get(id) : null;
        }),
    );
    return filterUnarchived(
      liveSessionTasks.filter((task) => task !== null),
    ).filter(
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
      isExecuting: taskIsExecuting(task, openChatEntityIds),
    }));
  },
});

/**
 * A repo's non-draft quick tasks (outside a project), live or archived. A
 * project task lives only in its project (`listByProject`), even when it
 * targets this repo; it archives with its project.
 */
async function listQuickTasksByArchive(
  ctx: QueryCtx,
  repoId: Id<"githubRepos">,
  archived: boolean,
): Promise<Array<Doc<"agentTasks">>> {
  const taskArrays = await Promise.all(
    NON_DRAFT_TASK_STATUSES.map((status) =>
      ctx.db
        .query("agentTasks")
        .withIndex("by_repo_status_and_archived", (q) => {
          const inStatus = q.eq("repoId", repoId).eq("status", status);
          return archived
            ? inStatus.gte("archivedAt", 0)
            : inStatus.eq("archivedAt", undefined);
        })
        .collect(),
    ),
  );
  return taskArrays.flat().filter((task) => task.projectId === undefined);
}

/**
 * The repo's live quick tasks, enriched with latest run time, sorted by
 * creation date (`listQuickTasksByArchive`).
 */
export const getAllTasks = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(agentTaskWithLastRunValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const tasks = await listQuickTasksByArchive(ctx, args.repoId, false);
    tasks.sort((a, b) => a.createdAt - b.createdAt);
    return enrichTasksWithLastRun(ctx.db, ctx.userId, tasks);
  },
});

/** The repo's archived quick tasks, most recently archived first. */
export const listArchived = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(agentTaskWithLastRunValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const tasks = await listQuickTasksByArchive(ctx, args.repoId, true);
    tasks.sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));
    return enrichTasksWithLastRun(ctx.db, ctx.userId, tasks);
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
          .withIndex("by_repo_status_and_archived", (q) =>
            q
              .eq("repoId", args.repoId)
              .eq("status", status)
              .eq("archivedAt", undefined),
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
