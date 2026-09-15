import {
  customCtx,
  customMutation,
  customQuery,
  customAction,
} from "convex-helpers/server/customFunctions";
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
import { getCurrentUserId } from "./_auth/currentUser";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { scheduleProjectPrSync } from "./_projects/prSync";
import { isEntityDeleted } from "./numId";

/** Checks a loaded repo against connector ownership or team membership. */
export async function userCanAccessRepo(
  db: GenericDatabaseReader<DataModel>,
  repo: Doc<"githubRepos">,
  userId: Id<"users">,
): Promise<boolean> {
  if (repo.connectedBy === userId) return true;
  const teamId = repo.teamId;
  if (!teamId) return false;
  const membership = await db
    .query("teamMembers")
    .withIndex("by_team_and_user", (q) =>
      q.eq("teamId", teamId).eq("userId", userId),
    )
    .first();
  return membership !== null;
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

/** Checks if a user has access to a team — i.e. is a member of it. */
export async function hasTeamAccess(
  db: GenericDatabaseReader<DataModel>,
  teamId: Id<"teams">,
  userId: Id<"users">,
): Promise<boolean> {
  const membership = await db
    .query("teamMembers")
    .withIndex("by_team_and_user", (q) =>
      q.eq("teamId", teamId).eq("userId", userId),
    )
    .first();
  return membership !== null;
}

/** Checks if a user can access a task by verifying access to its parent repo or project. */
export async function hasTaskAccess(
  db: GenericDatabaseReader<DataModel>,
  task: { repoId?: Id<"githubRepos">; projectId?: Id<"projects"> },
  userId: Id<"users">,
): Promise<boolean> {
  if (task.repoId) return hasRepoAccess(db, task.repoId, userId);
  if (task.projectId) {
    const project = await db.get(task.projectId);
    return project ? hasRepoAccess(db, project.repoId, userId) : false;
  }
  return false;
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
  parentId: Id<"sessions"> | Id<"projects"> | Id<"agentTasks">,
  userId: Id<"users">,
): Promise<void> {
  const rawId = String(parentId);
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

/** Patches a project's phase and fires PR sync for the transition. */
async function applyPhaseTransition(
  ctx: MutationCtx,
  project: Doc<"projects">,
  newPhase: Doc<"projects">["phase"],
): Promise<void> {
  const previousPhase = project.phase;
  await ctx.db.patch(project._id, { phase: newPhase });
  const updated = await ctx.db.get(project._id);
  if (updated) {
    await scheduleProjectPrSync(ctx, updated, previousPhase, newPhase);
  }
}

/** Recalculates a project's delivery phase from child task statuses. */
export async function recomputeProjectPhase(
  ctx: MutationCtx,
  projectId: Id<"projects">,
): Promise<void> {
  const db = ctx.db;
  const project = await db.get(projectId);
  if (!project) return;
  if (
    project.phase !== "in_progress" &&
    project.phase !== "business_review" &&
    project.phase !== "code_review" &&
    project.phase !== "completed" &&
    project.phase !== "finalized" &&
    project.phase !== "cancelled"
  ) {
    return;
  }

  if (project.activeBuildWorkflowId) {
    if (project.phase !== "in_progress") {
      await applyPhaseTransition(ctx, project, "in_progress");
    }
    return;
  }

  const businessReviewTask = await db
    .query("agentTasks")
    .withIndex("by_project_and_status", (q) =>
      q.eq("projectId", projectId).eq("status", "business_review"),
    )
    .first();
  if (businessReviewTask) {
    if (project.phase !== "business_review") {
      await applyPhaseTransition(ctx, project, "business_review");
    }
    return;
  }

  const codeReviewTask = await db
    .query("agentTasks")
    .withIndex("by_project_and_status", (q) =>
      q.eq("projectId", projectId).eq("status", "code_review"),
    )
    .first();
  if (codeReviewTask) {
    if (project.phase !== "code_review") {
      await applyPhaseTransition(ctx, project, "code_review");
    }
    return;
  }

  const nonDoneStatuses = ["draft", "cancelled"] as const;
  const nonDoneChecks = await Promise.all(
    nonDoneStatuses.map((status) =>
      db
        .query("agentTasks")
        .withIndex("by_project_and_status", (q) =>
          q.eq("projectId", projectId).eq("status", status),
        )
        .first(),
    ),
  );
  const hasNonDone = nonDoneChecks.some((t) => t !== null);

  const hasDone = await db
    .query("agentTasks")
    .withIndex("by_project_and_status", (q) =>
      q.eq("projectId", projectId).eq("status", "done"),
    )
    .first();

  if (!hasDone && !hasNonDone) {
    // Build-only phase: demote stale in_progress when no active build remains.
    if (project.phase === "in_progress") {
      await applyPhaseTransition(ctx, project, "business_review");
    }
    return;
  }

  const allDone = hasDone !== null && !hasNonDone;
  if (allDone && project.phase !== "completed") {
    await applyPhaseTransition(ctx, project, "completed");
  }
}

/** Fetches a project by ID, throwing if not found or the user lacks access. */
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

/** Returns true if the given task has any queued or running agent runs. */
export async function hasActiveRun(
  db: GenericDatabaseReader<DataModel>,
  taskId: Id<"agentTasks">,
): Promise<boolean> {
  const queued = await db
    .query("agentRuns")
    .withIndex("by_task_and_status", (q) =>
      q.eq("taskId", taskId).eq("status", "queued"),
    )
    .first();
  if (queued) return true;
  const running = await db
    .query("agentRuns")
    .withIndex("by_task_and_status", (q) =>
      q.eq("taskId", taskId).eq("status", "running"),
    )
    .first();
  return running !== null;
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

/** Determines if a PR should be created (no existing PR on project or any task run). */
export async function isFirstTaskOnBranch(
  db: GenericDatabaseReader<DataModel>,
  taskId: Id<"agentTasks">,
  projectId?: Id<"projects">,
): Promise<boolean> {
  if (projectId) {
    const project = await db.get(projectId);
    if (project?.prUrl) return false;
    return true;
  }
  // Check if any run for this task already created a PR
  const runs = await db
    .query("agentRuns")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();
  return !runs.some((run) => run.prUrl);
}

/** Deletes a task and all its related data (runs, dependencies, scheduled functions, sandbox). */
export async function deleteTaskRelatedData(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
): Promise<void> {
  const task = await ctx.db.get(taskId);
  if (task?.scheduledFunctionId) {
    try {
      await ctx.scheduler.cancel(task.scheduledFunctionId);
    } catch {
      // may have already fired
    }
  }
  // Quick tasks persist a sandbox; clean it up so we don't leak compute.
  // Project tasks share their sandbox via `project.sandboxId` — leave that alone.
  if (task && !task.projectId && task.sandboxId && task.repoId) {
    await ctx.scheduler.runAfter(0, internal.sandbox.deleteSandbox, {
      sandboxId: task.sandboxId,
      repoId: task.repoId,
    });
  }
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

/**
 * Soft-deletes a task: cancels schedules and sandbox cleanup, but keeps the row.
 */
export async function softDeleteAgentTask(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
): Promise<void> {
  const task = await ctx.db.get(taskId);
  if (!task || isEntityDeleted(task)) return;
  if (task.scheduledFunctionId) {
    try {
      await ctx.scheduler.cancel(task.scheduledFunctionId);
    } catch {
      // may have already fired
    }
  }
  if (!task.projectId && task.sandboxId && task.repoId) {
    await ctx.scheduler.runAfter(0, internal.sandbox.deleteSandbox, {
      sandboxId: task.sandboxId,
      repoId: task.repoId,
    });
  }
  const runSummary = await ctx.db
    .query("agentTaskRunSummaries")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .unique();
  if (runSummary) {
    await ctx.db.delete(runSummary._id);
  }
  await ctx.db.patch(taskId, { deletedAt: Date.now() });
}

/** Authenticated query wrapper — injects userId into context, throws if not authenticated. */
export const authQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    return { userId };
  }),
);

/** Authenticated mutation wrapper — injects userId into context, throws if not authenticated. */
export const authMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    return { userId };
  }),
);

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

/** Authenticated action wrapper — injects userId into context via a query roundtrip. */
export const authAction = customAction(
  action,
  customCtx(async (ctx: ActionCtx) => {
    const userId = await resolveActionUserId(ctx);
    return { userId };
  }),
);

/** Internal authenticated query — same as authQuery but for internal-only queries. */
export const internalAuthQuery = customQuery(
  internalQuery,
  customCtx(async (ctx) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    return { userId };
  }),
);

/** Internal authenticated mutation — same as authMutation but for internal-only mutations. */
export const internalAuthMutation = customMutation(
  internalMutation,
  customCtx(async (ctx) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    return { userId };
  }),
);

/** Internal authenticated action — same as authAction but for internal-only actions. */
export const internalAuthAction = customAction(
  internalAction,
  customCtx(async (ctx: ActionCtx) => {
    const userId = await resolveActionUserId(ctx);
    return { userId };
  }),
);
