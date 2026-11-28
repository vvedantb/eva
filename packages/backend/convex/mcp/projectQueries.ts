import { v, type Infer } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { DatabaseReader } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  assertTaskNotArchived,
  getProjectWithAccess,
  normalizeIdOrThrow,
  taskRunPending,
} from "../functions";
import { sessionOwner } from "../_sessions/owner";
import { loadSessionChat } from "../_sessionChats/helpers";
import { isEntityArchived } from "../numId";
import { listProjectTasks } from "../_projects/scheduler";
import { loadProjectTaskRows } from "../_projects/taskTable";
import { projectTaskRowValidator } from "../_validators/projectTasks";
import { upsertProjectSummary } from "../_projects/summary";

const callerOwnerValidator = v.union(
  v.object({ kind: v.literal("project"), projectId: v.string() }),
  v.object({
    kind: v.literal("task"),
    taskId: v.string(),
    projectId: v.optional(v.string()),
  }),
);

type CallerOwner = Infer<typeof callerOwnerValidator>;

async function taskOwner(
  db: DatabaseReader,
  taskId: Id<"agentTasks">,
): Promise<CallerOwner | null> {
  const task = await db.get(taskId);
  if (!task) return null;
  return {
    kind: "task",
    taskId: String(task._id),
    ...(task.projectId !== undefined
      ? { projectId: String(task.projectId) }
      : {}),
  };
}

/**
 * Who a sandbox token speaks for (`sessionOwner`): its chat's or session's
 * owner. Null for a standalone session or an unknown id (a one-shot agent's
 * owner). This is what makes "this project" and "my task" resolve without an
 * id.
 */
export const resolveCallerOwner = internalQuery({
  args: {
    entityId: v.optional(v.string()),
    chatId: v.optional(v.string()),
  },
  returns: v.union(callerOwnerValidator, v.null()),
  handler: async (ctx, args): Promise<CallerOwner | null> => {
    const chatId = args.chatId
      ? ctx.db.normalizeId("sessionChats", args.chatId)
      : null;
    if (chatId) {
      const context = await loadSessionChat(ctx.db, chatId);
      if (!context) return null;
      const owner = sessionOwner(context.session);
      if (owner.kind === "project") {
        return { kind: "project", projectId: String(owner.projectId) };
      }
      return owner.kind === "task" ? await taskOwner(ctx.db, owner.taskId) : null;
    }
    if (args.entityId === undefined) return null;
    const sessionId = ctx.db.normalizeId("sessions", args.entityId);
    const session = sessionId ? await ctx.db.get(sessionId) : null;
    if (!session) return null;
    if (session.owner.kind === "project") {
      return {
        kind: "project",
        projectId: String(session.owner.projectId),
      };
    }
    return session.owner.kind === "task"
      ? await taskOwner(ctx.db, session.owner.taskId)
      : null;
  },
});

/** The project's task table for `list_agents` with scope "project". */
export const projectTaskTable = internalQuery({
  args: { projectId: v.string(), userId: v.string() },
  returns: v.array(projectTaskRowValidator),
  handler: async (ctx, args) => {
    const userId = normalizeIdOrThrow(ctx.db, "users", args.userId, "User");
    const project = await getProjectWithAccess(
      ctx.db,
      normalizeIdOrThrow(ctx.db, "projects", args.projectId, "Project"),
      userId,
    );
    return await loadProjectTaskRows(ctx.db, project, userId);
  },
});

/** The project's task with this `taskNumber`, or null. */
export const projectTaskByNumber = internalQuery({
  args: { projectId: v.string(), taskNumber: v.number() },
  returns: v.union(v.id("agentTasks"), v.null()),
  handler: async (ctx, args) => {
    const projectId = ctx.db.normalizeId("projects", args.projectId);
    if (!projectId) return null;
    const task = (await listProjectTasks(ctx.db, projectId)).find(
      (row) => row.taskNumber === args.taskNumber,
    );
    return task?._id ?? null;
  },
});

/** The project a task belongs to, or null (a quick task, or no such task). */
export const taskProjectId = internalQuery({
  args: { taskId: v.string() },
  returns: v.union(v.id("projects"), v.null()),
  handler: async (ctx, args) => {
    const taskId = ctx.db.normalizeId("agentTasks", args.taskId);
    const task = taskId ? await ctx.db.get(taskId) : null;
    return task?.projectId ?? null;
  },
});

/**
 * The chat a doc or artifact was made in, as its project and task, for the
 * rule that a child task never changes a sibling's rows.
 */
export const rowSourceScope = internalQuery({
  args: {
    table: v.union(v.literal("docs"), v.literal("artifacts")),
    id: v.string(),
  },
  returns: v.object({
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.id("agentTasks")),
  }),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId(args.table, args.id);
    const row = id ? await ctx.db.get(id) : null;
    if (!row) return {};
    const taskId = row.sourceTaskId;
    const task = taskId ? await ctx.db.get(taskId) : null;
    const projectId = row.sourceProjectId ?? task?.projectId;
    return {
      ...(projectId !== undefined ? { projectId } : {}),
      ...(taskId !== undefined ? { taskId } : {}),
    };
  },
});

async function notStartedProjectTask(
  db: DatabaseReader,
  projectId: string,
  taskId: string,
  action: "change" | "archive",
): Promise<Doc<"agentTasks">> {
  const task = await db.get(
    normalizeIdOrThrow(db, "agentTasks", taskId, "Task"),
  );
  if (!task || isEntityArchived(task) || String(task.projectId) !== projectId) {
    throw new Error("That task is not part of this project.");
  }
  const started =
    (task.status !== "todo" && task.status !== "draft") ||
    (await taskRunPending(db, task));
  if (started) {
    throw new Error(
      `That task has started. The coordinator can ${action} only tasks that have not started; message it with send_chat_message instead.`,
    );
  }
  return task;
}

/**
 * The coordinator edits one of its project's tasks: only a task that has
 * not started (`notStartedProjectTask`). Sets the phase label when given.
 */
export const editTaskAsCoordinator = internalMutation({
  args: {
    projectId: v.string(),
    taskId: v.string(),
    phaseLabel: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await notStartedProjectTask(
      ctx.db,
      args.projectId,
      args.taskId,
      "change",
    );
    await assertTaskNotArchived(ctx.db, task);
    if (args.phaseLabel !== undefined) {
      await ctx.db.patch(task._id, {
        phaseLabel: args.phaseLabel.trim() || undefined,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

/**
 * Throws unless the coordinator may archive this task of its project: only a
 * task that has not started (`notStartedProjectTask`).
 */
export const assertCoordinatorMayArchiveTask = internalQuery({
  args: { projectId: v.string(), taskId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await notStartedProjectTask(ctx.db, args.projectId, args.taskId, "archive");
    return null;
  },
});

/** `update_project_summary`: replaces the project's summary doc body. */
export const updateProjectSummary = internalMutation({
  args: {
    projectId: v.string(),
    userId: v.string(),
    markdown: v.string(),
  },
  returns: v.id("docs"),
  handler: async (ctx, args) => {
    const project = await getProjectWithAccess(
      ctx.db,
      normalizeIdOrThrow(ctx.db, "projects", args.projectId, "Project"),
      normalizeIdOrThrow(ctx.db, "users", args.userId, "User"),
    );
    if (!args.markdown.trim()) throw new Error("The summary cannot be empty.");
    return await upsertProjectSummary(ctx, project._id, args.markdown);
  },
});
