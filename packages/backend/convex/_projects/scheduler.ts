import {
  MAX_PARALLEL_PROJECT_TASKS,
  tasksToStart,
  type DependencyFacts,
  type ProjectTaskFacts,
} from "@eva/shared/projectStatus";
import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader, MutationCtx } from "../_generated/server";
import { filterActiveEntities, isEntityDeleted } from "../numId";
import { isFirstTaskOnBranch } from "../functions";
import { latestTaskRun, startTaskRun } from "../_taskWorkflow/startRun";
import { resolveTaskWorkflowBaseBranch } from "../_taskWorkflow/resolveBaseBranch";

/**
 * The project scheduler: it replaces the old one-at-a-time build. It starts
 * every approved `todo` child task whose dependencies are launched (done and
 * merged), in `taskNumber` order, while fewer than
 * `MAX_PARALLEL_PROJECT_TASKS` are in progress. Each task runs like a quick
 * task: its own session, sandbox, branch and PR to main. The rules are the
 * shared ones (`@eva/shared/projectStatus`); this module only loads the facts
 * and starts runs.
 *
 * It runs on three events: a batch approval, a child task's status change
 * (`recomputeProjectPhase`), and a child PR merge (the PR webhook). It is
 * idempotent: a second call on the same state starts nothing.
 */

/** A project's child tasks that are not deleted. */
async function listProjectTasks(
  db: DatabaseReader,
  projectId: Id<"projects">,
): Promise<Doc<"agentTasks">[]> {
  return filterActiveEntities(
    await db
      .query("agentTasks")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect(),
  );
}

/** The tasks `task` depends on, as the dependency rule reads them. */
async function taskDependencyFacts(
  db: DatabaseReader,
  taskId: Id<"agentTasks">,
): Promise<DependencyFacts[]> {
  const rows = await db
    .query("taskDependencies")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();
  const dependencies = await Promise.all(
    rows.map((row) => db.get(row.dependsOnId)),
  );
  return dependencies.flatMap((dep) =>
    dep === null || isEntityDeleted(dep)
      ? []
      : [{ status: dep.status, prState: dep.prState }],
  );
}

/**
 * One child task as the shared rules read it. Only a `todo` task's latest
 * run matters: a failed or cancelled run puts its task back to `todo`.
 */
export async function projectTaskFacts(
  db: DatabaseReader,
  project: Pick<Doc<"projects">, "providerAccountId">,
  task: Doc<"agentTasks">,
  now: number,
): Promise<ProjectTaskFacts> {
  const [dependencies, latest] = await Promise.all([
    taskDependencyFacts(db, task._id),
    task.status === "todo" ? latestTaskRun(db, task._id) : null,
  ]);
  const runPending =
    task.run !== undefined ||
    latest?.status === "queued" ||
    latest?.status === "running";
  // The usage limit holds while its reset is ahead and the task would run
  // on the same account again (it copies the project's at its next start).
  const usageLimited =
    latest?.errorType === "rate_limit" &&
    (latest.limitResetAt === undefined || latest.limitResetAt > now) &&
    task.providerAccountId === project.providerAccountId;
  const halted =
    runPending || latest === null || latest.errorType === "rate_limit"
      ? undefined
      : latest.status === "error"
        ? "failed"
        : latest.status === "cancelled"
          ? "cancelled"
          : undefined;
  return {
    id: String(task._id),
    taskNumber: task.taskNumber,
    status: task.status,
    prState: task.prState,
    approved: task.approvedAt !== undefined,
    halted,
    usageLimited,
    runPending,
    dependencies,
  };
}

/**
 * Starts one child task's run on its own repo (session, branch, GitHub App
 * installation). False when it did not start: a failure here never stops the
 * other tasks. A task whose chat is replying waits for the next event; a
 * workflow that failed to start is marked on its run and shows as failed.
 */
