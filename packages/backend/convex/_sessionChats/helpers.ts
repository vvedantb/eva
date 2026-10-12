import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader, MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { getAIModelProvider } from "../validators";
import { sessionChatFields } from "../_validators/tableFields";

/**
 * How many chats of one session may execute a turn at the same time. Each
 * running chat is its own agent process on the shared sandbox; the VM holds
 * three comfortably alongside the dev server. A fourth send queues on its
 * chat until a sibling finishes (`drainSessionChatQueues`).
 */
export const MAX_PARALLEL_CHATS = 3;

/** Title of the chat every session starts with. */
export const MAIN_CHAT_TITLE = "Main";

/** Convex validator for a full session chat document including system fields. */
export const sessionChatValidator = v.object({
  _id: v.id("sessionChats"),
  _creationTime: v.number(),
  ...sessionChatFields,
});

/**
 * A chat and the session it belongs to, loaded together. Every chat-pipeline
 * function needs both: the chat for the transcript, daemon and model; the
 * session for the sandbox, branch and repo.
 */
export type SessionChatContext = {
  chat: Doc<"sessionChats">;
  session: Doc<"sessions">;
};

export async function loadSessionChat(
  db: DatabaseReader,
  chatId: Id<"sessionChats">,
): Promise<SessionChatContext | null> {
  const chat = await db.get(chatId);
  if (!chat) return null;
  const session = await db.get(chat.sessionId);
  if (!session) return null;
  return { chat, session };
}

export async function getSessionChatOrThrow(
  db: DatabaseReader,
  chatId: Id<"sessionChats">,
): Promise<SessionChatContext> {
  const context = await loadSessionChat(db, chatId);
  if (!context) throw new Error("Chat not found");
  return context;
}

/** Every chat of a session, archived ones included, in creation order. */
export async function listSessionChats(
  db: DatabaseReader,
  sessionId: Id<"sessions">,
): Promise<Doc<"sessionChats">[]> {
  return await db
    .query("sessionChats")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .collect();
}

/** The chats a user can still type into (Main plus open parallel chats). */
export async function listLiveSessionChats(
  db: DatabaseReader,
  sessionId: Id<"sessions">,
): Promise<Doc<"sessionChats">[]> {
  const chats = await listSessionChats(db, sessionId);
  return chats.filter((chat) => chat.archived !== true);
}

export async function findMainChat(
  db: DatabaseReader,
  sessionId: Id<"sessions">,
): Promise<Doc<"sessionChats"> | null> {
  return await db
    .query("sessionChats")
    .withIndex("by_session_and_number", (q) =>
      q.eq("sessionId", sessionId).eq("number", 1),
    )
    .first();
}

/**
 * Target args of the daemon-facing session mutations. Daemons launched before
 * session chats still send `sessionId`; new daemons send `chatId`.
 */
export const daemonChatTargetArgs = {
  chatId: v.optional(v.id("sessionChats")),
  sessionId: v.optional(v.id("sessions")),
};

/**
 * The chat a daemon call targets. A legacy `sessionId` call resolves to the
 * session's Main chat, the chat `backfillSessionChats` (`ensureMainChat`)
 * moves the session's transcript onto. Null when that chat does not exist
 * yet; callers no-op until the backfill creates it. Read-only, because the
 * claim poll runs every 50ms.
 */
export async function resolveDaemonChatId(
  db: DatabaseReader,
  args: { chatId?: Id<"sessionChats">; sessionId?: Id<"sessions"> },
): Promise<Id<"sessionChats"> | null> {
  if (args.chatId !== undefined) return args.chatId;
  if (args.sessionId === undefined) return null;
  const mainChat = await findMainChat(db, args.sessionId);
  return mainChat?._id ?? null;
}

/** The chat a session-level link (`?chat=N`) resolves to. */
export async function findChatByNumber(
  db: DatabaseReader,
  sessionId: Id<"sessions">,
  number: number,
): Promise<Doc<"sessionChats"> | null> {
  return await db
    .query("sessionChats")
    .withIndex("by_session_and_number", (q) =>
      q.eq("sessionId", sessionId).eq("number", number),
    )
    .first();
}

