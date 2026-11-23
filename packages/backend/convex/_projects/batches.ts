import { v, type Infer } from "convex/values";
import {
  internalMutation,
  type MutationCtx,
} from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  authQuery,
  getProjectWithAccess,
  normalizeIdOrThrow,
} from "../functions";
import { projectTaskBatchFields } from "../validators";
import { createTodoTask } from "../_agentTasks/mutations";
import { insertTaskDependencies } from "../_agentTasks/dependencies";
import { latestChatMessageId, resolveChatParent } from "../_chat/chatParent";
import { listProjectTasks } from "./scheduler";
import { assertProjectRepo } from "./settings";
import { loadProjectTaskRows, projectTaskRowValidator } from "./taskTable";
import {
  coordinatorAutoTurnsInLastHour,
  isCoordinatorPaused,
  MAX_COORDINATOR_AUTO_TURNS_PER_HOUR,
} from "./coordinatorWake";

/**
 * The tasks a project's coordinator proposes (`create_task`,
 * `create_tasks_batch`): `todo` and not approved (decision 7), each in one of
 * the project's repos, with dependencies that make no cycle. One tool call is
 * one `projectTaskBatches` row, anchored to the coordinator message it ran
 * in, so the chat shows one card for each batch.
 */

/** Most tasks one coordinator call may propose. */
export const MAX_TASKS_PER_COORDINATOR_BATCH = 20;

const coordinatorTaskInput = v.object({
  title: v.string(),
  description: v.optional(v.string()),
  /** One of the project's repos; absent is the home repo. */
  repoId: v.optional(v.id("githubRepos")),
  phaseLabel: v.optional(v.string()),
  /** 0-based indexes of tasks earlier or later in this same batch. */
  dependsOn: v.optional(v.array(v.number())),
  /** `taskNumber`s of the project's existing tasks. */
  dependsOnTaskNumbers: v.optional(v.array(v.number())),
});

/** Creates the coordinator's tasks and their batch row. */
export async function createCoordinatorTasks(
  ctx: MutationCtx,
  params: {
    projectId: Id<"projects">;
    userId: Id<"users">;
    tasks: ReadonlyArray<Infer<typeof coordinatorTaskInput>>;
  },
): Promise<{ taskIds: Id<"agentTasks">[]; batchId: Id<"projectTaskBatches"> }> {
  const { projectId, userId, tasks } = params;
  if (tasks.length === 0) throw new Error("Propose at least one task.");
  if (tasks.length > MAX_TASKS_PER_COORDINATOR_BATCH) {
    throw new Error(
      `Propose at most ${MAX_TASKS_PER_COORDINATOR_BATCH} tasks at once.`,
    );
  }
  const project = await getProjectWithAccess(
    ctx.db,
    projectId,
    userId,
    "contributor",
  );
  // Checked for every task before any is written.
  for (const task of tasks) assertProjectRepo(project, task.repoId ?? project.repoId);
  const existingByNumber = new Map(
    (await listProjectTasks(ctx.db, projectId)).flatMap((task) =>
      task.taskNumber !== undefined ? [[task.taskNumber, task._id] as const] : [],
    ),
  );
  const userCtx = { ...ctx, userId };
  const taskIds: Id<"agentTasks">[] = [];
  for (const task of tasks) {
    taskIds.push(
      await createTodoTask(
        userCtx,
        {
          repoId: task.repoId ?? project.repoId,
          projectId,
          title: task.title,
          description: task.description,
          phaseLabel: task.phaseLabel,
        },
        { need: "contributor", approved: false },
      ),
    );
  }
  const edges: Array<{
    taskId: Id<"agentTasks">;
    dependsOnId: Id<"agentTasks">;
  }> = [];
  tasks.forEach((task, index) => {
    for (const dependsOnIndex of task.dependsOn ?? []) {
      const dependsOnId = taskIds[dependsOnIndex];
      if (!Number.isInteger(dependsOnIndex) || dependsOnId === undefined) {
        throw new Error(
          `Task ${index} depends on index ${dependsOnIndex}, which is not in this batch.`,
        );
      }
      edges.push({ taskId: taskIds[index], dependsOnId });
    }
    for (const taskNumber of task.dependsOnTaskNumbers ?? []) {
      const dependsOnId = existingByNumber.get(taskNumber);
      if (dependsOnId === undefined) {
        throw new Error(`This project has no task #${taskNumber}.`);
      }
      edges.push({ taskId: taskIds[index], dependsOnId });
    }
  });
  // Refuses a task that depends on itself or a cycle; the whole call fails.
  await insertTaskDependencies(ctx, edges);
  const parentId = await resolveChatParent(ctx.db, "project", projectId);
  const messageId = parentId
    ? await latestChatMessageId(ctx.db, parentId)
    : undefined;
  const batchId = await ctx.db.insert("projectTaskBatches", {
    projectId,
    ...(messageId ? { messageId } : {}),
    taskIds,
    createdAt: Date.now(),
  });
  return { taskIds, batchId };
}

