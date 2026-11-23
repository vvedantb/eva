import {
  customCtx,
  customMutation,
  customQuery,
  customAction,
} from "convex-helpers/server/customFunctions";
import { createAuthFunctions } from "@vvedantb/server";
import type { GenericDatabaseReader } from "convex/server";
import { makeFunctionReference } from "convex/server";
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
import { scheduleProjectPrSync } from "./_projects/prSync";
import { isEntityDeleted } from "./numId";
import { taskBranchName } from "./_git/branchNames";
import { cancelTaskRunSchedule } from "./_agentTasks/runState";
import type { SessionOwner } from "./_sessions/owner";
import {
  projectStatus,
  type ProjectStage,
} from "@eva/shared/projectStatus";
import { projectRoleFor } from "@eva/shared/projectRoles";
import type { ProjectRole } from "./_validators/enums";
import {
  allPullRequestsTerminal,
  findLivePullRequestOnBranch,
  listOwnerPullRequests,
} from "./_pullRequests/store";

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
 * cannot access is locked). The caller checks access to the project.
 */
export async function listProjectTasksForUser(
  db: GenericDatabaseReader<DataModel>,
  projectId: Id<"projects">,
  userId: Id<"users">,
): Promise<Array<{ task: Doc<"agentTasks">; canAccess: boolean }>> {
  const tasks = (
    await db
      .query("agentTasks")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect()
  ).filter((task) => !isEntityDeleted(task) && isTaskVisibleTo(task, userId));
  return Promise.all(
    tasks.map(async (task) => ({
      task,
      canAccess: await hasTaskAccess(db, task, userId),
    })),
  );
}

/**
 * Loads a task and verifies access through its repository or project.
 * `need: "contributor"` also applies the project role rule (`assertCanDrive`).
 */
