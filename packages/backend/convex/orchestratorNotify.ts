import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { workflow } from "./workflowManager";
import { trackSessionWorkflow } from "./workflowWatchdog";
import { clearStreamingActivity } from "./_taskWorkflow/helpers";
import { isEntityDeleted } from "./numId";
import { launchTraitsFromStored, normalizeAIModel } from "./validators";
import {
  decideChildOutcome,
  orchestratorNotifyChildValidator,
  type OrchestratorNotifyChild,
} from "./orchestratorShared";


/** Everything the wake-up message needs about the child that just finished. */
type ChildSummary = {
  masterSessionId: Id<"sessions">;
  kindLabel: string;
  title: string;
  /** Optional because a quick task can exist before a repo is attached. */
  repoId: Id<"githubRepos"> | undefined;
  parentId: Id<"sessions"> | Id<"agentTasks">;
};

async function loadChildSummary(
  ctx: MutationCtx,
  child: OrchestratorNotifyChild,
): Promise<ChildSummary | null> {
  if (child.kind === "session") {
    const session = await ctx.db.get(child.sessionId);
    if (!session || session.watchedByOrchestrator === undefined) return null;
    return {
      masterSessionId: session.watchedByOrchestrator,
      kindLabel: "session",
      title: session.title,
      repoId: session.repoId,
      parentId: session._id,
    };
  }
  const task = await ctx.db.get(child.taskId);
  if (!task || task.watchedByOrchestrator === undefined) return null;
  return {
    masterSessionId: task.watchedByOrchestrator,
    kindLabel: "task",
    title: task.title,
    repoId: task.repoId,
    parentId: task._id,
  };
}

/** Drops the watch pointer once its master is gone, so we stop re-checking it. */
async function clearWatch(
  ctx: MutationCtx,
  child: OrchestratorNotifyChild,
): Promise<void> {
  if (child.kind === "session") {
    await ctx.db.patch(child.sessionId, { watchedByOrchestrator: undefined });
    return;
  }
  await ctx.db.patch(child.taskId, { watchedByOrchestrator: undefined });
}

/**
 * A master that can still be woken. Archived/deleted masters are gone for good,
 * so their watches are dropped. A `closed` master is deliberately NOT treated as
 * gone: closed only means its sandbox stopped, and starting a turn restarts it —
 * exactly what the web composer does when a user messages a closed session.
 */
function isLiveMaster(
  master: Doc<"sessions"> | null,
): master is Doc<"sessions"> {
  return (
    master !== null && !isEntityDeleted(master) && master.archived !== true
  );
}

/**
 * Reads the child's newest non-empty assistant row and hands it to
 * {@link decideChildOutcome}, which owns the labelling rules (and is unit
 * tested in `tests/orchestratorOutcome.test.ts`).
 */
async function resolveChildOutcome(
  ctx: MutationCtx,
  parentId: Id<"sessions"> | Id<"agentTasks">,
  reportedStatus: string,
): Promise<{ status: string; tail: string | undefined }> {
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
 * Wakes the master session watching a child agent that just went idle.
 *
 * Inserts the wake-up as a normal user-role row (flagged
 * `orchestratorNotification` for styling) and then starts the master's turn the
 * same way a queue drain does — `sessionExecuteWorkflow` owns the assistant
 * placeholder and prompt build, so nothing here duplicates `startExecute`. A
 * busy master gets the wake-up queued instead; several children finishing at
 * once therefore drain one after another rather than racing.
 *
 * Notifications never register a watch of their own, so a woken master cannot
 * notify itself into a loop.
 */
export const notifyOrchestratorOfChild = internalMutation({
  args: {
    child: orchestratorNotifyChildValidator,
    /** Terminal state of the child, e.g. "completed", "error", "cancelled". */
    status: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const summary = await loadChildSummary(ctx, args.child);
    if (!summary) return null;

    const master = await ctx.db.get(summary.masterSessionId);
    if (!isLiveMaster(master)) {
      await clearWatch(ctx, args.child);
      return null;
    }
    // A master cannot watch itself into a self-wake loop.
    if (master._id === summary.parentId) return null;

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

    const ownerUserId = master.createdBy ?? master.userId;
    const model = normalizeAIModel(master.lastModel);
    const now = Date.now();

    if (master.activeWorkflowId !== undefined) {
      await ctx.db.insert("queuedMessages", {
        parentId: master._id,
        content,
        createdAt: now,
        order: now,
        userId: ownerUserId,
        model,
        providerAccountId: master.providerAccountId,
        reasoningLevel: master.lastReasoningLevel,
        thinkingEnabled: master.lastThinkingEnabled,
        use1mContext: master.lastUse1mContext,
        fastMode: master.lastFastMode,
        orchestratorNotification: true,
      });
      await ctx.db.patch(master._id, { updatedAt: now });
      return null;
    }

    const masterRepo = await ctx.db.get(master.repoId);
    if (!masterRepo) return null;

    // Same order as the queue drain: wipe any stale streaming row before the
    // workflow stages its assistant placeholder, then insert the user row the
    // placeholder answers.
    await clearStreamingActivity(ctx, String(master._id));
    await ctx.db.insert("messages", {
      parentId: master._id,
      role: "user",
      content,
      timestamp: now,
      userId: ownerUserId,
      model,
      orchestratorNotification: true,
    });

    const workflowId = await workflow.start(
      ctx,
      internal.sessionWorkflow.sessionExecuteWorkflow,
      {
        sessionId: master._id,
        message: content,
        model,
        // Normalised, not forwarded raw: the sticky traits store model defaults
        // (e.g. reasoning "high"), and the workflow feeds these straight into
        // prewarmSessionDaemon — a raw default yields a different opts sig from
        // the page-open prewarm and kills its daemon.
        ...launchTraitsFromStored(model, {
          reasoningLevel: master.lastReasoningLevel,
          thinkingEnabled: master.lastThinkingEnabled,
          use1mContext: master.lastUse1mContext,
          fastMode: master.lastFastMode,
        }),
        providerAccountId: master.providerAccountId,
        credentialOwnerUserId: ownerUserId,
        userId: ownerUserId,
        installationId: masterRepo.installationId,
      },
    );
    await ctx.db.patch(master._id, {
      updatedAt: now,
      lastModel: model,
    });
    await trackSessionWorkflow(ctx, master._id, workflowId);
    return null;
  },
});
