import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { authQuery, hasRepoAccess, hasTaskAccess } from "./functions";
import { cancelledMessageOutcome } from "./_chat/cancelledMessage";
import {
  AUTOMATION_RUN_STREAM_PREFIX,
  PR_RECAP_STREAM_PREFIX,
  PROJECT_CHAT_STREAM_PREFIX,
  SESSION_SUMMARY_STREAM_PREFIX,
  TASK_CHAT_STREAM_PREFIX,
  TASK_RUN_STREAM_PREFIX,
} from "./_chat/agentStreamIds";
import {
  parseSandboxStartupEntityId,
  resolveSandboxOwnerForUser,
  type SandboxOwner,
} from "./_sandbox/owner";
import { findDocWithAccess } from "./_docs/access";

/**
 * Finalize an in-flight assistant message after the user hits stop.
 * Keeps whatever streamed text / tool timeline exists; deletes the bubble when
 * nothing was produced (avoids leaving "Execution cancelled by user.").
 */
export async function finalizeCancelledAssistantMessage(
  ctx: MutationCtx,
  message: Doc<"messages">,
  streaming: Doc<"streamingActivity"> | null,
): Promise<void> {
  const outcome = cancelledMessageOutcome(message, streaming);
  if (outcome.kind === "skip") return;
  if (outcome.kind === "delete") {
    await ctx.db.delete(message._id);
    return;
  }
  await ctx.db.patch(message._id, {
    ...(outcome.content !== undefined ? { content: outcome.content } : {}),
    ...(outcome.activityLog !== undefined
      ? { activityLog: outcome.activityLog }
      : {}),
    finishedAt: Date.now(),
  });
}

/** Overlapping heartbeat + flush both bump lastUpdatedAt; 2s is far below the 5-minute stale threshold. */
export const STREAMING_TOUCH_COALESCE_MS = 2_000;

export function shouldCoalesceStreamingTouch(
  lastUpdatedAt: number | undefined,
  now: number,
): boolean {
  if (lastUpdatedAt === undefined) return false;
  return now - lastUpdatedAt < STREAMING_TOUCH_COALESCE_MS;
}

const activityStateValidator = v.union(
  v.object({
    currentActivity: v.string(),
    currentContent: v.string(),
    pendingQuestion: v.optional(v.string()),
  }),
  v.null(),
);

const setArgs = {
  entityId: v.string(),
  currentActivity: v.string(),
  currentContent: v.optional(v.string()),
  pendingQuestion: v.optional(v.string()),
};

async function readStreamingActivity(ctx: QueryCtx, entityId: string) {
  const streaming = await ctx.db
    .query("streamingActivity")
    .withIndex("by_entity", (q) => q.eq("entityId", entityId))
    .first();
  if (!streaming) return null;
  return {
    currentActivity: streaming.currentActivity,
    currentContent: streaming.currentContent ?? "",
    pendingQuestion: streaming.pendingQuestion,
  };
}

/** Updates or creates streaming activity state for an entity, only writing on actual changes. */
export async function upsertStreamingActivity(
  ctx: MutationCtx,
  args: {
    entityId: string;
    currentActivity: string;
    currentContent?: string;
    pendingQuestion?: string;
  },
): Promise<void> {
  const existing = await ctx.db
    .query("streamingActivity")
    .withIndex("by_entity", (q) => q.eq("entityId", args.entityId))
    .first();
  const now = Date.now();
  const nextContent = args.currentContent ?? "";
  if (existing) {
    const activityChanged = existing.currentActivity !== args.currentActivity;
    const contentChanged = (existing.currentContent ?? "") !== nextContent;
    const questionChanged =
      (existing.pendingQuestion ?? "") !== (args.pendingQuestion ?? "");
    if (activityChanged || contentChanged || questionChanged) {
      await ctx.db.patch(existing._id, {
        currentActivity: args.currentActivity,
        currentContent: nextContent,
        pendingQuestion: args.pendingQuestion,
        lastUpdatedAt: now,
      });
    } else if (!shouldCoalesceStreamingTouch(existing.lastUpdatedAt, now)) {
      await ctx.db.patch(existing._id, {
        lastUpdatedAt: now,
      });
    }
  } else {
    await ctx.db.insert("streamingActivity", {
      entityId: args.entityId,
      currentActivity: args.currentActivity,
      currentContent: nextContent,
      pendingQuestion: args.pendingQuestion,
      lastUpdatedAt: now,
    });
  }
}

/** Whose live output a streaming row carries, by its entity id. */
type StreamOwner =
  | { kind: "sandboxOwner"; owner: SandboxOwner }
  | { kind: "sessionChat"; chatId: Id<"sessionChats"> }
  | { kind: "doc"; docId: Id<"docs"> }
  | { kind: "report"; reportId: Id<"evaluationReports"> }
  | { kind: "taskRun"; runId: Id<"agentRuns"> }
  | { kind: "automationRun"; runId: Id<"automationRuns"> };

/**
 * Maps every streaming entity id the app reads to its owner: the prefixed
 * ids (`_chat/agentStreamIds.ts`, the chat prefixes, sandbox startup rows)
 * and the bare row ids of session chats, sessions, docs (interview, test
 * gen), evaluation reports and projects (interview). Unknown ids map to null.
 */