/** The coordinator's `create_task` / `create_tasks_batch` (`mcp/tools.ts`). */
export const createTasksFromCoordinator = internalMutation({
  args: {
    projectId: v.string(),
    userId: v.string(),
    tasks: v.array(
      v.object({
        ...coordinatorTaskInput.fields,
        repoId: v.optional(v.string()),
      }),
    ),
  },
  returns: v.object({
    taskIds: v.array(v.id("agentTasks")),
    batchId: v.id("projectTaskBatches"),
  }),
  handler: async (ctx, args) =>
    await createCoordinatorTasks(ctx, {
      projectId: normalizeIdOrThrow(ctx.db, "projects", args.projectId, "Project"),
      userId: normalizeIdOrThrow(ctx.db, "users", args.userId, "User"),
      tasks: args.tasks.map(({ repoId, ...task }) => ({
        ...task,
        ...(repoId !== undefined
          ? { repoId: normalizeIdOrThrow(ctx.db, "githubRepos", repoId, "Repo") }
          : {}),
      })),
    }),
});

const batchValidator = v.object({
  _id: v.id("projectTaskBatches"),
  _creationTime: v.number(),
  ...projectTaskBatchFields,
  /** The batch's tasks that still exist, in batch order, with derived state. */
  tasks: v.array(projectTaskRowValidator),
});

/**
 * Every batch the coordinator proposed, oldest first, each with its tasks'
 * live rows (`loadProjectTaskRows`: stage, needs-you reason, waiting for
 * the coordinator, open ask). A task in a repo the caller cannot open is a
 * locked row. The chat places a card for each batch under `messageId`.
 */
export const listTaskBatches = authQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(batchValidator),
  handler: async (ctx, args) => {
    const project = await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
    );
    const [batches, rows] = await Promise.all([
      ctx.db
        .query("projectTaskBatches")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect(),
      loadProjectTaskRows(ctx.db, project, ctx.userId),
    ]);
    const rowById = new Map(rows.map((row) => [String(row.taskId), row]));
    return batches.map((batch) => ({
      ...batch,
      tasks: batch.taskIds.flatMap((id) => {
        const row = rowById.get(String(id));
        return row ? [row] : [];
      }),
    }));
  },
});

/**
 * The coordinator's automatic turns: whether the hourly cap holds a wake-up
 * back (the project then needs a person), and how many it had in the last
 * hour.
 */
export const getCoordinatorState = authQuery({
  args: { projectId: v.id("projects") },
  returns: v.object({
    paused: v.boolean(),
    autoTurnsLastHour: v.number(),
    maxAutoTurnsPerHour: v.number(),
  }),
  handler: async (ctx, args) => {
    await getProjectWithAccess(ctx.db, args.projectId, ctx.userId);
    const [paused, autoTurnsLastHour] = await Promise.all([
      isCoordinatorPaused(ctx.db, args.projectId),
      coordinatorAutoTurnsInLastHour(ctx.db, args.projectId, Date.now()),
    ]);
    return {
      paused,
      autoTurnsLastHour,
      maxAutoTurnsPerHour: MAX_COORDINATOR_AUTO_TURNS_PER_HOUR,
    };
  },
});
