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
import { createTodoTask } from "../_agentTasks/mutations";
import { latestChatMessageId, resolveChatParent } from "../_chat/chatParent";
import { assertProjectRepo } from "./settings";
import {
  coordinatorAutoTurnsInLastHour,
  isCoordinatorPaused,
  MAX_COORDINATOR_AUTO_TURNS_PER_HOUR,
} from "./coordinatorWake";

/**
 * The tasks a project's coordinator creates (`create_task`,
 * `create_tasks_batch`): `todo` and approved, each in one of the project's
 * repos, so the scheduler starts them at once. One tool call is one
 * `projectTaskBatches` row, anchored to the coordinator message it ran in.
 */

/** Most tasks one coordinator call may create. */
export const MAX_TASKS_PER_COORDINATOR_BATCH = 20;

const coordinatorTaskInput = v.object({
  title: v.string(),
  description: v.optional(v.string()),
  /** One of the project's repos; absent is the home repo. */
  repoId: v.optional(v.id("githubRepos")),
  phaseLabel: v.optional(v.string()),
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
  if (tasks.length === 0) throw new Error("Create at least one task.");
  if (tasks.length > MAX_TASKS_PER_COORDINATOR_BATCH) {
    throw new Error(
      `Create at most ${MAX_TASKS_PER_COORDINATOR_BATCH} tasks at once.`,
    );
  }
  const project = await getProjectWithAccess(
    ctx.db,
    projectId,
    userId,
  );
  // Checked for every task before any is written.
  for (const task of tasks) assertProjectRepo(project, task.repoId ?? project.repoId);
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
        { approved: true },
      ),
    );
  }
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
