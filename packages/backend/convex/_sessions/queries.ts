import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import {
  authQuery,
  hasRepoAccess,
  hasSessionAccess,
  sessionVisibleToUser,
} from "../functions";
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
import {
  openSessionIdsForRepo,
  sessionIsExecuting,
} from "../_chat/turnProjection";

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
  /** Set while "Regenerate title" is running; the sidebar disables the action and hints. */
  titleRegeneration: v.optional(v.object({ startedAt: v.number() })),
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
   * True while a turn is in flight — either a tracked chat workflow, or a
   * daemon-minted continuation (`/loop`), which never gets an
   * `activeWorkflowId`. Same window as composer BorderBeam in practice
   * (message-level isExecuting needs the open thread; list rows use this field
   * instead of N+1 into messages).
   */
  isExecuting: v.boolean(),
});

/** Maps a full session doc to the slim list payload. */
function toSessionListItem(
  session: Doc<"sessions">,
  openSessionIds: ReadonlySet<string>,
) {
  return {
    _id: session._id,
    _creationTime: session._creationTime,
    numId: session.numId,
    deletedAt: session.deletedAt,
    repoId: session.repoId,
    userId: session.userId,
    title: session.title,
    titleRegeneration: session.titleRegeneration,
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
    isExecuting: sessionIsExecuting(session, openSessionIds),
  };
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
    const [sessionGroups, openSessionIds] = await Promise.all([
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
      openSessionIdsForRepo(ctx.db, args.repoId),
    ]);
    const sessions = sessionGroups.flat();
    return sessions
      .filter((session) => sessionVisibleToUser(session, ctx.userId))
      .sort(byMostRecentlyUpdated)
      .map((session) => toSessionListItem(session, openSessionIds));
  },
});

/** Lists all archived sessions for a repo, sorted by most recently updated. */
export const listArchived = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(sessionListItemValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const [sessions, openSessionIds] = await Promise.all([
      ctx.db
        .query("sessions")
        .withIndex("by_repo_archived_and_deleted", (q) =>
          q
            .eq("repoId", args.repoId)
            .eq("archived", true)
            .eq("deletedAt", undefined),
        )
        .collect(),
      openSessionIdsForRepo(ctx.db, args.repoId),
    ]);
    return sessions
      .filter((session) => sessionVisibleToUser(session, ctx.userId))
      .sort(byMostRecentlyUpdated)
      .map((session) => toSessionListItem(session, openSessionIds));
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
    if (!(await hasSessionAccess(ctx.db, session, ctx.userId))) return null;
    if (!sessionVisibleToUser(session, ctx.userId)) return null;
    return await firstUserMessagePreview(ctx.db, args.id);
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
    return sessions.filter((session) =>
      sessionVisibleToUser(session, ctx.userId),
    ).length;
  },
});

/** Retrieves a single session by ID, returning null if not found or unauthorized. */
export const get = authQuery({
  args: { id: v.id("sessions") },
  returns: v.union(sessionValidator, v.null()),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session) return null;
    if (!(await hasSessionAccess(ctx.db, session, ctx.userId))) return null;
    if (!sessionVisibleToUser(session, ctx.userId)) return null;
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
    if (!session || !sessionVisibleToUser(session, ctx.userId)) return null;
    return entityVisible(session);
  },
});
