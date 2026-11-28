import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  decideChildOutcome,
  orchestratorNotifyChildValidator,
  type OrchestratorNotifyChild,
} from "./orchestratorShared";
import { requestRun } from "./_ave/threads";
import { findMainChat } from "./_sessionChats/helpers";
import { findWorkChat } from "./_sessions/ownerState";

type ChildSummary = {
  threadId: Id<"aveThreads">;
  kindLabel: string;
  title: string;
  repoId: Id<"githubRepos"> | undefined;
  parentId: ChildParentId | undefined;
};

type ChildParentId = Id<"sessionChats"> | Id<"sessions">;

async function loadChildSummary(
  ctx: MutationCtx,
  child: OrchestratorNotifyChild,
): Promise<ChildSummary | null> {
  if (child.kind === "session") {
    const session = await ctx.db.get(child.sessionId);
    if (!session || session.watchedByAve === undefined) return null;
    const chatId =
      child.chatId ?? (await findMainChat(ctx.db, session._id))?._id;
    return {
      threadId: session.watchedByAve,
      kindLabel: "session",
      title: session.title,
      repoId: session.repoId,
      parentId: chatId ?? session._id,
    };
  }
  if (child.kind === "project") {
    const project = await ctx.db.get(child.projectId);
    if (!project || project.watchedByAve === undefined) return null;
    const owned = await findWorkChat(ctx.db, { kind: "project", project });
    return {
      threadId: project.watchedByAve,
      kindLabel: "project",
      title: project.title,
      repoId: project.repoId,
      parentId: owned?.chat._id,
    };
  }
  const task = await ctx.db.get(child.taskId);
  if (!task || task.watchedByAve === undefined) return null;
  const owned = await findWorkChat(ctx.db, { kind: "task", task });
  return {
    threadId: task.watchedByAve,
    kindLabel: "task",
    title: task.title,
    repoId: task.repoId,
    parentId: owned?.chat._id,
  };
}

async function clearWatch(
  ctx: MutationCtx,
  child: OrchestratorNotifyChild,
): Promise<void> {
  if (child.kind === "session") {
    await ctx.db.patch(child.sessionId, { watchedByAve: undefined });
    return;
  }
  if (child.kind === "project") {
    await ctx.db.patch(child.projectId, { watchedByAve: undefined });
    return;
  }
  await ctx.db.patch(child.taskId, { watchedByAve: undefined });
}

async function resolveChildOutcome(
  ctx: MutationCtx,
  parentId: ChildParentId | undefined,
  reportedStatus: string,
): Promise<{ status: string; tail: string | undefined }> {
  if (parentId === undefined) {
    return decideChildOutcome(undefined, reportedStatus);
  }
  const recent = await ctx.db
    .query("messages")
    .withIndex("by_parent", (q) => q.eq("parentId", parentId))
    .order("desc")
    .take(10);
  const lastAgentRow = recent.find(
    (message) =>
      message.role === "assistant" && message.content.trim().length > 0,
  );
  return decideChildOutcome(lastAgentRow, reportedStatus);
}

/**
 * Wakes the Manager Ave thread watching a child agent that just went idle.
 *
 * Inserts the wake-up as a user-role row (flagged `orchestratorNotification`
 * for styling) and asks for a run. A busy thread folds it into one follow-up
 * run, so several children finishing at once drain together instead of racing.
 *
 * The watch is one-shot: it clears here, and Ave re-arms it by sending again
 * (or `watch_agent`). A standing watch woke Ave on every later turn the user
 * ran in that chat, and Ave's replies to those wake-ups started new turns.
 */
export const notifyOrchestratorOfChild = internalMutation({
  args: {
    child: orchestratorNotifyChildValidator,
    status: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const summary = await loadChildSummary(ctx, args.child);
    if (!summary) return null;
    await clearWatch(ctx, args.child);

    const thread = await ctx.db.get(summary.threadId);
    if (!thread || thread.archivedAt !== undefined) return null;

    const repo =
      summary.repoId === undefined ? null : await ctx.db.get(summary.repoId);
    const repoLabel = repo ? `${repo.owner}/${repo.name}` : "unknown repo";
    const outcome = await resolveChildOutcome(
      ctx,
      summary.parentId,
      args.status,
    );
    const headline = `[agent-notification] ${summary.kindLabel} "${summary.title}" (${repoLabel}) finished: ${outcome.status}`;
    const content =
      outcome.tail === undefined ? headline : `${headline}\n\n${outcome.tail}`;

    await ctx.db.insert("aveMessages", {
      threadId: thread._id,
      role: "user",
      content,
      timestamp: Date.now(),
      userId: thread.userId,
      orchestratorNotification: true,
    });
    await requestRun(ctx, thread);
    return null;
  },
});
