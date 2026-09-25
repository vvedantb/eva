/**
 * What the scope check needs about one finished turn, read in the isolate so
 * the node action never touches the database directly.
 */

import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { MENTION_THRESHOLD } from "./verdict";

/** Enough history to reach the user message behind a long agent turn. */
const RECENT_MESSAGE_LIMIT = 60;

/** The repo a chat belongs to, and the PR it has opened (if any). */
export type ChatOwner = {
  repoId: Id<"githubRepos"> | null;
  prUrl: string | null;
};

/**
 * The repo a chat's diff lives in, and the PR that chat opened. Exported so the
 * mutation that stores a verdict can publish it to that PR without repeating
 * the lookup. `messages.parentId` spans three tables, so normalizeId is the
 * only way to tell which one an id belongs to.
 */
export async function resolveChatOwner(
  ctx: QueryCtx,
  parentId: Doc<"messages">["parentId"],
): Promise<ChatOwner> {
  const empty: ChatOwner = { repoId: null, prUrl: null };
  const sessionId = ctx.db.normalizeId("sessions", parentId);
  if (sessionId !== null) {
    const session = await ctx.db.get(sessionId);
    if (!session) return empty;
    return { repoId: session.repoId, prUrl: session.prUrl ?? null };
  }
  const projectId = ctx.db.normalizeId("projects", parentId);
  if (projectId !== null) {
    const project = await ctx.db.get(projectId);
    if (!project) return empty;
    return { repoId: project.repoId, prUrl: project.prUrl ?? null };
  }
  const taskId = ctx.db.normalizeId("agentTasks", parentId);
  if (taskId !== null) {
    const task = await ctx.db.get(taskId);
    if (!task) return empty;
    // A quick task has no `prUrl` of its own: the PR belongs to the run that
    // opened it, so take the newest run that has one (as `updateTitle` does).
    const runs = await ctx.db
      .query("agentRuns")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
    const prUrl = runs
      .toSorted(
        (left, right) =>
          (right.startedAt ?? right._creationTime) -
          (left.startedAt ?? left._creationTime),
      )
      .find((run) => run.prUrl)?.prUrl;
    return { repoId: task.repoId ?? null, prUrl: prUrl ?? null };
  }
  return empty;
}

/**
 * The turn's checkpoint shas, its repo, the prompt it answered and the reply it
 * gave — or null when there is nothing to judge (no code changed, no prompt to
 * judge against, or a verdict already landed).
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

    const { repoId } = await resolveChatOwner(ctx, message.parentId);
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

    return {
      repoId,
      beforeSha,
      afterSha,
      prompt: prompt.content,
      reply: message.content,
    };
  },
});

/** Shas per call; a PR with more commits than this is read in several passes. */
export const MAX_SHAS_PER_LOOKUP = 100;

/**
 * Every flagged change recorded against the given commits, reduced to what the
 * PR section shows.
 *
 * Keyed on the commit rather than on the chat: a PR that re-lands a turn's
 * commits on a fresh branch carries the same warning as the session that wrote
 * them, which is exactly the case the chip missed.
 *
 * Deduped by file and hunk header — a later turn that re-touched the same lines
 * supersedes the earlier verdict, and only the newest is shown.
 */
export const flaggedForShas = internalQuery({
  args: { shas: v.array(v.string()) },
  returns: v.array(
    v.object({
      summary: v.string(),
      surface: v.string(),
      file: v.string(),
      unreported: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const latest = new Map<
      string,
      { summary: string; surface: string; file: string; unreported: boolean }
    >();
    // Read every sha at once, then fold in commit order: `Promise.all` keeps
    // the input order, so a later commit still supersedes an earlier one.
    const perSha = await Promise.all(
      args.shas.slice(0, MAX_SHAS_PER_LOOKUP).map((sha) =>
        ctx.db
          .query("messages")
          .withIndex("by_after_sha", (q) => q.eq("afterSha", sha))
          .collect(),
      ),
    );
    for (const messages of perSha) {
      for (const message of messages) {
        const check = message.scopeCheck;
        if (check === undefined) continue;
        for (const hunk of check.flagged) {
          latest.set(`${hunk.file} ${hunk.header}`, {
            // Rows judged before the plain-English pass have neither; the file
            // path is still better than dropping the warning entirely.
            summary: hunk.summary ?? "Change the prompt did not ask for",
            surface: hunk.surface ?? hunk.file,
            file: hunk.file,
            unreported:
              hunk.mentioned !== undefined &&
              hunk.mentioned < MENTION_THRESHOLD,
          });
        }
      }
    }
    return [...latest.values()];
  },
});
