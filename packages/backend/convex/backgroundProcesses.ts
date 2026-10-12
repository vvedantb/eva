import { v } from "convex/values";
import type { GenericDatabaseWriter } from "convex/server";
import { authMutation, authQuery, hasRepoAccess } from "./functions";
import {
  internalMutation,
  internalQuery,
  type DatabaseReader,
} from "./_generated/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { backgroundProcessFields } from "./validators";
import { backgroundProcessStatusValidator } from "./_validators/enums";

const COMMAND_MAX_CHARS = 2000;

const backgroundProcessDocValidator = v.object({
  _id: v.id("backgroundProcesses"),
  _creationTime: v.number(),
  ...backgroundProcessFields,
});

/** Marks every running background process for a session as exited. */
export async function markAllRunningExited(
  db: GenericDatabaseWriter<DataModel>,
  sessionId: Id<"sessions">,
): Promise<void> {
  const rows = await db
    .query("backgroundProcesses")
    .withIndex("by_session_and_status", (q) =>
      q.eq("sessionId", sessionId).eq("status", "running"),
    )
    .collect();
  const exitedAt = Date.now();
  for (const row of rows) {
    await db.patch(row._id, { status: "exited", exitedAt });
  }
}

/** Running background processes for the session chat panel (startedAt asc). */
export const listRunning = authQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.array(backgroundProcessDocValidator),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return [];
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
      return [];
    }
    return await ctx.db
      .query("backgroundProcesses")
      .withIndex("by_session_and_status", (q) =>
        q.eq("sessionId", args.sessionId).eq("status", "running"),
      )
      .order("asc")
      .collect();
  },
});

/**
 * The daemon reports under its own entity id. A chat daemon's id resolves to
 * the chat's session — background shells belong to the sandbox, which every
 * chat of the session shares.
 */
async function resolveOwningSession(
  db: DatabaseReader,
  id: Id<"sessions"> | Id<"sessionChats">,
): Promise<Doc<"sessions"> | null> {
  const chatId = db.normalizeId("sessionChats", String(id));
  if (chatId) {
    const chat = await db.get(chatId);
    return chat ? await db.get(chat.sessionId) : null;
  }
  const sessionId = db.normalizeId("sessions", String(id));
  return sessionId ? await db.get(sessionId) : null;
}

/**
 * Upsert a background Bash registration from the sandbox runner.
 * Idempotent on (sessionId, key) for HTTP retries.
 */
export const register = authMutation({
  args: {
    sessionId: v.union(v.id("sessions"), v.id("sessionChats")),
    key: v.string(),
    command: v.string(),
    shellId: v.optional(v.string()),
  },
  returns: v.id("backgroundProcesses"),
  handler: async (ctx, args) => {
    const session = await resolveOwningSession(ctx.db, args.sessionId);
    if (!session) throw new Error("Session not found");
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const command = args.command.slice(0, COMMAND_MAX_CHARS);
    const existing = await ctx.db
      .query("backgroundProcesses")
      .withIndex("by_session_and_key", (q) =>
        q.eq("sessionId", session._id).eq("key", args.key),
      )
      .unique();
    if (existing) {
      if (existing.status === "running") {
        await ctx.db.patch(existing._id, {
          command,
          ...(args.shellId !== undefined ? { shellId: args.shellId } : {}),
        });
      }
      return existing._id;
    }
    return await ctx.db.insert("backgroundProcesses", {
      sessionId: session._id,
      key: args.key,
      command,
      shellId: args.shellId,
      status: "running",
      startedAt: Date.now(),
    });
  },
});

/** Agent KillShell'd its own shell — mark the matching running row exited. */
export const markExitedByShellId = authMutation({
  args: {
    sessionId: v.union(v.id("sessions"), v.id("sessionChats")),
    shellId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await resolveOwningSession(ctx.db, args.sessionId);
    if (!session) return null;
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const rows = await ctx.db
      .query("backgroundProcesses")
      .withIndex("by_session_and_status", (q) =>
        q.eq("sessionId", session._id).eq("status", "running"),
      )
      .collect();
    const exitedAt = Date.now();
    for (const row of rows) {
      if (row.shellId === args.shellId) {
        await ctx.db.patch(row._id, { status: "exited", exitedAt });
      }
    }
    return null;
  },
});

export const markAllExitedForSession = internalMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await markAllRunningExited(ctx.db, args.sessionId);
    return null;
  },
});

export const getInternal = internalQuery({
  args: { id: v.id("backgroundProcesses") },
  returns: v.union(backgroundProcessDocValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Apply reconcile match results. Only patches rows still `running` so a
 * concurrent kill cannot flap a terminal state back to running.
 */
export const applyReconcile = internalMutation({
  args: {
    updates: v.array(
      v.object({
        id: v.id("backgroundProcesses"),
        pid: v.optional(v.number()),
        status: v.union(v.literal("running"), v.literal("exited")),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const exitedAt = Date.now();
    for (const update of args.updates) {
      const row = await ctx.db.get(update.id);
      if (!row || row.status !== "running") continue;
      if (update.status === "exited") {
        await ctx.db.patch(update.id, { status: "exited", exitedAt });
        continue;
      }
      if (update.pid !== undefined) {
        await ctx.db.patch(update.id, { pid: update.pid });
      }
    }
    return null;
  },
});

/** Terminal outcome from kill/reconcile. Never overwrites a non-running row. */
export const markOutcome = internalMutation({
  args: {
    id: v.id("backgroundProcesses"),
    status: backgroundProcessStatusValidator,
    pid: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row || row.status !== "running") return null;
    await ctx.db.patch(args.id, {
      status: args.status,
      exitedAt: Date.now(),
      ...(args.pid !== undefined ? { pid: args.pid } : {}),
    });
    return null;
  },
});

/** Running rows for a session (internal; used by node reconcile/kill). */
export const listRunningInternal = internalQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.array(backgroundProcessDocValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("backgroundProcesses")
      .withIndex("by_session_and_status", (q) =>
        q.eq("sessionId", args.sessionId).eq("status", "running"),
      )
      .order("asc")
      .collect();
  },
});
