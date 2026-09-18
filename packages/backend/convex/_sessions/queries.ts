import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";
import { authQuery, hasRepoAccess } from "../functions";
import { entityVisible, filterActiveEntities } from "../numId";
import { firstUserMessagePreview } from "../_messages/preview";
import {
  deploymentStatusValidator,
  entityNumIdFields,
  prStateValidator,
  sessionStatusValidator,
  aiModelValidator,
  reasoningLevelValidator,
} from "../validators";
import { sessionValidator } from "./helpers";
import {
  openSessionIdsForRepo,
  sessionIsExecuting,
} from "../_chat/turnProjection";

/** The primary repo a linked-in session actually belongs to. */
const linkedFromValidator = v.object({
  owner: v.string(),
  name: v.string(),
  rootDirectory: v.optional(v.string()),
});

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
  prState: v.optional(prStateValidator),
  sandboxId: v.optional(v.string()),
  /** Last wake failure — the row's dot turns red instead of reading "Asleep". */
  sandboxError: v.optional(v.string()),
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
  /**
   * Set only on rows this repo sees through a linked checkout rather than as
   * the session's own repo: the identity of the session's PRIMARY repo, so the
   * sidebar can badge the row and link to it under the right app.
   */
  linkedFrom: v.optional(linkedFromValidator),
  /** Number of linked repos cloned beside the primary (sidebar `+N` badge). */
  linkedRepoCount: v.optional(v.number()),
});

/** Maps a full session doc to the slim list payload. */
function toSessionListItem(
  session: Doc<"sessions">,
  openSessionIds: ReadonlySet<string>,
  linkedFrom?: { owner: string; name: string; rootDirectory?: string },
) {
  return {
    linkedFrom,
    linkedRepoCount: session.linkedRepoCount,
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
    sandboxError: session.sandboxError,
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

/** A session this repo only sees because it is cloned into that session. */
type LinkedSession = {
  session: Doc<"sessions">;
  linkedFrom: { owner: string; name: string; rootDirectory?: string };
};

/**
 * Sessions whose PRIMARY repo is some other app, but which clone this repo as a
 * linked checkout. They belong in this repo's sidebar too — the work happens
 * here — tagged with the primary's identity so the row links to the right app.
 *
 * `alreadyListed` holds the ids the caller found through `by_repo`, so a session
 * that is both primary and linked here is never listed twice.
 */
async function gatherLinkedSessions(
  db: DatabaseReader,
  repoId: Id<"githubRepos">,
  archived: boolean,
  alreadyListed: ReadonlySet<string>,
): Promise<LinkedSession[]> {
  const links = await db
    .query("sessionRepos")
    .withIndex("by_repo", (q) => q.eq("repoId", repoId))
    .collect();
  const seen = new Set<string>(alreadyListed);
  const primaryRepos = new Map<string, Doc<"githubRepos"> | null>();
  const rows: LinkedSession[] = [];

  for (const link of links) {
    const sessionKey = String(link.sessionId);
    if (seen.has(sessionKey)) continue;
    seen.add(sessionKey);
    const session = await db.get(link.sessionId);
    if (!session) continue;
    if (session.deletedAt !== undefined) continue;
    if ((session.archived === true) !== archived) continue;

    const repoKey = String(session.repoId);
    if (!primaryRepos.has(repoKey)) {
      primaryRepos.set(repoKey, await db.get(session.repoId));
    }
    const primaryRepo = primaryRepos.get(repoKey);
    if (!primaryRepo) continue;
    rows.push({
      session,
      linkedFrom: {
        owner: primaryRepo.owner,
        name: primaryRepo.name,
        rootDirectory: primaryRepo.rootDirectory,
      },
    });
  }
  return rows;
}

/**
 * Open-turn ids for every repo the listed sessions actually run under. Turns are
 * filed against a session's primary repo, so a linked-in row's turn is invisible
 * to this repo's own `by_repo_open` range.
 */
async function openIdsIncludingLinked(
  db: DatabaseReader,
  ownOpenIds: ReadonlySet<string>,
  linked: ReadonlyArray<LinkedSession>,
): Promise<ReadonlySet<string>> {
  if (linked.length === 0) return ownOpenIds;
  const repoIds = new Map<string, Id<"githubRepos">>();
  for (const row of linked) {
    repoIds.set(String(row.session.repoId), row.session.repoId);
  }
  const sets = await Promise.all(
    [...repoIds.values()].map((id) => openSessionIdsForRepo(db, id)),
  );
  const merged = new Set<string>(ownOpenIds);
  for (const set of sets) {
    for (const id of set) merged.add(id);
  }
  return merged;
}

/** Lists all non-archived sessions for a repo, sorted by most recently updated. */
export const list = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(sessionListItemValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const sessionGroups = await Promise.all(
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
    );
    const sessions = sessionGroups.flat();
    const linked = await gatherLinkedSessions(
      ctx.db,
      args.repoId,
      false,
      new Set(sessions.map((session) => String(session._id))),
    );
    const openSessionIds = await openIdsIncludingLinked(
      ctx.db,
      await openSessionIdsForRepo(ctx.db, args.repoId),
      linked,
    );
    const linkedFromBySession = new Map(
      linked.map((row) => [String(row.session._id), row.linkedFrom]),
    );
    return [...sessions, ...linked.map((row) => row.session)]
      .sort(byMostRecentlyUpdated)
      .map((session) =>
        toSessionListItem(
          session,
          openSessionIds,
          linkedFromBySession.get(String(session._id)),
        ),
      );
  },
});

/** Lists all archived sessions for a repo, sorted by most recently updated. */
export const listArchived = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(sessionListItemValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_repo_archived_and_deleted", (q) =>
        q
          .eq("repoId", args.repoId)
          .eq("archived", true)
          .eq("deletedAt", undefined),
      )
      .collect();
    const linked = await gatherLinkedSessions(
      ctx.db,
      args.repoId,
      true,
      new Set(sessions.map((session) => String(session._id))),
    );
    const openSessionIds = await openIdsIncludingLinked(
      ctx.db,
      await openSessionIdsForRepo(ctx.db, args.repoId),
      linked,
    );
    const linkedFromBySession = new Map(
      linked.map((row) => [String(row.session._id), row.linkedFrom]),
    );
    return [...sessions, ...linked.map((row) => row.session)]
      .sort(byMostRecentlyUpdated)
      .map((session) =>
        toSessionListItem(
          session,
          openSessionIds,
          linkedFromBySession.get(String(session._id)),
        ),
      );
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
