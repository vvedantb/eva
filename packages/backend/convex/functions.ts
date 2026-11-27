import {
  customCtx,
  customMutation,
  customQuery,
  customAction,
} from "convex-helpers/server/customFunctions";
import { createAuthFunctions } from "@vvedantb/server";
import type { GenericDatabaseReader } from "convex/server";
import { makeFunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { archiveCopy } from "@eva/shared";
import {
  query,
  mutation,
  action,
  internalQuery,
  internalMutation,
  internalAction,
} from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { requireCurrentUserId } from "./_auth/currentUser";
import { assertNotInMaintenance } from "./maintenance";
import type {
  DataModel,
  Doc,
  Id,
  TableNames,
} from "./_generated/dataModel";
import { isEntityArchived } from "./numId";
import { taskBranchName } from "./_git/branchNames";
import { cancelTaskRunSchedule } from "./_agentTasks/runState";
import { findLivePullRequestOnBranch } from "./_pullRequests/store";

/** Checks a loaded repo against connector ownership or team membership. */
export async function userCanAccessRepo(
  db: GenericDatabaseReader<DataModel>,
  repo: Doc<"githubRepos">,
  userId: Id<"users">,
): Promise<boolean> {
  if (repo.connectedBy === userId) return true;
  return repo.teamId !== undefined && hasTeamAccess(db, repo.teamId, userId);
}

/** Checks if a user has access to a repo — either as the connector or via team membership. */
export async function hasRepoAccess(
  db: GenericDatabaseReader<DataModel>,
  repoId: Id<"githubRepos">,
  userId: Id<"users">,
): Promise<boolean> {
  const repo = await db.get(repoId);
  return repo ? await userCanAccessRepo(db, repo, userId) : false;
}

/** Loads a repo and throws unless the user may access it. */
export async function getRepoWithAccess(
  db: GenericDatabaseReader<DataModel>,
  repoId: Id<"githubRepos">,
  userId: Id<"users">,
): Promise<Doc<"githubRepos">> {
  const repo = await db.get(repoId);
  if (!repo) throw new Error("Repository not found");
  if (!(await userCanAccessRepo(db, repo, userId))) {
    throw new Error("Not authorized");
  }
  return repo;
}

/** Loads a repo from an action through an access-controlled query. */
export async function getActionRepoWithAccess(
  ctx: Pick<ActionCtx, "runQuery">,
  repoId: Id<"githubRepos">,
): Promise<Doc<"githubRepos">> {
  const repo = await ctx.runQuery(api.githubRepos.getAccessibleForAction, {
    id: repoId,
  });
  if (!repo) throw new Error("Not authorized to access this repository");
  return repo;
}

/** Verifies both repository access and the repository-to-sandbox binding. */
export async function assertActionSandboxAccess(
  ctx: Pick<ActionCtx, "runQuery">,
  repoId: Id<"githubRepos">,
  sandboxId: string,
): Promise<void> {
  await getActionRepoWithAccess(ctx, repoId);
  const isBound = await ctx.runQuery(internal.sandboxHeal.isBoundToRepo, {
    repoId,
    sandboxId,
  });
  if (!isBound) throw new Error("Not authorized to access this sandbox");
}

/** Verifies team membership from an action through the access-controlled public query. */
export async function assertActionTeamAccess(
  ctx: Pick<ActionCtx, "runQuery">,
  teamId: Id<"teams">,
): Promise<void> {
  const team = await ctx.runQuery(api.teams.get, { id: String(teamId) });
  if (!team) throw new Error("Not authorized to access this team");
}

/** Fetches a user's membership row for a team, or null if they aren't a member. */
export function getTeamMembership(
  db: GenericDatabaseReader<DataModel>,
  teamId: Id<"teams">,
  userId: Id<"users">,
): Promise<Doc<"teamMembers"> | null> {
  return db
    .query("teamMembers")
    .withIndex("by_team_and_user", (q) =>
      q.eq("teamId", teamId).eq("userId", userId),
    )
    .first();
}

/** Throws unless the user is an Eva app admin (`users.isAdmin`). Gates app-wide settings. */
export async function requireAppAdmin(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
): Promise<void> {
  const user = await db.get(userId);
  if (user?.isAdmin !== true) {
    throw new Error("Only app admins can change app-wide settings");
  }
}

/** Checks if a user has access to a team — i.e. is a member of it. */
export async function hasTeamAccess(
  db: GenericDatabaseReader<DataModel>,
  teamId: Id<"teams">,
  userId: Id<"users">,
): Promise<boolean> {
  return (await getTeamMembership(db, teamId, userId)) !== null;
}

/** Throws with the given message unless the user is an owner of the team. */
export async function requireTeamOwner(
  db: GenericDatabaseReader<DataModel>,
  teamId: Id<"teams">,
  userId: Id<"users">,
  errorMessage: string,
): Promise<void> {
  const membership = await getTeamMembership(db, teamId, userId);
  if (!membership || membership.role !== "owner") {
    throw new Error(errorMessage);
  }
}

/** A `draft` task is private to its creator; every other status is shared. */
export function isTaskVisibleTo(
  task: Pick<Doc<"agentTasks">, "status" | "createdBy">,
  userId: Id<"users">,
): boolean {
  return task.status !== "draft" || task.createdBy === userId;
}

/** Checks if a user can access a task: draft privacy, then its parent repo or project. */
export async function hasTaskAccess(
  db: GenericDatabaseReader<DataModel>,
  task: Pick<
    Doc<"agentTasks">,
    "repoId" | "projectId" | "status" | "createdBy"
  >,
  userId: Id<"users">,
): Promise<boolean> {
  if (!isTaskVisibleTo(task, userId)) return false;
  if (task.repoId) return hasRepoAccess(db, task.repoId, userId);
  if (task.projectId) {
    const project = await db.get(task.projectId);
    return project ? hasRepoAccess(db, project.repoId, userId) : false;
  }
  return false;
}

/**
 * A project's live tasks the user may know of (no one else's drafts), each
 * with whether the user can open it (`hasTaskAccess`: a task in a repo they
 * cannot access is locked). With `archived`, the tasks archived on their own
 * instead. The caller checks access to the project.
 */
export async function listProjectTasksForUser(
  db: GenericDatabaseReader<DataModel>,
  projectId: Id<"projects">,
  userId: Id<"users">,
  archived = false,
): Promise<Array<{ task: Doc<"agentTasks">; canAccess: boolean }>> {
  const tasks = (
    await db
      .query("agentTasks")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect()
  ).filter(
    (task) =>
      isEntityArchived(task) === archived && isTaskVisibleTo(task, userId),
  );
  return Promise.all(
    tasks.map(async (task) => ({
      task,
      canAccess: await hasTaskAccess(db, task, userId),
    })),
  );
}

/** Loads a task and verifies access through its repository or project. */
export async function getTaskWithAccess(
  db: GenericDatabaseReader<DataModel>,
  taskId: Id<"agentTasks">,
  userId: Id<"users">,
): Promise<Doc<"agentTasks">> {
  const task = await db.get(taskId);
  if (!task) throw new Error("Task not found");
  if (!(await hasTaskAccess(db, task, userId))) {
    throw new Error("Not authorized");
  }
  return task;
}

/** Loads a session and verifies access through its repository. */
export async function getSessionWithAccess(
  db: GenericDatabaseReader<DataModel>,
  sessionId: Id<"sessions">,
  userId: Id<"users">,
): Promise<Doc<"sessions">> {
  const session = await db.get(sessionId);
  if (!session) throw new Error("Session not found");
  if (!(await hasRepoAccess(db, session.repoId, userId))) {
    throw new Error("Not authorized");
  }
  return session;
}

/** Verifies access to a message parent regardless of its entity kind. */
export async function assertMessageParentAccess(
  db: GenericDatabaseReader<DataModel>,
  parentId:
    | Id<"sessionChats">
    | Id<"sessions">
    | Id<"projects">
    | Id<"agentTasks">,
  userId: Id<"users">,
): Promise<void> {
  const rawId = String(parentId);
  const chatId = db.normalizeId("sessionChats", rawId);
  if (chatId) {
    const chat = await db.get(chatId);
    if (!chat) throw new Error("Chat not found");
    await getSessionWithAccess(db, chat.sessionId, userId);
    return;
  }

  const sessionId = db.normalizeId("sessions", rawId);
  if (sessionId) {
    await getSessionWithAccess(db, sessionId, userId);
    return;
  }

  const projectId = db.normalizeId("projects", rawId);
  if (projectId) {
    await getProjectWithAccess(db, projectId, userId);
    return;
  }

  const taskId = db.normalizeId("agentTasks", rawId);
  if (taskId) {
    const task = await db.get(taskId);
    if (task && (await hasTaskAccess(db, task, userId))) return;
  }

  throw new Error("Not authorized");
}

/**
 * The hook every child task status change, run end and child PR merge calls:
 * it schedules the project's next ready tasks (`scheduleReadyTasks`).
 * Scheduled, as this module stays a leaf; idempotent, so a call with nothing
 * new starts nothing. A project's status is derived from its tasks
 * (`projectStatus`), never stored.
 */
export async function onProjectTasksChanged(
  ctx: MutationCtx,
  projectId: Id<"projects">,
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.buildWorkflow.scheduleReadyTasks, {
    projectId,
  });
}

