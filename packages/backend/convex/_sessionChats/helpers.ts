import { getConvexSize, v } from "convex/values";
import { MAX_PARALLEL_CHATS } from "@eva/shared";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader, MutationCtx } from "../_generated/server";
import { hasRepoAccess } from "../functions";
import { getAIModelProvider } from "../validators";
import { sessionChatFields } from "../_validators/tableFields";

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

/** Loads a chat and its session and verifies access through the repository. */
export async function getSessionChatWithAccess(
  db: DatabaseReader,
  chatId: Id<"sessionChats">,
  userId: Id<"users">,
): Promise<SessionChatContext> {
  const context = await getSessionChatOrThrow(db, chatId);
  if (!(await hasRepoAccess(db, context.session.repoId, userId))) {
    throw new Error("Not authorized");
  }
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
 *
 * A quick task's run is filed under its session too, and it holds the whole
 * sandbox: while one is open no chat may start, so a message sent mid-run
 * queues behind it (the run's `closeTurn` drains the queue).
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
  if (openTurns.some((turn) => db.normalizeId("agentRuns", turn.entityId))) {
    return false;
  }
  const siblingsRunning = openTurns.filter(
    (turn) => turn.entityId !== String(context.chat._id),
  ).length;
  return siblingsRunning < MAX_PARALLEL_CHATS;
}

/** What `sessionChatPersistenceId` returns, for return validators. */
export const sessionChatPersistenceIdValidator = v.union(
  v.id("sessions"),
  v.id("sessionChats"),
  v.id("agentTasks"),
);

/**
 * The id Claude's transcript is derived from (`sessionClaudeUuid`). A
 * backfilled Main chat keeps the session's seed, and a migrated quick task's
 * Main chat the task's, so it resumes the conversation Claude already holds;
 * every other chat is its own transcript.
 */
export function sessionChatPersistenceId(
  chat: Doc<"sessionChats">,
): Id<"sessions"> | Id<"sessionChats"> | Id<"agentTasks"> {
  return chat.claudePersistenceSeed ?? chat._id;
}

/** `streamingActivity` / `pendingQuestions` entity id for a chat's turn. */
export function sessionChatStreamingEntityId(
  chatId: Id<"sessionChats">,
): string {
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
 * Bytes and rows one `moveLegacyTranscriptPage` call may read. Heavy sessions
 * hold transcripts far over the 16 MiB per-function read limit, so the move
 * runs in bounded pages across mutations instead of one `collect()`.
 */
const LEGACY_TRANSCRIPT_PAGE_BYTES = 2 * 1024 * 1024;
const LEGACY_TRANSCRIPT_PAGE_ROWS = 500;

/**
 * Reads the next bounded page of an index range. `full` means the page hit
 * the budget, so more rows may remain.
 */
async function takeBoundedPage<T extends Doc<LegacyChatRowTable>>(
  rows: AsyncIterable<T>,
  maxBytes: number,
): Promise<{ page: T[]; bytes: number; full: boolean }> {
  const page: T[] = [];
  let bytes = 0;
  for await (const row of rows) {
    page.push(row);
    bytes += getConvexSize(row);
    if (bytes >= maxBytes || page.length >= LEGACY_TRANSCRIPT_PAGE_ROWS) {
      return { page, bytes, full: true };
    }
  }
  return { page, bytes, full: false };
}

/** Moves one bounded page of legacy rows onto the chat with `move`. */
async function repointPage<T extends Doc<LegacyChatRowTable>>(
  rows: AsyncIterable<T>,
  maxBytes: number,
  move: (row: T) => Promise<void>,
): Promise<{ bytes: number; full: boolean }> {
  const { page, bytes, full } = await takeBoundedPage(rows, maxBytes);
  for (const row of page) await move(row);
  return { bytes, full };
}

/** Tables whose rows hang off a chat parent and move with its transcript. */
type LegacyChatRowTable =
  | "messages"
  | "queuedMessages"
  | "chatUiPanels"
  | "chatHtmlRenders"
  | "envVarRequests"
  | "feedback"
  | "turns";

/**
 * Who held a transcript before chats did: a session predating session chats,
 * or a quick task predating its owned session.
 */
export type LegacyTranscriptOwner = Id<"sessions"> | Id<"agentTasks">;

/**
 * Repoints one bounded page of a legacy chat owner's rows onto a Main chat:
 * the transcript, the queue and the inline cards (UI panels, HTML renders,
 * env var requests). A quick task also moves its thumbs (`feedback`) and its
 * closed chat turns, which become the chat's turns in its session. Once those
 * are empty a session links the chat owner's pre-chat composer draft. Returns
 * true once no legacy row is left. Moved rows leave the `parentId = from`
 * range, so every call starts from the front and a rerun after a failure
 * resumes where the last commit stopped. A session's `chatReads` stay on the
 * session id: the sidebar unread dot reads them there.
 */
export async function moveLegacyTranscriptPage(
  ctx: MutationCtx,
  from: LegacyTranscriptOwner,
  chatId: Id<"sessionChats">,
): Promise<boolean> {
  const moveParent = async (row: { _id: Id<LegacyChatRowTable> }) => {
    await ctx.db.patch(row._id, { parentId: chatId });
  };
  const chat = await ctx.db.get(chatId);
  const taskId = ctx.db.normalizeId("agentTasks", from);
  // Each table reads into what is left of the one byte budget.
  const tables = [
    (left: number) =>
      repointPage(
        ctx.db
          .query("messages")
          .withIndex("by_parent", (q) => q.eq("parentId", from)),
        left,
        moveParent,
      ),
    (left: number) =>
      repointPage(
        ctx.db
          .query("queuedMessages")
          .withIndex("by_parent_and_order", (q) => q.eq("parentId", from)),
        left,
        moveParent,
      ),
    (left: number) =>
      repointPage(
        ctx.db
          .query("chatUiPanels")
          .withIndex("by_parent", (q) => q.eq("parentId", from)),
        left,
        moveParent,
      ),
    (left: number) =>
      repointPage(
        ctx.db
          .query("chatHtmlRenders")
          .withIndex("by_parent", (q) => q.eq("parentId", from)),
        left,
        moveParent,
      ),
    (left: number) =>
      repointPage(
        ctx.db
          .query("envVarRequests")
          .withIndex("by_parent", (q) => q.eq("parentId", from)),
        left,
        moveParent,
      ),
    ...(taskId && chat
      ? [
          (left: number) =>
            repointPage(
              ctx.db
                .query("feedback")
                .withIndex("by_parent", (q) => q.eq("parentId", taskId)),
              left,
              moveParent,
            ),
          // Closed chat turns only: the migration skips a task whose turn is
          // still open, and a run's turns are keyed on the run.
          (left: number) =>
            repointPage(
              ctx.db
                .query("turns")
                .withIndex("by_entity_open", (q) =>
                  q
                    .eq("entityId", taskId)
                    .eq("lane", undefined)
                    .eq("open", false),
                ),
              left,
              async (turn) => {
                await ctx.db.patch(turn._id, {
                  entityId: chatId,
                  sessionId: chat.sessionId,
                });
              },
            ),
        ]
      : []),
  ];
  let budget = LEGACY_TRANSCRIPT_PAGE_BYTES;
  for (const repoint of tables) {
    const page = await repoint(budget);
    if (page.full) return false;
    budget -= page.bytes;
  }

  const sessionId = ctx.db.normalizeId("sessions", from);
  if (!sessionId) return true;
  // `drafts` is indexed by user first; other users' pre-chat drafts are moved
  // by `_migrations/moveLegacyChatRows:moveLegacySessionDrafts`.
  if (!chat) return true;
  const drafts = await ctx.db
    .query("drafts")
    .withIndex("by_user_and_session", (q) =>
      q.eq("userId", chat.userId).eq("sessionId", sessionId),
    )
    .collect();
  for (const draft of drafts) {
    if (draft.kind === "sessionChat" && draft.chatId === undefined) {
      await ctx.db.patch(draft._id, { chatId });
    }
  }
  return true;
}

/**
 * Inserts the Main chat row for a session, carrying the session's composer
 * settings over. Does not touch the transcript; see `ensureMainChat`.
 */
export async function insertMainChat(
  ctx: MutationCtx,
  session: Doc<"sessions">,
): Promise<Doc<"sessionChats">> {
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
  const chat = await ctx.db.get(chatId);
  if (!chat) throw new Error("Main chat was not created");
  return chat;
}

/**
 * Returns the session's Main chat, creating it for a session that predates
 * chats. On creation, legacy message and queue rows keyed by the session id
 * become the chat's transcript: the first bounded page moves now, and
 * `moveLegacyTranscript` moves the rest in later mutations. Idempotent.
 * Called by every server path that needs "the chat of this session"
 * (session create, MCP sends, system alerts) and by the page-open mutation,
 * so a session predating chats gets its Main chat the first time anything
 * touches it.
 */
export async function ensureMainChat(
  ctx: MutationCtx,
  session: Doc<"sessions">,
): Promise<Doc<"sessionChats">> {
  const existing = await findMainChat(ctx.db, session._id);
  if (existing) return existing;

  const chat = await insertMainChat(ctx, session);
  const moved = await moveLegacyTranscriptPage(ctx, session._id, chat._id);
  if (!moved) {
    await ctx.scheduler.runAfter(
      0,
      internal._sessionChats.mutations.moveLegacyTranscript,
      { from: session._id, chatId: chat._id },
    );
  }
  return chat;
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