async function startProjectTask(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
): Promise<boolean> {
  if (task.repoId === undefined) return false;
  const repo = await ctx.db.get(task.repoId);
  if (!repo) return false;
  try {
    await startTaskRun(ctx, {
      task,
      repo,
      userId: task.createdBy,
      baseBranch: resolveTaskWorkflowBaseBranch(task, repo),
      isFirstTaskOnBranch: await isFirstTaskOnBranch(ctx.db, task._id),
      triggeringCommentId: task.pendingChangeRequestCommentId,
      clearPendingChangeRequest: true,
      rollbackStatus: "todo",
    });
    return true;
  } catch (error) {
    console.error(
      `[project-scheduler] task=${task._id} did not start: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

/** Starts the project's ready tasks (see the module comment); returns their ids. */
export async function scheduleReadyProjectTasks(
  ctx: MutationCtx,
  projectId: Id<"projects">,
): Promise<Id<"agentTasks">[]> {
  const project = await ctx.db.get(projectId);
  if (!project || isEntityDeleted(project)) return [];
  const tasks = await listProjectTasks(ctx.db, projectId);
  const now = Date.now();
  const facts = await Promise.all(
    tasks.map((task) => projectTaskFacts(ctx.db, project, task, now)),
  );
  const byId = new Map(tasks.map((task) => [String(task._id), task]));
  const started: Id<"agentTasks">[] = [];
  for (const id of tasksToStart(facts)) {
    const task = byId.get(id);
    if (task && (await startProjectTask(ctx, task))) started.push(task._id);
  }
  return started;
}

/**
 * Marks `taskIds` (todo tasks of this project) approved; the ones already
 * approved keep their time. Refuses a task of another project.
 */
export async function approveTasks(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  taskIds: readonly Id<"agentTasks">[],
): Promise<void> {
  const now = Date.now();
  for (const taskId of taskIds) {
    const task = await ctx.db.get(taskId);
    if (!task || task.projectId !== projectId || isEntityDeleted(task)) {
      throw new Error("Task not found in this project");
    }
    if (task.status === "todo" && task.approvedAt === undefined) {
      await ctx.db.patch(taskId, { approvedAt: now, updatedAt: now });
    }
  }
}

/** Every `todo` task of the project: what "start the build" approves. */
export async function projectTodoTaskIds(
  db: DatabaseReader,
  projectId: Id<"projects">,
): Promise<Id<"agentTasks">[]> {
  return (await listProjectTasks(db, projectId))
    .filter((task) => task.status === "todo")
    .map((task) => task._id);
}

/**
 * Takes the approval back from every approved `todo` task that has not
 * started, so the scheduler starts nothing more. Running tasks keep going:
 * each owns its PR. Returns how many tasks it touched.
 */
export async function withdrawUnstartedApprovals(
  ctx: MutationCtx,
  projectId: Id<"projects">,
): Promise<number> {
  const waiting = (await listProjectTasks(ctx.db, projectId)).filter(
    (task) =>
      task.status === "todo" &&
      task.approvedAt !== undefined &&
      task.run === undefined,
  );
  const now = Date.now();
  for (const task of waiting) {
    await ctx.db.patch(task._id, { approvedAt: undefined, updatedAt: now });
  }
  return waiting.length;
}

/**
 * The coordinator's one restart of a failed child task (decision 17): only
 * while `coordinatorRetries` is 0, and it sets it to 1. A second failure then
 * waits for a person ("needs you"); a person's restart never uses the count.
 * The retry is a new run in the same task session, on the same branch.
 */
export async function retryFailedTask(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
): Promise<void> {
  const task = await ctx.db.get(taskId);
  if (!task || task.projectId === undefined || isEntityDeleted(task)) {
    throw new Error("Project task not found");
  }
  if ((task.coordinatorRetries ?? 0) > 0) {
    throw new Error(
      "The coordinator already retried this task once. A person decides now.",
    );
  }
  const project = await ctx.db.get(task.projectId);
  if (!project) throw new Error("Project not found");
  const facts = await projectTaskFacts(ctx.db, project, task, Date.now());
  if (facts.halted !== "failed") {
    throw new Error("Only a task whose last run failed can be retried");
  }
  const running = (await listProjectTasks(ctx.db, project._id)).filter(
    (other) => other.status === "in_progress",
  ).length;
  if (running >= MAX_PARALLEL_PROJECT_TASKS) {
    throw new Error(
      `${MAX_PARALLEL_PROJECT_TASKS} tasks already run in this project. Retry when one ends.`,
    );
  }
  await ctx.db.patch(taskId, { coordinatorRetries: 1 });
  if (!(await startProjectTask(ctx, task))) {
    throw new Error("The task did not start. Try again in a moment.");
  }
}
