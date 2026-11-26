import { v } from "convex/values";
import {
  internalMutation,
  type DatabaseReader,
} from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { authQuery, getProjectWithAccess, normalizeIdOrThrow } from "../functions";
import { latestChatMessageId, resolveChatParent } from "../_chat/chatParent";

/**
 * The task cards under the coordinator's replies: each task it created
 * (`projectTaskBatches`) or acted on (`projectChatTaskLinks`) in a turn. The
 * apps draw each card from the project's task list, so its status stays live.
 */

/**
 * The coordinator turn a tool call runs in: the newest message of the
 * project's chat, the same anchor rule as artifacts (`chatTurnAnchor`).
 */
export async function coordinatorTurnMessageId(
  db: DatabaseReader,
  projectId: Id<"projects">,
): Promise<Id<"messages"> | undefined> {
  const parentId = await resolveChatParent(db, "project", projectId);
  return parentId ? await latestChatMessageId(db, parentId) : undefined;
}

/**
 * Links an open task to the coordinator turn that started it, gave it work
 * or retried it (`start_task`, `merge_task_into`, `send_chat_message`,
 * `retry_task`). Once per task and turn.
 */
export const linkTaskToTurn = internalMutation({
  args: { projectId: v.string(), taskId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const projectId = normalizeIdOrThrow(
      ctx.db,
      "projects",
      args.projectId,
      "Project",
    );
    const taskId = normalizeIdOrThrow(ctx.db, "agentTasks", args.taskId, "Task");
    const task = await ctx.db.get(taskId);
    if (task?.projectId !== projectId) return null;
    const messageId = await coordinatorTurnMessageId(ctx.db, projectId);
    if (messageId === undefined) return null;
    const links = await ctx.db
      .query("projectChatTaskLinks")
      .withIndex("by_project_and_message", (q) =>
        q.eq("projectId", projectId).eq("messageId", messageId),
      )
      .collect();
    if (links.some((link) => link.taskId === taskId)) return null;
    await ctx.db.insert("projectChatTaskLinks", {
      projectId,
      messageId,
      taskId,
      createdAt: Date.now(),
    });
    return null;
  },
});

/**
 * The project's task cards, each anchored to its coordinator turn, oldest
 * first. A task shows once per turn.
 */
export const listChatTaskCards = authQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      key: v.string(),
      messageId: v.id("messages"),
      taskId: v.id("agentTasks"),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await getProjectWithAccess(ctx.db, args.projectId, ctx.userId);
    const [batches, links] = await Promise.all([
      ctx.db
        .query("projectTaskBatches")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect(),
      ctx.db
        .query("projectChatTaskLinks")
        .withIndex("by_project_and_message", (q) =>
          q.eq("projectId", args.projectId),
        )
        .collect(),
    ]);
    const cards = [
      ...batches.flatMap(({ messageId, taskIds, createdAt }) =>
        messageId === undefined
          ? []
          : taskIds.map((taskId) => ({ messageId, taskId, createdAt })),
      ),
      ...links.map(({ messageId, taskId, createdAt }) => ({
        messageId,
        taskId,
        createdAt,
      })),
    ];
    const seen = new Set<string>();
    const unique = [];
    for (const card of cards.sort((a, b) => a.createdAt - b.createdAt)) {
      const key = `${card.messageId}:${card.taskId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push({ key, ...card });
    }
    return unique;
  },
});
