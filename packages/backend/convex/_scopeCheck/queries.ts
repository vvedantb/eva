/**
 * What the scope check needs about one finished turn, read in the isolate so
 * the node action never touches the database directly.
 */

import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { resolveExperimentalFlags } from "../_auth/experimentalFlags";

/** Enough history to reach the user message behind a long agent turn. */
const RECENT_MESSAGE_LIMIT = 60;

/**
 * The repo a chat's diff lives in. `messages.parentId` spans four tables, so
 * normalizeId is the only way to tell which one an id belongs to.
 */
async function resolveRepoId(
  ctx: QueryCtx,
  parentId: Doc<"messages">["parentId"],
): Promise<Id<"githubRepos"> | null> {
  const chatId = ctx.db.normalizeId("sessionChats", parentId);
  if (chatId !== null) {
    return (await ctx.db.get(chatId))?.repoId ?? null;
  }
  const sessionId = ctx.db.normalizeId("sessions", parentId);
  if (sessionId !== null) {
    return (await ctx.db.get(sessionId))?.repoId ?? null;
  }
  const projectId = ctx.db.normalizeId("projects", parentId);
  if (projectId !== null) {
    return (await ctx.db.get(projectId))?.repoId ?? null;
  }
  const taskId = ctx.db.normalizeId("agentTasks", parentId);
  if (taskId !== null) {
    return (await ctx.db.get(taskId))?.repoId ?? null;
  }
  return null;
}

/**
 * The turn's checkpoint shas, its repo, the prompt it answered and the reply it
 * gave — or null when there is nothing to judge (no code changed, no prompt to
 * judge against, a verdict already landed, or the asker has the flag off).
 *
 * The reply is what the mention question reads: a change the user was told
 * about is reviewable, one they were not is a surprise in production.
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
      reply: v.string(),
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
    // Opt-in per user (settings → Experimental): off means no Jev spend.
    const asker =
      prompt.userId === undefined ? null : await ctx.db.get(prompt.userId);
    if (!resolveExperimentalFlags(asker).scopeCheck) return null;

    return {
      repoId,
      beforeSha,
      afterSha,
      prompt: prompt.content,
      reply: message.content,
    };
  },
});
