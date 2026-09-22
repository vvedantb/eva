/**
 * What the scope check needs about one finished turn, read in the isolate so
 * the node action never touches the database directly.
 */

import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/** Enough history to reach the user message behind a long agent turn. */
const RECENT_MESSAGE_LIMIT = 60;

/**
 * The repo a chat's diff lives in. `messages.parentId` spans three tables, so
 * normalizeId is the only way to tell which one an id belongs to.
 */
async function resolveRepoId(
  ctx: QueryCtx,
  parentId: Doc<"messages">["parentId"],
): Promise<Id<"githubRepos"> | null> {
  const sessionId = ctx.db.normalizeId("sessions", parentId);
  if (sessionId !== null) {
    const session = await ctx.db.get(sessionId);
    return session ? session.repoId : null;
  }
  const projectId = ctx.db.normalizeId("projects", parentId);
  if (projectId !== null) {
    const project = await ctx.db.get(projectId);
    return project ? project.repoId : null;
  }
  const taskId = ctx.db.normalizeId("agentTasks", parentId);
  if (taskId !== null) {
    const task = await ctx.db.get(taskId);
    return task?.repoId ?? null;
  }
  return null;
}

/**
 * The turn's checkpoint shas, its repo and the prompt it answered — or null
 * when there is nothing to judge (no code changed, no prompt to judge against,
 * or a verdict already landed).
 */
export const getTurnContext = internalQuery({
  args: { messageId: v.id("messages") },
  returns: v.union(
    v.null(),
    v.object({
      repoId: v.id("githubRepos"),
      beforeSha: v.string(),
      afterSha: v.string(),
      prompt: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message || message.role !== "assistant") return null;
    // A re-run (retried schedule, replayed workflow) must not bill Jev twice.
    if (message.scopeCheck !== undefined) return null;

    const { beforeSha, afterSha } = message;
    if (beforeSha === undefined || afterSha === undefined) return null;
    if (beforeSha === afterSha) return null;

    const repoId = await resolveRepoId(ctx, message.parentId);
    if (repoId === null) return null;

    const recent = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", message.parentId))
      .order("desc")
      .take(RECENT_MESSAGE_LIMIT);
    const index = recent.findIndex((row) => row._id === message._id);
    if (index < 0) return null;
    // Newest first, so everything after the reply is older than it. System
    // alerts wear the user role but are Eva's own words, not the ask.
    const prompt = recent
      .slice(index + 1)
      .find((row) => row.role === "user" && row.isSystemAlert !== true);
    if (!prompt) return null;

    return { repoId, beforeSha, afterSha, prompt: prompt.content };
  },
});