function parseStreamOwner(
  db: QueryCtx["db"],
  entityId: string,
): StreamOwner | null {
  const startup = parseSandboxStartupEntityId(db, entityId);
  if (startup) return { kind: "sandboxOwner", owner: startup };
  const after = (prefix: string) =>
    entityId.startsWith(prefix) ? entityId.slice(prefix.length) : null;

  const taskRun = after(TASK_RUN_STREAM_PREFIX);
  if (taskRun !== null) {
    const runId = db.normalizeId("agentRuns", taskRun);
    return runId ? { kind: "taskRun", runId } : null;
  }
  const automationRun = after(AUTOMATION_RUN_STREAM_PREFIX);
  if (automationRun !== null) {
    const runId = db.normalizeId("automationRuns", automationRun);
    return runId ? { kind: "automationRun", runId } : null;
  }
  const recap = after(PR_RECAP_STREAM_PREFIX);
  if (recap !== null) {
    const docId = db.normalizeId("docs", recap);
    return docId ? { kind: "doc", docId } : null;
  }
  const summary = after(SESSION_SUMMARY_STREAM_PREFIX);
  if (summary !== null) {
    const sessionId = db.normalizeId("sessions", summary);
    return sessionId
      ? { kind: "sandboxOwner", owner: { kind: "session", sessionId } }
      : null;
  }
  const taskChat = after(TASK_CHAT_STREAM_PREFIX);
  if (taskChat !== null) {
    const taskId = db.normalizeId("agentTasks", taskChat);
    return taskId
      ? { kind: "sandboxOwner", owner: { kind: "task", taskId } }
      : null;
  }
  const projectChat = after(PROJECT_CHAT_STREAM_PREFIX);
  if (projectChat !== null) {
    const projectId = db.normalizeId("projects", projectChat);
    return projectId
      ? { kind: "sandboxOwner", owner: { kind: "project", projectId } }
      : null;
  }

  const chatId = db.normalizeId("sessionChats", entityId);
  if (chatId) return { kind: "sessionChat", chatId };
  const sessionId = db.normalizeId("sessions", entityId);
  if (sessionId) {
    return { kind: "sandboxOwner", owner: { kind: "session", sessionId } };
  }
  const docId = db.normalizeId("docs", entityId);
  if (docId) return { kind: "doc", docId };
  const reportId = db.normalizeId("evaluationReports", entityId);
  if (reportId) return { kind: "report", reportId };
  const projectId = db.normalizeId("projects", entityId);
  if (projectId) {
    return { kind: "sandboxOwner", owner: { kind: "project", projectId } };
  }
  const taskId = db.normalizeId("agentTasks", entityId);
  if (taskId) return { kind: "sandboxOwner", owner: { kind: "task", taskId } };
  return null;
}

/** The read rule of the entity that owns a streaming row. */
async function canReadStream(
  db: QueryCtx["db"],
  userId: Id<"users">,
  owner: StreamOwner,
): Promise<boolean> {
  switch (owner.kind) {
    case "sandboxOwner":
      return (await resolveSandboxOwnerForUser(db, userId, owner.owner)) !== null;
    case "sessionChat": {
      const chat = await db.get(owner.chatId);
      return chat !== null && (await hasRepoAccess(db, chat.repoId, userId));
    }
    case "doc":
      return (await findDocWithAccess(db, owner.docId, userId)) !== null;
    case "report": {
      // Same rule as `evaluationReports.listByDoc`, where the id comes from.
      const report = await db.get(owner.reportId);
      const doc = report ? await db.get(report.docId) : null;
      return doc !== null && (await hasRepoAccess(db, doc.repoId, userId));
    }
    case "taskRun": {
      // Same rule as `agentRuns.get`: the run follows its task.
      const run = await db.get(owner.runId);
      const task = run ? await db.get(run.taskId) : null;
      return task !== null && (await hasTaskAccess(db, task, userId));
    }
    case "automationRun": {
      const run = await db.get(owner.runId);
      return run !== null && (await hasRepoAccess(db, run.repoId, userId));
    }
  }
}

/**
 * Gets the live agent output for an entity the caller can read. Any other
 * id, including one no surface streams under, reads as null.
 */
export const get = authQuery({
  args: { entityId: v.string() },
  returns: activityStateValidator,
  handler: async (ctx, args) => {
    const owner = parseStreamOwner(ctx.db, args.entityId);
    if (!owner || !(await canReadStream(ctx.db, ctx.userId, owner))) {
      return null;
    }
    return readStreamingActivity(ctx, args.entityId);
  },
});

/** Gets streaming activity state (internal use, no auth check). */
export const internalGet = internalQuery({
  args: { entityId: v.string() },
  returns: activityStateValidator,
  handler: async (ctx, args) => readStreamingActivity(ctx, args.entityId),
});

export async function touchStreamingEntity(
  ctx: MutationCtx,
  entityId: string,
): Promise<boolean> {
  const now = Date.now();
  const existing = await ctx.db
    .query("streamingActivity")
    .withIndex("by_entity", (q) => q.eq("entityId", entityId))
    .first();
  if (!existing) {
    await ctx.db.insert("streamingActivity", {
      entityId,
      currentActivity: "[]",
      currentContent: "",
      lastUpdatedAt: now,
    });
    return true;
  }
  if (shouldCoalesceStreamingTouch(existing.lastUpdatedAt, now)) {
    return true;
  }
  await ctx.db.patch(existing._id, { lastUpdatedAt: now });
  return true;
}

/** Internal touch for HTTP heartbeat route and liveness probe refresh. */
export const internalTouch = internalMutation({
  args: { entityId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => touchStreamingEntity(ctx, args.entityId),
});

/** Updates or creates streaming activity state (internal use, no auth check). */
export const internalSet = internalMutation({
  args: setArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await upsertStreamingActivity(ctx, args);
    return null;
  },
});
