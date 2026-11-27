import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";
import { authQuery, hasRepoAccess, hasTaskAccess } from "../functions";
import { entityVisible, filterActiveEntities } from "../numId";
import { firstUserMessagePreview } from "../_messages/preview";
import { findMainChat } from "../_sessionChats/helpers";
import {
  deploymentStatusValidator,
  entityNumIdFields,
  softDeleteFields,
  prStateValidator,
  sessionStatusValidator,
  aiModelValidator,
  reasoningLevelValidator,
} from "../validators";
import { sessionValidator } from "./helpers";
import { isSessionArchived, listRepoSessionsByArchive } from "./archive";
import {
  chatTurnFlagsForRepos,
  sessionIsExecuting,
} from "../_chat/turnProjection";
import { unreadLookupForRepo } from "../chatReads";
import {
  findWorkSession,
  isStandaloneSession,
  ownedSessionOwnerValidator,
  type OwnedSessionOwner,
} from "./owner";
import {
  chatSeedSettings,
  chatSeedValidator,
  loadOwnerEntity,
  type OwnerEntity,
} from "./ownedSession";
import { findWorkChat } from "./ownerState";

const linkedFromValidator = v.object({
  owner: v.string(),
  name: v.string(),
  rootDirectory: v.optional(v.string()),
  label: v.optional(v.string()),
});

const sessionListItemValidator = v.object({
  _id: v.id("sessions"),
  _creationTime: v.number(),
  ...entityNumIdFields,
  ...softDeleteFields,
  repoId: v.id("githubRepos"),
  userId: v.id("users"),
  title: v.string(),
  titleRegeneration: v.optional(v.object({ startedAt: v.number() })),
  branchName: v.optional(v.string()),
  baseBranch: v.optional(v.string()),
  prUrl: v.optional(v.string()),
  prState: v.optional(prStateValidator),
  sandboxId: v.optional(v.string()),
  sandboxError: v.optional(v.string()),
  updatedAt: v.optional(v.number()),
  status: sessionStatusValidator,
  archived: v.boolean(),
  createdBy: v.optional(v.id("users")),
  lastModel: v.optional(aiModelValidator),
  lastReasoningLevel: v.optional(reasoningLevelValidator),
  lastThinkingEnabled: v.optional(v.boolean()),
  lastUse1mContext: v.optional(v.boolean()),
  lastFastMode: v.optional(v.boolean()),
  deploymentStatus: v.optional(deploymentStatusValidator),
  deploymentUrl: v.optional(v.string()),
  isExecuting: v.boolean(),
  hasUnread: v.boolean(),
  isAwaitingAnswer: v.boolean(),
  linkedFrom: v.optional(linkedFromValidator),
  linkedRepoCount: v.optional(v.number()),
  forkedFromSessionId: v.optional(v.id("sessions")),
  sessionGroupId: v.optional(v.id("sessionGroups")),
  sessionGroupName: v.optional(v.string()),
});

function toSessionListItem(
  session: Doc<"sessions">,
  openSessionIds: ReadonlySet<string>,
  awaitingAnswerIds: ReadonlySet<string>,
  hasUnread: boolean,
  linkedFrom: { owner: string; name: string; rootDirectory?: string } | undefined,
  groupNames: ReadonlyMap<string, string>,
) {
  return {
    linkedFrom,
    sessionGroupId: session.sessionGroupId,
    sessionGroupName: session.sessionGroupId
      ? groupNames.get(session.sessionGroupId)
      : undefined,
    linkedRepoCount: session.linkedRepoCount,
    forkedFromSessionId: session.forkedFromSessionId,
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
    archived: isSessionArchived(session),
    createdBy: session.createdBy,
    lastModel: session.lastModel,
    lastReasoningLevel: session.lastReasoningLevel,
    lastThinkingEnabled: session.lastThinkingEnabled,
    lastUse1mContext: session.lastUse1mContext,
    lastFastMode: session.lastFastMode,
    deploymentStatus: session.deploymentStatus,
    deploymentUrl: session.deploymentUrl,
    isExecuting: sessionIsExecuting(session, openSessionIds),
    hasUnread,
    isAwaitingAnswer: awaitingAnswerIds.has(String(session._id)),
  };
}

function byMostRecentlyUpdated(a: Doc<"sessions">, b: Doc<"sessions">): number {
  return (b.updatedAt ?? b._creationTime) - (a.updatedAt ?? a._creationTime);
}