/**
 * Whether this chat may take one of the session's `MAX_PARALLEL_CHATS` run
 * slots. One indexed read over the session's open turns. The chat's own open
 * turn never counts: at send time the new turn supersedes it, and at dequeue
 * time the chat is idle so any open turn of its own is a leftover.
 */
export async function sessionChatHasFreeSlot(
  db: DatabaseReader,
  context: SessionChatContext,
): Promise<boolean> {
  const openTurns = await db
    .query("turns")
    .withIndex("by_session_open", (q) =>
      q.eq("sessionId", context.session._id).eq("open", true),
    )
    .collect();
  const siblingsRunning = openTurns.filter(
    (turn) => turn.entityId !== String(context.chat._id),
  ).length;
  return siblingsRunning < MAX_PARALLEL_CHATS;
}

/**
 * The id Claude's transcript is derived from (`sessionClaudeUuid`). A
 * backfilled Main chat keeps the session's seed so it resumes the
 * conversation Claude already holds; every other chat is its own transcript.
 */
export function sessionChatPersistenceId(
  chat: Doc<"sessionChats">,
): Id<"sessions"> | Id<"sessionChats"> {
  return chat.claudePersistenceSeed ?? chat._id;
}

/** `streamingActivity` / `pendingQuestions` entity id for a chat's turn. */
export function sessionChatStreamingEntityId(chatId: Id<"sessionChats">): string {
  return String(chatId);
}

type ChatSettingsSource = Pick<
  Doc<"sessionChats">,
  | "providerAccountId"
  | "provider"
  | "lastModel"
  | "lastReasoningLevel"
  | "lastThinkingEnabled"
  | "lastUse1mContext"
  | "lastFastMode"
>;

function copyChatSettings(source: ChatSettingsSource): ChatSettingsSource {
  return {
    providerAccountId: source.providerAccountId,
    provider: source.provider,
    lastModel: source.lastModel,
    lastReasoningLevel: source.lastReasoningLevel,
    lastThinkingEnabled: source.lastThinkingEnabled,
    lastUse1mContext: source.lastUse1mContext,
    lastFastMode: source.lastFastMode,
  };
}

/**
 * Inserts the Main chat for a session that does not have one yet, carrying
 * the session's composer settings over, and repoints the session's legacy
 * chat rows onto it (`moveLegacySessionRows`, batched). Idempotent. Called by every server path
 * that needs "the chat of this session" (session create, MCP sends, system
 * alerts) and by the page-open mutation, so a session predating chats gets
 * its Main chat the first time anything touches it.
 */
export async function ensureMainChat(
  ctx: MutationCtx,
  session: Doc<"sessions">,
): Promise<Doc<"sessionChats">> {
  const existing = await findMainChat(ctx.db, session._id);
  if (existing) return existing;

  const chatId = await ctx.db.insert("sessionChats", {
    sessionId: session._id,
    repoId: session.repoId,
    userId: session.userId,
    title: MAIN_CHAT_TITLE,
    number: 1,
    isMain: true,
    createdBy: session.createdBy ?? session.userId,
    updatedAt: session.updatedAt ?? Date.now(),
    claudePersistenceSeed: session._id,
    ...copyChatSettings(session),
    ...(session.lastModel !== undefined && session.provider === undefined
      ? { provider: getAIModelProvider(session.lastModel) }
      : {}),
    backgroundAgents: session.backgroundAgents,
  });

  await moveLegacySessionRows(ctx, session, chatId);

  const chat = await ctx.db.get(chatId);
  if (!chat) throw new Error("Main chat was not created");
  return chat;
}

/** Rows moved per mutation, so a long legacy transcript never hits the write limits. */
const LEGACY_MOVE_BATCH = 200;

/**
 * Repoints one bounded batch of a session's legacy chat rows (keyed by the
 * session id) onto its Main chat, and schedules the next batch when rows
 * remain. Covers the transcript, the queue, the inline cards (UI panels, HTML
 * renders, env var requests) and the owner's pre-chat composer draft.
 * `chatReads` stay on the session id: the sidebar unread dot reads them there.
 */