/**
 * Refuses an edit to an archived project: it is read-only until unarchived.
 * Every mutation that edits a project (or approves its tasks) calls this.
 */
export function assertProjectNotArchived(project: { archivedAt?: number }): void {
  if (isEntityArchived(project)) {
    throw new ConvexError(archiveCopy("project").unarchiveFirst);
  }
}

/**
 * Refuses an edit to an archived task, or to a task of an archived project
 * (a project archives as one unit). Every mutation that edits a task calls this.
 */
export async function assertTaskNotArchived(
  db: GenericDatabaseReader<DataModel>,
  task: Pick<Doc<"agentTasks">, "archivedAt" | "projectId">,
): Promise<void> {
  if (isEntityArchived(task)) {
    throw new ConvexError(archiveCopy("task").unarchiveFirst);
  }
  const project = task.projectId ? await db.get(task.projectId) : null;
  if (project) assertProjectNotArchived(project);
}

/** Fetches a project by ID, throwing if not found or the user lacks repo access. */
export async function getProjectWithAccess(
  db: GenericDatabaseReader<DataModel>,
  projectId: Id<"projects">,
  userId: Id<"users">,
): Promise<Doc<"projects">> {
  const project = await db.get(projectId);
  if (!project) throw new Error("Project not found");
  if (!(await hasRepoAccess(db, project.repoId, userId))) {
    throw new Error("Not authorized");
  }
  return project;
}