type LinkedSession = {
  session: Doc<"sessions">;
  linkedFrom: { owner: string; name: string; rootDirectory?: string };
};

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
  const sessionIds: Array<Id<"sessions">> = [];
  for (const link of links) {
    const sessionKey = String(link.sessionId);
    if (seen.has(sessionKey)) continue;
    seen.add(sessionKey);
    sessionIds.push(link.sessionId);
  }
  const fetched = await Promise.all(sessionIds.map((id) => db.get(id)));
  const sessions = fetched.filter(
    (session): session is Doc<"sessions"> =>
      session !== null &&
      session.deletedAt === undefined &&
      isSessionArchived(session) === archived,
  );
  const primaryRepoIds = [...new Set(sessions.map((s) => s.repoId))];
  const primaryRepoDocs = await Promise.all(
    primaryRepoIds.map((id) => db.get(id)),
  );
  const primaryRepos = new Map<string, Doc<"githubRepos"> | null>();
  primaryRepoIds.forEach((id, i) => {
    primaryRepos.set(String(id), primaryRepoDocs[i]);
  });
  const rows: LinkedSession[] = [];

  for (const session of sessions) {
    const primaryRepo = primaryRepos.get(String(session.repoId));
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

function turnFlagsIncludingLinked(
  db: DatabaseReader,
  repoId: Id<"githubRepos">,
  linked: ReadonlyArray<LinkedSession>,
) {
  return chatTurnFlagsForRepos(db, [
    repoId,
    ...linked.map((row) => row.session.repoId),
  ]);
}

async function sessionGroupNames(
  db: DatabaseReader,
  sessions: Doc<"sessions">[],
): Promise<Map<string, string>> {
  const ids = new Set<Id<"sessionGroups">>();
  for (const session of sessions) {
    if (session.sessionGroupId) ids.add(session.sessionGroupId);
  }
  const names = new Map<string, string>();
  for (const group of await Promise.all([...ids].map((id) => db.get(id)))) {
    if (group?.name) names.set(group._id, group.name);
  }
  return names;
}

async function toSessionListItems(
  db: DatabaseReader,
  userId: Id<"users">,
  repoId: Id<"githubRepos">,
  sessions: Doc<"sessions">[],
  archived: boolean,
) {
  const [linked, hasUnread] = await Promise.all([
    gatherLinkedSessions(
      db,
      repoId,
      archived,
      new Set(sessions.map((session) => String(session._id))),
    ),
    unreadLookupForRepo(db, userId, repoId),
  ]);
  const rows = [...sessions, ...linked.map((row) => row.session)];
  const [{ openIds: openSessionIds, awaitingAnswerIds }, groupNames] =
    await Promise.all([
      turnFlagsIncludingLinked(db, repoId, linked),
      sessionGroupNames(db, rows),
    ]);
  const linkedFromBySession = new Map(
    linked.map((row) => [String(row.session._id), row.linkedFrom]),
  );
  return Promise.all(
    rows
      .sort(byMostRecentlyUpdated)
      .map(async (session) =>
        toSessionListItem(
          session,
          openSessionIds,
          awaitingAnswerIds,
          await hasUnread(session),
          linkedFromBySession.get(String(session._id)),
          groupNames,
        ),
      ),
  );
}

/** Lists all non-archived sessions for a repo, sorted by most recently updated. */
export const list = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(sessionListItemValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const sessions = await listRepoSessionsByArchive(ctx.db, args.repoId, false);
    return toSessionListItems(ctx.db, ctx.userId, args.repoId, sessions, false);
  },
});

/** Lists all archived sessions for a repo, sorted by most recently updated. */
export const listArchived = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(sessionListItemValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const sessions = await listRepoSessionsByArchive(ctx.db, args.repoId, true);
    return toSessionListItems(ctx.db, ctx.userId, args.repoId, sessions, true);
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
    if (!mainChat) return null;
    return await firstUserMessagePreview(ctx.db, mainChat._id);
  },
});

const forkLinkValidator = v.object({
  _id: v.id("sessions"),
  title: v.string(),
  numId: v.optional(v.number()),
  repo: linkedFromValidator,
});

async function toForkLink(
  db: DatabaseReader,
  userId: Id<"users">,
  session: Doc<"sessions"> | null,
) {
  const visible = entityVisible(session);
  if (!visible) return null;
  if (!(await hasRepoAccess(db, visible.repoId, userId))) return null;
  const repo = await db.get(visible.repoId);
  if (!repo) return null;
  return {
    _id: visible._id,
    title: visible.title,
    numId: visible.numId,
    repo: {
      owner: repo.owner,
      name: repo.name,
      rootDirectory: repo.rootDirectory,
      label: repo.label,
    },
  };
}

/**
 * Both ends of a session's fork lineage for hover cards: the session it was
 * forked from and the sessions forked from it. Fetched on hover, like the
 * first-message preview, so list subscriptions stay join-free.
 */
