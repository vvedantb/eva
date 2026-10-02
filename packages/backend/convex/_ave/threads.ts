import { v } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import { internal } from "../_generated/api";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { internalQuery, type MutationCtx } from "../_generated/server";

/**
 * Manager Ave's thread lifecycle. Every run starts through {@link requestRun},
 * so "one run at a time per user" is decided in exactly one place.
 */

/** A run that neither finished nor crashed cleanly is reclaimed after this. */
export const AVE_RUN_WATCHDOG_MS = 11 * 60_000;

export async function findLiveThread(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
): Promise<Doc<"aveThreads"> | null> {
  return await db
    .query("aveThreads")
    .withIndex("by_user_and_archived", (q) =>
      q.eq("userId", userId).eq("archivedAt", undefined),
    )
    .first();
}

export async function getOrCreateLiveThread(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"aveThreads">> {
  const existing = await findLiveThread(ctx.db, userId);
  if (existing) return existing;
  const threadId = await ctx.db.insert("aveThreads", {
    userId,
    status: "idle",
    updatedAt: Date.now(),
  });
  const created = await ctx.db.get(threadId);
  if (!created) throw new Error("Manager Ave thread was not created");
  return created;
}

/**
 * Starts a run, or asks the running one for a follow-up. Arrivals during a run
 * collapse into a single rerun that reads all of them, so N agents finishing
 * at once cost one model turn, not N.
 */
export async function requestRun(
  ctx: MutationCtx,
  thread: Doc<"aveThreads">,
): Promise<void> {
  const now = Date.now();
  if (thread.status === "running") {
    await ctx.db.patch(thread._id, { rerunRequested: true, updatedAt: now });
    return;
  }
  await startRun(ctx, thread._id, now);
}

/** Fences a fresh run id onto the thread and schedules the action + watchdog. */
export async function startRun(
  ctx: MutationCtx,
  threadId: Id<"aveThreads">,
  now: number,
): Promise<void> {
  const runId = crypto.randomUUID();
  await ctx.db.patch(threadId, {
    status: "running",
    runId,
    runStartedAt: now,
    cancelRequested: undefined,
    rerunRequested: undefined,
    updatedAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.mcp.aveRun.run, { threadId, runId });
  await ctx.scheduler.runAfter(
    AVE_RUN_WATCHDOG_MS,
    internal._ave.run.watchdog,
    { threadId, runId },
  );
}

/**
 * Only the caller's own live thread may be registered as a watcher, so a
 * stolen id cannot redirect another user's completion notifications.
 */
export async function assertOwnAveThread(
  db: GenericDatabaseReader<DataModel>,
  threadId: Id<"aveThreads"> | undefined,
  userId: Id<"users">,
): Promise<Id<"aveThreads"> | undefined> {
  if (threadId === undefined) return undefined;
  const thread = await db.get(threadId);
  if (!thread) throw new Error("Manager Ave thread not found");
  if (thread.userId !== userId) throw new Error("Not authorized");
  if (thread.archivedAt !== undefined) {
    throw new Error("Manager Ave thread was reset");
  }
  return threadId;
}

/**
 * The user's live thread, for MCP callers that were not started by Ave. Takes
 * the string id MCP context resolves (`mcpGetContext`).
 */
export const getLiveThreadIdForUser = internalQuery({
  args: { userId: v.string() },
  returns: v.union(v.id("aveThreads"), v.null()),
  handler: async (ctx, args) => {
    const userId = ctx.db.normalizeId("users", args.userId);
    if (!userId) return null;
    return (await findLiveThread(ctx.db, userId))?._id ?? null;
  },
});
