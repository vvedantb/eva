import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { assertMessageParentAccess, authMutation, authQuery } from "./functions";
import {
  chatParentIdValidator,
  chatRecapKindValidator,
  type ChatParentId,
} from "./validators";
import {
  chatSourceArgFromFields,
  chatSourceFieldsForEntityId,
  listRowsForChatSource,
} from "./_chatSource/helpers";

/**
 * A short recap of a chat, written for one user. Two kinds:
 * - "away" ("Since you've been gone"): when they come back after
 *   `RECAP_AWAY_MS` and a turn finished while they were away.
 *   `chatReads.markRead` starts it (it alone knows the read time before it
 *   moves).
 * - "full" ("Recap"): the whole chat, from the chat menu (`requestFull`).
 * `textGen.generateChatRecap` writes the text. A
 * project's Main chat covers every chat in the project's session, and names
 * its task chats as chips. One row per (user, chat); a new absence replaces
 * it, Dismiss deletes it.
 */

/** Away at least this long before a recap is worth a model call. */
export const RECAP_AWAY_MS = 30 * 60 * 1000;

/** Newest rows read per chat; a recap is about the latest work, not all of it. */
const MESSAGES_PER_CHAT = 60;
/** Characters kept from one message. */
const MESSAGE_CLIP = 1_200;
/** Total characters of transcript sent to the model, newest kept first. */
const DIGEST_BUDGET = 16_000;

const recapRowValidator = v.object({
  _id: v.id("chatRecaps"),
  kind: chatRecapKindValidator,
  since: v.number(),
  createdAt: v.number(),
  text: v.optional(v.string()),
});

function getRecapRow(
  db: QueryCtx["db"],
  userId: Id<"users">,
  parentId: ChatParentId,
): Promise<Doc<"chatRecaps"> | null> {
  return db
    .query("chatRecaps")
    .withIndex("by_user_parent", (q) =>
      q.eq("userId", userId).eq("parentId", parentId),
    )
    .unique();
}

/**
 * Called from `markRead` with the read time it is about to replace. Starts a
 * recap when the user was away long enough and missed a finished turn.
 */
export async function maybeStartRecap(
  ctx: MutationCtx,
  input: {
    userId: Id<"users">;
    parentId: ChatParentId;
    previousReadAt: number;
    lastTurnFinishedAt: number | undefined;
    now: number;
  },
): Promise<void> {
  const missedTurn =
    input.lastTurnFinishedAt !== undefined &&
    input.lastTurnFinishedAt > input.previousReadAt;
  if (!missedTurn || input.now - input.previousReadAt < RECAP_AWAY_MS) return;
  await startRecap(ctx, {
    userId: input.userId,
    parentId: input.parentId,
    kind: "away",
    since: input.previousReadAt,
    now: input.now,
  });
}

/** Replaces the user's recap for this chat with a new one and writes it. */
async function startRecap(
  ctx: MutationCtx,
  input: {
    userId: Id<"users">;
    parentId: ChatParentId;
    kind: Doc<"chatRecaps">["kind"];
    since: number;
    now: number;
  },
): Promise<void> {
  const existing = await getRecapRow(ctx.db, input.userId, input.parentId);
  if (existing) await ctx.db.delete(existing._id);
  const recapId = await ctx.db.insert("chatRecaps", {
    userId: input.userId,
    parentId: input.parentId,
    kind: input.kind,
    since: input.since,
    createdAt: input.now,
  });
  await ctx.scheduler.runAfter(0, internal.textGen.generateChatRecap, {
    recapId,
  });
}

/**
 * "Recap chat" in the chat menu: a recap of the whole chat. A second click
 * while one is still being written does nothing.
 */
export const requestFull = authMutation({
  args: { parentId: chatParentIdValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertMessageParentAccess(ctx.db, args.parentId, ctx.userId);
    const existing = await getRecapRow(ctx.db, ctx.userId, args.parentId);
    if (existing?.kind === "full" && existing.text === undefined) return null;
    await startRecap(ctx, {
      userId: ctx.userId,
      parentId: args.parentId,
      kind: "full",
      since: 0,
      now: Date.now(),
    });
    return null;
  },
});

/** The open chat's recap for the caller, or null. Text unset while it is written. */
export const forChat = authQuery({
  args: { parentId: chatParentIdValidator },
  returns: v.union(v.null(), recapRowValidator),
  handler: async (ctx, args) => {
    await assertMessageParentAccess(ctx.db, args.parentId, ctx.userId);
    const row = await getRecapRow(ctx.db, ctx.userId, args.parentId);
    if (!row) return null;
    return {
      _id: row._id,
      kind: row.kind,
      since: row.since,
      createdAt: row.createdAt,
      ...(row.text !== undefined ? { text: row.text } : {}),
    };
  },
});