export const getForkLinks = authQuery({
  args: { id: v.id("sessions") },
  returns: v.object({
    forkedFrom: v.union(forkLinkValidator, v.null()),
    forks: v.array(forkLinkValidator),
  }),
  handler: async (ctx, args) => {
    const empty = { forkedFrom: null, forks: [] };
    const session = await ctx.db.get(args.id);
    if (!session) return empty;
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
      return empty;
    }
    const forkedFrom = session.forkedFromSessionId
      ? await toForkLink(
          ctx.db,
          ctx.userId,
          await ctx.db.get(session.forkedFromSessionId),
        )
      : null;
    const children = await ctx.db
      .query("sessions")
      .withIndex("by_forked_from", (q) => q.eq("forkedFromSessionId", args.id))
      .take(20);
    const forks = (
      await Promise.all(
        children.map((child) => toForkLink(ctx.db, ctx.userId, child)),
      )
    ).filter((link) => link !== null);
    return { forkedFrom, forks };
  },
});

/**
 * This session's linked-session group across repos: its name and every
 * visible member, oldest first. Null when the session is in no group.
 */
export const listGroup = authQuery({
  args: { id: v.id("sessions") },
  returns: v.union(
    v.object({
      _id: v.id("sessionGroups"),
      name: v.optional(v.string()),
      members: v.array(
        v.object({ ...forkLinkValidator.fields, archived: v.boolean() }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session?.sessionGroupId) return null;
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
      return null;
    }
    const group = await ctx.db.get(session.sessionGroupId);
    if (!group) return null;
    const rows = await ctx.db
      .query("sessions")
      .withIndex("by_session_group", (q) => q.eq("sessionGroupId", group._id))
      .take(50);
    const members = (
      await Promise.all(
        rows.map(async (row) => {
          const link = await toForkLink(ctx.db, ctx.userId, row);
          return link ? { ...link, archived: isSessionArchived(row) } : null;
        }),
      )
    ).filter((member) => member !== null);
    return { _id: group._id, name: group.name, members };
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
        .collect(),
    );
    return sessions.filter(
      (session) => isStandaloneSession(session) && !isSessionArchived(session),
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
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) return null;
    return entityVisible(session);
  },
});

/**
 * The task or project behind an owner, when `userId` may reach it; null
 * otherwise. The access check for `getOwnedWithSeed` and `ensureOwned`.
 */
export async function loadOwnerEntityWithAccess(
  db: DatabaseReader,
  owner: OwnedSessionOwner,
  userId: Id<"users">,
): Promise<OwnerEntity | null> {
  const entity = await loadOwnerEntity(db, owner);
  if (!entity) return null;
  const allowed =
    entity.kind === "task"
      ? await hasTaskAccess(db, entity.task, userId)
      : await hasRepoAccess(db, entity.project.repoId, userId);
  return allowed ? entity : null;
}

/** What `getOwnedWithSeed` / `ensureOwned` return: the session and the owner's chat. */
export const ownerChatRefValidator = v.object({
  sessionId: v.id("sessions"),
  chatId: v.id("sessionChats"),
});

async function readOwned(
  db: DatabaseReader,
  userId: Id<"users">,
  owner: OwnedSessionOwner,
) {
  const entity = await loadOwnerEntityWithAccess(db, owner, userId);
  if (!entity) return null;
  const [session, found] = await Promise.all([
    findWorkSession(db, entity),
    findWorkChat(db, entity),
  ]);
  return {
    entity,
    session: session ? { sessionId: session._id, chatId: found?.chat._id } : null,
  };
}

const ownedSessionRefValidator = v.object({
  sessionId: v.id("sessions"),
  chatId: v.optional(v.id("sessionChats")),
});

/**
 * The session a task or project works on (its sandbox) and the chat it talks
 * in (the Main chat of its own session), for the owner's chat and sandbox
 * panels. `session` is null until the session exists; `chatId` absent until
 * the chat exists. `ensureOwned`
 * creates both. `chatSeed` is what the chat starts on (`chatSeedSettings`):
 * clients show it until the chat has its own picks. Null when the owner is
 * gone or not visible.
 */
export const getOwnedWithSeed = authQuery({
  args: { owner: ownedSessionOwnerValidator },
  returns: v.union(
    v.object({
      session: v.union(ownedSessionRefValidator, v.null()),
      chatSeed: chatSeedValidator,
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const read = await readOwned(ctx.db, ctx.userId, args.owner);
    if (!read) return null;
    return {
      session: read.session,
      chatSeed: await chatSeedSettings(ctx.db, read.entity),
    };
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
