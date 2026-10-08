import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { authQuery, hasRepoAccess } from "../functions";
import { entityVisible, filterActiveEntities } from "../numId";
import { firstUserMessagePreview } from "../_messages/preview";
import {
  deploymentStatusValidator,
  entityNumIdFields,
  sessionStatusValidator,
  aiModelValidator,
  reasoningLevelValidator,
} from "../validators";
import { sessionValidator } from "./helpers";
import { findMainChat } from "../_sessionChats/helpers";

/**
 * Sidebar list shape: omit heavy session fields (planContent, terminal tail,
 * pendingTurn, etc.) so list subscriptions stay small. Detail views use `get`.
 *
 * First-message hover preview is not included — that would N+1 into messages
 * for every row. Hover cards fetch `getFirstMessagePreview` on demand.
 */
const sessionListItemValidator = v.object({
  _id: v.id("sessions"),
  _creationTime: v.number(),
  ...entityNumIdFields,
  repoId: v.id("githubRepos"),
  userId: v.id("users"),
  title: v.string(),
  branchName: v.optional(v.string()),
  baseBranch: v.optional(v.string()),
  prUrl: v.optional(v.string()),
  prState: v.optional(
    v.union(
      v.literal("draft"),
      v.literal("open"),
      v.literal("merged"),
      v.literal("closed"),
    ),
  ),
  sandboxId: v.optional(v.string()),
  updatedAt: v.optional(v.number()),
  status: sessionStatusValidator,
  archived: v.optional(v.boolean()),
  createdBy: v.optional(v.id("users")),
  lastModel: v.optional(aiModelValidator),
  lastReasoningLevel: v.optional(reasoningLevelValidator),
  lastThinkingEnabled: v.optional(v.boolean()),
  lastUse1mContext: v.optional(v.boolean()),
  lastFastMode: v.optional(v.boolean()),
  deploymentStatus: v.optional(deploymentStatusValidator),
  deploymentUrl: v.optional(v.string()),
  /** True for the user's persistent master session (badged in the sidebar). */
  isOrchestrator: v.optional(v.boolean()),
  /**
   * True while any chat of the session has an open turn — a tracked chat
   * workflow or a daemon-minted continuation (`/loop`). List rows read this
   * field instead of N+1 into messages.
   */
  isExecuting: v.boolean(),
  /** Chats of this session with an open turn right now (sidebar count pop). */
  runningChats: v.number(),
});

/** Maps a full session doc to the slim list payload. */
function toSessionListItem(
  session: Doc<"sessions">,
  openTurnsBySession: ReadonlyMap<string, number>,
) {
  const runningChats = openTurnsBySession.get(String(session._id)) ?? 0;
  return {
    _id: session._id,
    _creationTime: session._creationTime,
    numId: session.numId,
    deletedAt: session.deletedAt,
    repoId: session.repoId,
    userId: session.userId,
    title: session.title,
    branchName: session.branchName,
    baseBranch: session.baseBranch,
    prUrl: session.prUrl,
    prState: session.prState,
    sandboxId: session.sandboxId,
    updatedAt: session.updatedAt,
    status: session.status,
    archived: session.archived,
    createdBy: session.createdBy,
    lastModel: session.lastModel,
    lastReasoningLevel: session.lastReasoningLevel,
    lastThinkingEnabled: session.lastThinkingEnabled,
    lastUse1mContext: session.lastUse1mContext,
    lastFastMode: session.lastFastMode,
    deploymentStatus: session.deploymentStatus,
    deploymentUrl: session.deploymentUrl,
    isOrchestrator: session.isOrchestrator,
    isExecuting: runningChats > 0,
    runningChats,
  };
}

/** One indexed query per list subscription, never one turn lookup per row. */
async function openTurnsBySessionForRepo(
  ctx: QueryCtx,
  repoId: Id<"githubRepos">,
): Promise<ReadonlyMap<string, number>> {
  const turns = await ctx.db
    .query("turns")
    .withIndex("by_repo_open", (q) =>
      q.eq("repoId", repoId).eq("open", true),
    )
    .collect();
  const counts = new Map<string, number>();
  for (const turn of turns) {
    // Pre-chat "session" turns carry the session id as their entityId.
    const key = turn.sessionId !== undefined ? String(turn.sessionId) : turn.entityId;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Sorts sessions by most recently updated (falling back to creation time). */
function byMostRecentlyUpdated(a: Doc<"sessions">, b: Doc<"sessions">): number {
  return (b.updatedAt ?? b._creationTime) - (a.updatedAt ?? a._creationTime);
}

/** Lists all non-archived sessions for a repo, sorted by most recently updated. */
export const list = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(sessionListItemValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const [sessionGroups, openTurnsBySession] = await Promise.all([
      Promise.all(
        [undefined, false].map((archived) =>
          ctx.db
            .query("sessions")
            .withIndex("by_repo_archived_and_deleted", (q) =>
              q
                .eq("repoId", args.repoId)
                .eq("archived", archived)
                .eq("deletedAt", undefined),
            )
            .collect(),
        ),
      ),
      openTurnsBySessionForRepo(ctx, args.repoId),
    ]);
    const sessions = sessionGroups.flat();
    return sessions
      .sort(byMostRecentlyUpdated)
      .map((session) => toSessionListItem(session, openTurnsBySession));
  },
});

/** Lists all archived sessions for a repo, sorted by most recently updated. */
export const listArchived = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(sessionListItemValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const [sessions, openTurnsBySession] = await Promise.all([
      ctx.db
        .query("sessions")
        .withIndex("by_repo_archived_and_deleted", (q) =>
          q
            .eq("repoId", args.repoId)
            .eq("archived", true)
            .eq("deletedAt", undefined),
        )
        .collect(),
      openTurnsBySessionForRepo(ctx, args.repoId),
    ]);
    return sessions
      .sort(byMostRecentlyUpdated)
      .map((session) => toSessionListItem(session, openTurnsBySession));
  },
});

/**
 * Point-in-time first user-message preview for sidebar hover cards.
 * Messages stay the only source of truth — list subscriptions never join them.
 */
export const getFirstMessagePreview = authQuery({
  args: { id: v.id("sessions") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session) return null;
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) return null;
    const mainChat = await findMainChat(ctx.db, args.id);
    return await firstUserMessagePreview(ctx.db, mainChat?._id ?? args.id);
  },
});

/** Counts non-archived sessions with "active" status for a repo. */
export const countActive = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.number(),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return 0;
    const sessions = filterActiveEntities(
      await ctx.db
        .query("sessions")
        .withIndex("by_repo_and_status", (q) =>
          q.eq("repoId", args.repoId).eq("status", "active"),
        )
        .filter((q) => q.neq(q.field("archived"), true))
        .collect(),
    );
    return sessions.length;
  },
});

/** Retrieves a single session by ID, returning null if not found or unauthorized. */
export const get = authQuery({
  args: { id: v.id("sessions") },
  returns: v.union(sessionValidator, v.null()),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session) return null;
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) return null;
    return entityVisible(session);
  },
});

/** Resolves a session by per-repo numeric id (URL segment). */
export const getByNumId = authQuery({
  args: {
    repoId: v.id("githubRepos"),
    numId: v.number(),
  },
  returns: v.union(sessionValidator, v.null()),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return null;
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_repo_and_numId", (q) =>
        q.eq("repoId", args.repoId).eq("numId", args.numId),
      )
      .first();
    return entityVisible(session);
  },
});