/**
 * The task's queued or running agent run, or null. Prefers a queued run over a
 * running one; every agentRuns insert is guarded by an active-run check, so a
 * task has at most one active run and the order does not matter.
 */
export async function getActiveTaskRun(
  db: GenericDatabaseReader<DataModel>,
  taskId: Id<"agentTasks">,
): Promise<Doc<"agentRuns"> | null> {
  const queued = await db
    .query("agentRuns")
    .withIndex("by_task_and_status", (q) =>
      q.eq("taskId", taskId).eq("status", "queued"),
    )
    .first();
  if (queued) return queued;
  return await db
    .query("agentRuns")
    .withIndex("by_task_and_status", (q) =>
      q.eq("taskId", taskId).eq("status", "running"),
    )
    .first();
}

/** Returns true if the given task has any queued or running agent runs. */
export async function hasActiveRun(
  db: GenericDatabaseReader<DataModel>,
  taskId: Id<"agentTasks">,
): Promise<boolean> {
  return (await getActiveTaskRun(db, taskId)) !== null;
}

/**
 * A run of the task is queued, running, scheduled or waiting to retry: its
 * run lifecycle is set (`agentTasks.run`) or an agent run is active.
 */
export async function taskRunPending(
  db: GenericDatabaseReader<DataModel>,
  task: Pick<Doc<"agentTasks">, "_id" | "run">,
): Promise<boolean> {
  return task.run !== undefined || (await hasActiveRun(db, task._id));
}

