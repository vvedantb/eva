import { ConvexError, v, type Infer } from "convex/values";
import { internalMutation, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  getProjectWithAccess,
  hasRepoAccess,
  normalizeIdOrThrow,
} from "../functions";
import { validateRepoGroupMembers } from "../_repoGroups/validate";
import { createTodoTask } from "../_agentTasks/mutations";
import { latestChatMessageId, resolveChatParent } from "../_chat/chatParent";

const coordinatorTaskInput = v.object({
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  repoId: v.optional(v.id("githubRepos")),
  linkedRepoIds: v.optional(v.array(v.id("githubRepos"))),
  phaseLabel: v.optional(v.string()),
});

type CoordinatorTask = Infer<typeof coordinatorTaskInput>;

function taskLabel(task: CoordinatorTask): string {
  return task.title ?? task.description?.slice(0, 60) ?? "a task";
}

async function linkedReposError(
  ctx: MutationCtx,
  homeRepoId: Id<"githubRepos">,
  linkedRepoIds: readonly Id<"githubRepos">[],
): Promise<string | null> {
  const repos = await Promise.all(
    [homeRepoId, ...linkedRepoIds].map((id) => ctx.db.get(id)),
  );
  const members: Doc<"githubRepos">[] = [];
  for (const repo of repos) {
    if (repo === null) return "One of its repositories no longer exists.";
    members.push(repo);
  }
  const [home, ...linked] = members.map((repo) => ({
    id: repo._id,
    owner: repo.owner,
    name: repo.name,
  }));
  return validateRepoGroupMembers(home, linked);
}

/** Creates the coordinator's tasks and their batch row. */
export async function createCoordinatorTasks(
  ctx: MutationCtx,
  params: {
    projectId: Id<"projects">;
    userId: Id<"users">;
    tasks: ReadonlyArray<CoordinatorTask>;
  },
): Promise<{ taskIds: Id<"agentTasks">[]; batchId: Id<"projectTaskBatches"> }> {
  const { projectId, userId, tasks } = params;
  if (tasks.length === 0) throw new Error("Create at least one task.");
  const project = await getProjectWithAccess(ctx.db, projectId, userId);
  const access = await Promise.all(
    tasks.map(async (task) => {
      const repoIds = [
        task.repoId ?? project.repoId,
        ...(task.linkedRepoIds ?? []),
      ];
      const allowed = await Promise.all(
        repoIds.map((repoId) => hasRepoAccess(ctx.db, repoId, userId)),
      );
      return allowed.every(Boolean);
    }),
  );
  for (const [index, task] of tasks.entries()) {
    if (!access[index]) {
      throw new ConvexError(
        `Cannot create "${taskLabel(task)}": the user has no access to its repository or a linked one. Pick repositories they can access, or leave repoName out to use the project's home repository.`,
      );
    }
    const linkedRepoIds = task.linkedRepoIds ?? [];
    if (linkedRepoIds.length === 0) continue;
    const error = await linkedReposError(
      ctx,
      task.repoId ?? project.repoId,
      linkedRepoIds,
    );
    if (error !== null) {
      throw new ConvexError(
        `Cannot create "${taskLabel(task)}" across several repos: ${error}. List only repos besides the task's own repo, each once.`,
      );
    }
  }
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
          linkedRepoIds: task.linkedRepoIds,
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
        linkedRepoIds: v.optional(v.array(v.string())),
      }),
    ),
  },
  returns: v.object({
    taskIds: v.array(v.id("agentTasks")),
    batchId: v.id("projectTaskBatches"),
  }),
  handler: async (ctx, args) =>
    await createCoordinatorTasks(ctx, {
      projectId: normalizeIdOrThrow(
        ctx.db,
        "projects",
        args.projectId,
        "Project",
      ),
      userId: normalizeIdOrThrow(ctx.db, "users", args.userId, "User"),
      tasks: args.tasks.map(({ repoId, linkedRepoIds, ...task }) => ({
        ...task,
        ...(repoId !== undefined
          ? {
              repoId: normalizeIdOrThrow(ctx.db, "githubRepos", repoId, "Repo"),
            }
          : {}),
        ...(linkedRepoIds !== undefined && linkedRepoIds.length > 0
          ? {
              linkedRepoIds: linkedRepoIds.map((id) =>
                normalizeIdOrThrow(ctx.db, "githubRepos", id, "Repo"),
              ),
            }
          : {}),
      })),
    }),
});
