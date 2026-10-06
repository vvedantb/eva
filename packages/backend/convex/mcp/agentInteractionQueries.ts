import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { hasRepoAccess } from "../functions";
import { entityVisible } from "../numId";
import { createNotification } from "../notifications";
import { notificationUrgencyValidator } from "../validators";

// Backing functions for mcp/agentInteractionTools.ts. Internal only: the tools
// resolve the caller's Eva user id first and pass it in, and every function
// here scopes what it reads or writes to that user.

/**
 * Upper bound on question rows one listing reads. A row only lives while a
 * turn is paused inside AskUserQuestion (and is cleared when the sandbox
 * stops), so the whole table is small; the cap just keeps the read bounded.
 */
const PENDING_SCAN_LIMIT = 500;

const chatKindValidator = v.union(
  v.literal("session"),
  v.literal("task"),
  v.literal("project"),
);

type ChatHit =
  | { kind: "session"; doc: Doc<"sessions"> }
  | { kind: "task"; doc: Doc<"agentTasks"> }
  | { kind: "project"; doc: Doc<"projects"> };

/**
 * The chat a pendingQuestions row belongs to. `entityId` is the generic
 * session/task/project id, and a Convex id encodes its table, so trying each
 * table in turn is a lookup rather than a guess.
 */
async function findChat(ctx: QueryCtx, id: string): Promise<ChatHit | null> {
  const sessionId = ctx.db.normalizeId("sessions", id);
  if (sessionId) {
    const doc = entityVisible(await ctx.db.get(sessionId));
    return doc ? { kind: "session", doc } : null;
  }
  const taskId = ctx.db.normalizeId("agentTasks", id);
  if (taskId) {
    const doc = entityVisible(await ctx.db.get(taskId));
    return doc ? { kind: "task", doc } : null;
  }
  const projectId = ctx.db.normalizeId("projects", id);
  if (projectId) {
    const doc = entityVisible(await ctx.db.get(projectId));
    return doc ? { kind: "project", doc } : null;
  }
  return null;
}

/** A chat's repo. A project's child task inherits its project's repo. */
async function chatRepoId(
  ctx: QueryCtx,
  hit: ChatHit,
): Promise<Id<"githubRepos"> | null> {
  if (hit.kind !== "task") return hit.doc.repoId;
  if (hit.doc.repoId) return hit.doc.repoId;
  if (!hit.doc.projectId) return null;
  const project = await ctx.db.get(hit.doc.projectId);
  return project?.repoId ?? null;
}

/**
 * Unanswered AskUserQuestion prompts on chats the user can reach. Narrow with
 * `entityId` (one chat) or `questionId` (one row). Rows on chats the user
 * cannot reach are dropped silently, so a stranger's id confirms nothing.
 */
export const listPendingQuestionsForUser = internalQuery({
  args: {
    userId: v.string(),
    entityId: v.optional(v.string()),
    questionId: v.optional(v.string()),
  },
  returns: v.array(
    v.object({
      questionId: v.id("pendingQuestions"),
      toolUseId: v.string(),
      payload: v.string(),
      createdAt: v.number(),
      entityId: v.string(),
      kind: chatKindValidator,
      numId: v.optional(v.number()),
      title: v.string(),
      repoOwner: v.string(),
      repoName: v.string(),
      repoRootDirectory: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = ctx.db.normalizeId("users", args.userId);
    if (!userId) return [];

    let rows: Doc<"pendingQuestions">[];
    if (args.questionId !== undefined) {
      const questionId = ctx.db.normalizeId("pendingQuestions", args.questionId);
      const row = questionId ? await ctx.db.get(questionId) : null;
      rows = row ? [row] : [];
    } else if (args.entityId !== undefined) {
      const entityId = args.entityId;
      rows = await ctx.db
        .query("pendingQuestions")
        .withIndex("by_entity", (q) => q.eq("entityId", entityId))
        .take(PENDING_SCAN_LIMIT);
    } else {
      rows = await ctx.db.query("pendingQuestions").take(PENDING_SCAN_LIMIT);
    }

    const result = [];
    for (const row of rows) {
      if (row.answer !== undefined) continue;
      if (args.entityId !== undefined && row.entityId !== args.entityId) {
        continue;
      }
      const hit = await findChat(ctx, row.entityId);
      if (!hit) continue;
      const repoId = await chatRepoId(ctx, hit);
      if (!repoId || !(await hasRepoAccess(ctx.db, repoId, userId))) continue;
      const repo = await ctx.db.get(repoId);
      if (!repo) continue;
      result.push({
        questionId: row._id,
        toolUseId: row.toolUseId,
        payload: row.payload,
        createdAt: row.createdAt,
        entityId: row.entityId,
        kind: hit.kind,
        numId: hit.doc.numId,
        title: hit.doc.title,
        repoOwner: repo.owner,
        repoName: repo.name,
        repoRootDirectory: repo.rootDirectory,
      });
    }
    return result.sort((a, b) => a.createdAt - b.createdAt);
  },
});

/**
 * Puts an agent's message in the user's own inbox through the shared
 * `createNotification` path (href derivation, email scheduling). The chat, if
 * any, was already resolved and access-checked by the MCP tool; it is
 * re-normalised here so a bad id links nothing rather than throwing.
 *
 * Urgency follows the inbox's own semantics: `normal` rides the daily digest,
 * `low` stays in the inbox only (no digest, no toast or chime).
 */
export const notifyUserFromAgent = internalMutation({
  args: {
    userId: v.string(),
    title: v.string(),
    message: v.optional(v.string()),
    urgency: notificationUrgencyValidator,
    chat: v.optional(v.object({ kind: chatKindValidator, id: v.string() })),
  },
  returns: v.id("notifications"),
  handler: async (ctx, args) => {
    const userId = ctx.db.normalizeId("users", args.userId);
    if (!userId) throw new Error("Unknown user.");
    const link: {
      repoId?: Id<"githubRepos">;
      sessionId?: Id<"sessions">;
      projectId?: Id<"projects">;
      taskId?: Id<"agentTasks">;
    } = {};
    const chat = args.chat;
    if (chat?.kind === "session") {
      const sessionId = ctx.db.normalizeId("sessions", chat.id);
      const session = sessionId ? await ctx.db.get(sessionId) : null;
      if (session) {
        link.repoId = session.repoId;
        link.sessionId = session._id;
      }
    } else if (chat?.kind === "project") {
      const projectId = ctx.db.normalizeId("projects", chat.id);
      const project = projectId ? await ctx.db.get(projectId) : null;
      if (project) {
        link.repoId = project.repoId;
        link.projectId = project._id;
      }
    } else if (chat?.kind === "task") {
      const taskId = ctx.db.normalizeId("agentTasks", chat.id);
      const task = taskId ? await ctx.db.get(taskId) : null;
      if (task) {
        link.taskId = task._id;
        link.projectId = task.projectId;
        const project = task.projectId
          ? await ctx.db.get(task.projectId)
          : null;
        link.repoId = task.repoId ?? project?.repoId;
      }
    }

    const notificationId = await createNotification(ctx, {
      userId,
      type: "system",
      title: args.title,
      message: args.message,
      ...link,
    });
    await ctx.db.patch(notificationId, { urgency: args.urgency });
    return notificationId;
  },
});