/** True when a later-started run exists on the same task (stale workflow completion). */
export async function isSupersededTaskRun(
  db: GenericDatabaseReader<DataModel>,
  taskId: Id<"agentTasks">,
  runId: Id<"agentRuns">,
): Promise<boolean> {
  const run = await db.get(runId);
  if (!run || run.taskId !== taskId) return true;
  const runStartedAt = run.startedAt ?? run._creationTime;
  const runs = await db
    .query("agentRuns")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();
  return runs.some((other) => {
    if (other._id === runId) return false;
    const otherStartedAt = other.startedAt ?? other._creationTime;
    return otherStartedAt > runStartedAt;
  });
}

/**
 * True when the run should open a PR rather than refresh one: there is no live
 * PR on the branch it pushes to. A merged or closed PR on that branch means the
 * next run opens a fresh one, which the owner then holds beside the old one.
 */
export async function isFirstTaskOnBranch(
  db: GenericDatabaseReader<DataModel>,
  taskId: Id<"agentTasks">,
): Promise<boolean> {
  const task = await db.get(taskId);
  if (!task?.repoId) return true;
  return (
    (await findLivePullRequestOnBranch(
      db,
      task.repoId,
      taskBranchName(task),
    )) === null
  );
}

/**
 * Archives a task: cancels its scheduled run and hides it from lists. The row
 * and its runs stay; `unarchive` brings it back. The caller retires its session.
 */
export async function archiveAgentTask(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
): Promise<void> {
  const task = await ctx.db.get(taskId);
  if (!task || isEntityArchived(task)) return;
  await cancelTaskRunSchedule(ctx, taskId);
  await ctx.db.patch(taskId, { archivedAt: Date.now() });
}

const getUserIdFromIdentityRef = makeFunctionReference<
  "query",
  Record<string, never>,
  Id<"users"> | null
>("auth:getUserIdFromIdentity");

async function resolveActionUserId(ctx: ActionCtx): Promise<Id<"users">> {
  const userId = await ctx.runQuery(getUserIdFromIdentityRef);
  if (!userId) {
    throw new Error("Not authenticated");
  }
  return userId;
}

/**
 * Authenticated function wrappers — inject `userId` into the handler context,
 * throw if not authenticated, and throw while maintenance mode is on (see
 * `maintenance.ts`). Actions resolve the userId through a query roundtrip.
 */
export const { authQuery, authMutation, authAction } = createAuthFunctions({
  customFunctions: { customQuery, customMutation, customAction, customCtx },
  query,
  mutation,
  action,
  resolveUserId: (ctx) => requireCurrentUserId(ctx),
  resolveActionUserId: (ctx) => resolveActionUserId(ctx),
  beforeEach: () => assertNotInMaintenance(),
});

/**
 * Internal authenticated wrappers — same as the public ones but on the
 * internal builders and with no maintenance gate, so they run during
 * maintenance.
 */
export const {
  authQuery: internalAuthQuery,
  authMutation: internalAuthMutation,
  authAction: internalAuthAction,
} = createAuthFunctions({
  customFunctions: { customQuery, customMutation, customAction, customCtx },
  query: internalQuery,
  mutation: internalMutation,
  action: internalAction,
  resolveUserId: (ctx) => requireCurrentUserId(ctx),
  resolveActionUserId: (ctx) => resolveActionUserId(ctx),
});

/**
 * A string id from outside Convex's validators (an MCP tool's argument),
 * checked against its table. Throws `${what} not found` when it is not one.
 */
export function normalizeIdOrThrow<Table extends TableNames>(
  db: GenericDatabaseReader<DataModel>,
  table: Table,
  id: string,
  what: string,
): Id<Table> {
  const normalized = db.normalizeId(table, id);
  if (normalized === null) throw new Error(`${what} not found`);
  return normalized;
}