export async function moveLegacySessionRows(
  ctx: MutationCtx,
  session: Doc<"sessions">,
  chatId: Id<"sessionChats">,
): Promise<void> {
  let budget = LEGACY_MOVE_BATCH;
  const sessionId = session._id;

  const messages = await ctx.db
    .query("messages")
    .withIndex("by_parent", (q) => q.eq("parentId", sessionId))
    .take(budget);
  for (const row of messages) await ctx.db.patch(row._id, { parentId: chatId });
  budget -= messages.length;

  const queued = await ctx.db
    .query("queuedMessages")
    .withIndex("by_parent_and_order", (q) => q.eq("parentId", sessionId))
    .take(budget);
  for (const row of queued) await ctx.db.patch(row._id, { parentId: chatId });
  budget -= queued.length;

  const panels = await ctx.db
    .query("chatUiPanels")
    .withIndex("by_parent", (q) => q.eq("parentId", sessionId))
    .take(budget);
  for (const row of panels) await ctx.db.patch(row._id, { parentId: chatId });
  budget -= panels.length;

  const renders = await ctx.db
    .query("chatHtmlRenders")
    .withIndex("by_parent", (q) => q.eq("parentId", sessionId))
    .take(budget);
  for (const row of renders) await ctx.db.patch(row._id, { parentId: chatId });
  budget -= renders.length;

  const envRequests = await ctx.db
    .query("envVarRequests")
    .withIndex("by_parent", (q) => q.eq("parentId", sessionId))
    .take(budget);
  for (const row of envRequests) {
    await ctx.db.patch(row._id, { parentId: chatId });
  }
  budget -= envRequests.length;

  // `drafts` is indexed by user first; other users' pre-chat drafts are moved
  // by `_migrations/moveLegacyChatRows:moveLegacySessionDrafts`.
  const drafts = await ctx.db
    .query("drafts")
    .withIndex("by_user_and_session", (q) =>
      q.eq("userId", session.userId).eq("sessionId", sessionId),
    )
    .collect();
  for (const draft of drafts) {
    if (draft.kind === "sessionChat" && draft.chatId === undefined) {
      await ctx.db.patch(draft._id, { chatId });
    }
  }

  // A spent budget means more rows may remain (an empty extra run is harmless).
  if (budget <= 0) {
    await ctx.scheduler.runAfter(
      0,
      internal._sessionChats.mutations.moveLegacyRows,
      { sessionId, chatId },
    );
  }
}

/**
 * Opens another chat in a session. Settings are inherited from `inheritFrom`
 * (the chat the user pressed `+` on) so the new tab starts on the model and
 * account they were already using; the session's own settings are the
 * fallback for server callers with no active chat.
 */
export async function createSessionChat(
  ctx: MutationCtx,
  params: {
    session: Doc<"sessions">;
    createdBy: Id<"users">;
    title?: string;
    inheritFrom?: Doc<"sessionChats">;
  },
): Promise<Doc<"sessionChats">> {
  const { session } = params;
  const chats = await listSessionChats(ctx.db, session._id);
  // `number` stays unique for `?chat=N` links; the default title reuses the
  // lowest label no open tab holds, so open/close/open reads "Chat 2" again.
  const number = chats.reduce((max, chat) => Math.max(max, chat.number), 0) + 1;
  const source: ChatSettingsSource = params.inheritFrom ?? session;
  const openTitles = new Set(
    chats.filter((chat) => chat.archived !== true).map((chat) => chat.title),
  );
  let label = 2;
  while (openTitles.has(`Chat ${label}`)) label += 1;
  const title = params.title?.trim() || `Chat ${label}`;
  const chatId = await ctx.db.insert("sessionChats", {
    sessionId: session._id,
    repoId: session.repoId,
    userId: session.userId,
    title,
    number,
    isMain: false,
    createdBy: params.createdBy,
    updatedAt: Date.now(),
    ...copyChatSettings(source),
  });
  const chat = await ctx.db.get(chatId);
  if (!chat) throw new Error("Chat was not created");
  return chat;
}