export async function getTaskWithAccess(
  db: GenericDatabaseReader<DataModel>,
  taskId: Id<"agentTasks">,
  userId: Id<"users">,
  need: ProjectRole = "viewer",
): Promise<Doc<"agentTasks">> {
  const task = await db.get(taskId);
  if (!task) throw new Error("Task not found");
  if (!(await hasTaskAccess(db, task, userId))) {
    throw new Error("Not authorized");
  }
  if (need === "contributor") await assertCanDrive(db, task, userId);
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
 * `projects.phase` for a project with no tasks: what `recomputeProjectPhase`
 * derives for it. The value a new project is inserted with.
 */
export const EMPTY_PROJECT_PHASE: Doc<"projects">["phase"] = "business_review";

/**
 * The stored phase for a derived project stage (`projectStatus`). Only older
 * phone builds read it; nothing in the backend decides on it. In review
 * splits as the old phases did (business review while any task is there,
 * else code review), so a legacy project PR keeps its draft / ready sync.
 */
function phaseForStage(
  stage: ProjectStage,
  tasks: readonly Pick<Doc<"agentTasks">, "status">[],
): Doc<"projects">["phase"] {
  switch (stage) {
    case "done":
      return "completed";
    case "in_progress":
      return "in_progress";
    case "in_review":
      return tasks.some((task) => task.status === "business_review")
        ? "business_review"
        : "code_review";
    case "todo":
      return EMPTY_PROJECT_PHASE;
  }
}

/**
 * The one writer of `projects.phase` from task state, and the hook every
 * child task status change, run end and child PR merge calls.
 *
 * It schedules the project's next ready tasks (`scheduleReadyTasks`, the
 * real work), then writes a best-effort phase derived from the shared
 * `projectStatus` so older phone builds that still read `phase` show
 * something sensible. The phase is never a source of truth: no gate reads it
 * (decision 19). Two legacy states are left alone: an old project still in
 * its interview or spec with no tasks (`draft` / `finalized`), and an old
 * project whose own PRs all merged or closed (`applyProjectPrEvent` set its
 * final phase) until one of its tasks runs again.
 */
export async function recomputeProjectPhase(
  ctx: MutationCtx,
  projectId: Id<"projects">,
): Promise<void> {
  const db = ctx.db;
  const project = await db.get(projectId);
  if (!project) return;
  // Scheduled, as this module stays a leaf; idempotent, so a call with
  // nothing new starts nothing.
  await ctx.scheduler.runAfter(0, internal.buildWorkflow.scheduleReadyTasks, {
    projectId,
  });
  const tasks = (
    await db
      .query("agentTasks")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect()
  ).filter((task) => !isEntityDeleted(task));
  if (
    tasks.length === 0 &&
    (project.phase === "draft" || project.phase === "finalized")
  ) {
    return;
  }
  const { stage } = projectStatus(
    tasks.map((task) => ({
      id: String(task._id),
      status: task.status,
      prState: task.prState,
      // The stage reads status and PR state only.
      approved: task.approvedAt !== undefined,
      usageLimited: false,
      runPending: false,
      dependencies: [],
    })),
  );
  if (
    stage !== "in_progress" &&
    (project.phase === "completed" || project.phase === "cancelled")
  ) {
    const projectPrs = await listOwnerPullRequests(db, {
      kind: "project",
      projectId,
    });
    if (projectPrs.length > 0 && allPullRequestsTerminal(projectPrs)) return;
  }
  const next = phaseForStage(stage, tasks);
  if (next === project.phase) return;
  await ctx.db.patch(project._id, { phase: next });
  const updated = await ctx.db.get(project._id);
  if (updated) {
    // A legacy project PR follows the review phases (draft / ready).
    await scheduleProjectPrSync(ctx, updated, project.phase, next);
  }
}

/**
 * The user's role in a project (`projectRoleFor`): from their Eva role, or
 * contributor as an admin or an owner of the project repo's team. The caller
 * checks repo access.
 */
export async function getProjectRole(
  db: GenericDatabaseReader<DataModel>,
  project: Pick<Doc<"projects">, "repoId">,
  userId: Id<"users">,
): Promise<ProjectRole> {
  const user = await db.get(userId);
  if (!user) return "viewer";
  if (projectRoleFor(user, false) === "contributor") return "contributor";
  const repo = await db.get(project.repoId);
  const membership =
    repo?.teamId !== undefined
      ? await getTeamMembership(db, repo.teamId, userId)
      : null;
  return projectRoleFor(user, membership?.role === "owner");
}

/**
 * Fetches a project by ID, throwing if not found or the user lacks access.
 * `need: "contributor"` is the one role check for project writes: chat with
 * the coordinator or a child task, approve, run, stop, cancel, retry, edit
 * settings. A viewer only reads and files feedback tasks.
 */
export async function getProjectWithAccess(
  db: GenericDatabaseReader<DataModel>,
  projectId: Id<"projects">,
  userId: Id<"users">,
  need: ProjectRole = "viewer",
): Promise<Doc<"projects">> {
  const project = await db.get(projectId);
  if (!project) throw new Error("Project not found");
  if (!(await hasRepoAccess(db, project.repoId, userId))) {
    throw new Error("Not authorized");
  }
  if (
    need === "contributor" &&
    (await getProjectRole(db, project, userId)) !== "contributor"
  ) {
    throw new Error(
      "Project viewers cannot do this. File a feedback task, or ask an Eva admin to set your role to dev.",
    );
  }
  return project;
}

/** `getProjectWithAccess` plus the user's role, for queries that show it. */
export async function getProjectAccess(
  db: GenericDatabaseReader<DataModel>,
  projectId: Id<"projects">,
  userId: Id<"users">,
): Promise<{ project: Doc<"projects">; role: ProjectRole }> {
  const project = await getProjectWithAccess(db, projectId, userId);
  return { project, role: await getProjectRole(db, project, userId) };
}

/** What a person drives: a session's owner (`chatOwner`) or a task. */
type DriveTarget = SessionOwner | Pick<Doc<"agentTasks">, "projectId">;

/**
 * Throws unless the user may drive the target (chat, run, stop, edit). A
 * project and its tasks need a contributor (`getProjectWithAccess`). A
 * standalone session or a quick task adds no rule: the caller's repo or task
 * access check stays the whole check.
 */
export async function assertCanDrive(
  db: GenericDatabaseReader<DataModel>,
  target: DriveTarget,
  userId: Id<"users">,
): Promise<void> {
  let projectId: Id<"projects"> | undefined;
  if (!("kind" in target)) projectId = target.projectId;
  else if (target.kind === "project") projectId = target.projectId;
  else if (target.kind === "task") {
    projectId = (await db.get(target.taskId))?.projectId;
  }
  if (projectId) {
    await getProjectWithAccess(db, projectId, userId, "contributor");
  }
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

/** Deletes a task and all its related data (runs, dependencies, scheduled functions). */
export async function deleteTaskRelatedData(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
): Promise<void> {
  // A task's sandbox is its session's: the delete path retires that session.
  await cancelTaskRunSchedule(ctx, taskId);
  const runs = await ctx.db
    .query("agentRuns")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();
  for (const run of runs) {
    await ctx.db.delete(run._id);
  }
  const dependencies = await ctx.db
    .query("taskDependencies")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();
  for (const dep of dependencies) {
    await ctx.db.delete(dep._id);
  }
  const dependents = await ctx.db
    .query("taskDependencies")
    .withIndex("by_dependency", (q) => q.eq("dependsOnId", taskId))
    .collect();
  for (const dep of dependents) {
    await ctx.db.delete(dep._id);
  }
  const activityEvents = await ctx.db
    .query("taskActivity")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();
  for (const event of activityEvents) {
    await ctx.db.delete(event._id);
  }
  const runSummary = await ctx.db
    .query("agentTaskRunSummaries")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .unique();
  if (runSummary) {
    await ctx.db.delete(runSummary._id);
  }
  await ctx.db.delete(taskId);
}

/** Soft-deletes a task: cancels schedules, but keeps the row. */
export async function softDeleteAgentTask(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
): Promise<void> {
  const task = await ctx.db.get(taskId);
  if (!task || isEntityDeleted(task)) return;
  await cancelTaskRunSchedule(ctx, taskId);
  const runSummary = await ctx.db
    .query("agentTaskRunSummaries")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .unique();
  if (runSummary) {
    await ctx.db.delete(runSummary._id);
  }
  await ctx.db.patch(taskId, { deletedAt: Date.now() });
}

const getUserIdFromIdentityRef = makeFunctionReference<
  "query",
  Record<string, never>,
  Id<"users"> | null
>("auth:getUserIdFromIdentity");

/** Resolves the authenticated user's ID from within an action context by running a query. */
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