export const dismiss = authMutation({
  args: { recapId: v.id("chatRecaps") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.recapId);
    if (row && row.userId === ctx.userId) await ctx.db.delete(row._id);
    return null;
  },
});

/** One chat the recap reads, with how the model should name it. */
interface RecapChat {
  parentId: ChatParentId;
  /** Plain label, or an `@[Title](taskId)` token the model may copy. */
  label: string;
}

/** The chats a recap covers: a project's Main chat reads the whole project session. */
async function recapChats(
  ctx: QueryCtx,
  parentId: ChatParentId,
): Promise<{ chats: RecapChat[]; taskIds: Id<"agentTasks">[] }> {
  const chatId = ctx.db.normalizeId("sessionChats", parentId);
  const chat = chatId ? await ctx.db.get(chatId) : null;
  const session = chat ? await ctx.db.get(chat.sessionId) : null;
  if (!chat || !session || !chat.isMain || session.owner.kind !== "project") {
    return { chats: [{ parentId, label: "This chat" }], taskIds: [] };
  }
  const sessionChats = await ctx.db
    .query("sessionChats")
    .withIndex("by_session", (q) => q.eq("sessionId", session._id))
    .collect();
  const chats: RecapChat[] = [];
  const taskIds: Id<"agentTasks">[] = [];
  for (const row of sessionChats) {
    if (row.archived === true) continue;
    const task = row.taskId ? await ctx.db.get(row.taskId) : null;
    if (task) {
      taskIds.push(task._id);
      chats.push({ parentId: row._id, label: `@[${task.title}](${task._id})` });
    } else {
      chats.push({
        parentId: row._id,
        label: row.isMain ? "Project chat" : row.title,
      });
    }
  }
  return { chats, taskIds };
}

function clip(text: string, limit: number): string {
  const trimmed = text.trim();
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit - 1)}…`;
}

/**
 * Everything the model needs: the transcript since the read time (newest
 * kept when it runs over budget, then oldest first), the chat's Log entries
 * from the same span, and the task ids it may link.
 */
export const recapContext = internalQuery({
  args: { recapId: v.id("chatRecaps") },
  returns: v.union(
    v.null(),
    v.object({
      kind: chatRecapKindValidator,
      awayMs: v.number(),
      transcript: v.string(),
      log: v.string(),
      allowedIds: v.array(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const recap = await ctx.db.get(args.recapId);
    if (!recap) return null;
    const { chats, taskIds } = await recapChats(ctx, recap.parentId);
    const lines: { at: number; text: string }[] = [];
    for (const chat of chats) {
      const rows = await ctx.db
        .query("messages")
        .withIndex("by_parent", (q) => q.eq("parentId", chat.parentId))
        .order("desc")
        .take(MESSAGES_PER_CHAT);
      for (const row of rows) {
        const at = row.finishedAt ?? row.timestamp;
        if (at <= recap.since || row.isSystemAlert === true) continue;
        const who = row.role === "user" ? "User" : "Agent";
        const where = chats.length > 1 ? `[${chat.label}] ` : "";
        lines.push({
          at,
          text: `${where}${who}: ${clip(row.content, MESSAGE_CLIP)}`,
        });
      }
    }
    lines.sort((a, b) => b.at - a.at);
    const kept: string[] = [];
    let used = 0;
    for (const line of lines) {
      if (used + line.text.length > DIGEST_BUDGET) break;
      kept.push(line.text);
      used += line.text.length;
    }
    kept.reverse();

    const fields = await chatSourceFieldsForEntityId(ctx.db, recap.parentId);
    const source = fields ? chatSourceArgFromFields(fields) : null;
    const logRows = source
      ? await listRowsForChatSource(ctx, "chatLogEntries", source)
      : [];
    const log = logRows
      .filter((row) => row.createdAt > recap.since)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((row) => `- ${row.kind}: ${row.title}`)
      .join("\n");

    return {
      kind: recap.kind,
      awayMs: recap.createdAt - recap.since,
      transcript: kept.join("\n\n"),
      log,
      allowedIds: taskIds.map(String),
    };
  },
});

/** Saves the text; an empty one (nothing to say, or a failed call) drops the row. */
export const applyRecap = internalMutation({
  args: { recapId: v.id("chatRecaps"), text: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.recapId);
    if (!row) return null;
    if (args.text.trim() === "") {
      await ctx.db.delete(row._id);
      return null;
    }
    await ctx.db.patch(row._id, { text: args.text.trim() });
    return null;
  },
});
