import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertMessageParentAccess,
  authQuery,
  authMutation,
} from "./functions";
import { variationValidator, messageFields } from "./validators";
import {
  appendMediaStorageIds,
  messageMediaStorageIds,
  messageNeedsUrlResolution,
} from "./_messages/media";
import { trimActivityLogForTranscript } from "./_messages/activityLog";
import { resolveStorageEntries } from "./_chat/storageUrls";

const parentIdValidator = messageFields.parentId;

const messageValidator = v.object({
  _id: v.id("messages"),
  _creationTime: v.number(),
  ...messageFields,
  // Resolved agent media (recordings/screenshots), in capture order.
  media: v.optional(
    v.array(
      v.object({
        url: v.union(v.string(), v.null()),
        contentType: v.union(v.string(), v.null()),
      }),
    ),
  ),
  // Resolved URLs for user-attached input files, in the same order as
  // attachmentStorageIds. Entries that fail to resolve are null.
  attachmentUrls: v.optional(v.array(v.union(v.string(), v.null()))),
  // Parallel metadata for rendering (image thumb vs file chip).
  attachments: v.optional(
    v.array(
      v.object({
        url: v.union(v.string(), v.null()),
        contentType: v.union(v.string(), v.null()),
      }),
    ),
  ),
});

/** Temporary upload URL for a composer image attachment (client POSTs the file, then sends the message). */
export const generateUploadUrl = authMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

/**
 * Largest `tail` a caller may ask for: the web app's biggest older-history
 * page (`useOlderTranscript`). Past it, the caller asks for everything.
 */
const MAX_TAIL = 400;

/**
 * Which messages of a parent to read, oldest first in the result. Ranges are
 * on `_creationTime`, the last field of every index.
 */
type MessageRange =
  | { kind: "all" }
  | { kind: "tail"; count: number }
  | { kind: "since"; creationTime: number }
  | { kind: "before"; creationTime: number; count: number }
  | { kind: "allBefore"; creationTime: number };

function messageRange(args: {
  tail?: number;
  since?: number;
  before?: number;
}): MessageRange {
  const { tail, since, before } = args;
  if (
    tail !== undefined &&
    (!Number.isInteger(tail) || tail < 1 || tail > MAX_TAIL)
  ) {
    throw new Error(`tail must be an integer from 1 to ${MAX_TAIL}`);
  }
  if (since !== undefined) {
    if (tail !== undefined || before !== undefined) {
      throw new Error("since cannot be combined with tail or before");
    }
    return { kind: "since", creationTime: since };
  }
  if (before !== undefined) {
    return tail === undefined
      ? { kind: "allBefore", creationTime: before }
      : { kind: "before", creationTime: before, count: tail };
  }
  return tail === undefined ? { kind: "all" } : { kind: "tail", count: tail };
}

async function readMessages(
  db: QueryCtx["db"],
  parentId: typeof parentIdValidator.type,
  range: MessageRange,
): Promise<Doc<"messages">[]> {
  switch (range.kind) {
    case "all":
      return db
        .query("messages")
        .withIndex("by_parent", (q) => q.eq("parentId", parentId))
        .collect();
    case "since":
      return db
        .query("messages")
        .withIndex("by_parent", (q) =>
          q.eq("parentId", parentId).gte("_creationTime", range.creationTime),
        )
        .collect();
    case "tail":
      return (
        await db
          .query("messages")
          .withIndex("by_parent", (q) => q.eq("parentId", parentId))
          .order("desc")
          .take(range.count)
      ).reverse();
    case "before":
      return (
        await db
          .query("messages")
          .withIndex("by_parent", (q) =>
            q.eq("parentId", parentId).lt("_creationTime", range.creationTime),
          )
          .order("desc")
          .take(range.count)
      ).reverse();
    case "allBefore":
      return db
        .query("messages")
        .withIndex("by_parent", (q) =>
          q.eq("parentId", parentId).lt("_creationTime", range.creationTime),
        )
        .collect();
  }
}

/** Fetches messages for a parent and resolves their image/video/attachment storage URLs. */
async function resolveMessageUrls(
  ctx: Pick<QueryCtx, "db" | "storage">,
  parentId: typeof parentIdValidator.type,
  range: MessageRange,
) {
  const messages = await readMessages(ctx.db, parentId, range);
  if (!messages.some(messageNeedsUrlResolution)) {
    return messages;
  }
  return Promise.all(
    messages.map(async (m) => {
      if (!messageNeedsUrlResolution(m)) {
        return m;
      }
      const attachmentEntries = m.attachmentStorageIds
        ? await resolveStorageEntries(
            (id) => ctx.storage.getUrl(id),
            (id) => ctx.storage.getMetadata(id),
            m.attachmentStorageIds,
          )
        : undefined;
      const mediaIds = messageMediaStorageIds(m);
      const mediaEntries =
        mediaIds.length > 0
          ? await resolveStorageEntries(
              (id) => ctx.storage.getUrl(id),
              (id) => ctx.storage.getMetadata(id),
              mediaIds,
            )
          : undefined;
      return {
        ...m,
        media: mediaEntries?.map((entry) => ({
          url: entry.url,
          contentType: entry.contentType,
        })),
        attachmentUrls: attachmentEntries
          ? attachmentEntries.map((entry) => entry.url)
          : undefined,
        attachments: attachmentEntries?.map((entry) => ({
          url: entry.url,
          contentType: entry.contentType,
        })),
      };
    }),
  );
}

/**
 * Lists all messages for a parent entity (session, doc, etc.) with resolved
 * media URLs.
 *
 * Activity payloads ship without their expanded-only step detail — the single
 * heaviest thing on this subscription, and invisible until a reader opens a
 * disclosure. `activityLogById` serves the full payload for the one turn that
 * gets expanded.
 *
 * The whole list of a 400-message chat reads 5.6 MB and returns 3.2 MB (load
 * test, 2026-11-09), so the web app never asks for it (mobile still does).
 * Every result is oldest first:
 * - `tail`: the newest `tail` messages. A chat opens from this.
 * - `since`: every message created at or after `since`. The open chat follows
 *   this, anchored on the oldest row of its first tail, so new messages never
 *   leave a gap.
 * - `before` + `tail`: the newest `tail` messages created before `before`. One
 *   page of older history; its args are fixed, so it caches like any query.
 *   `before` alone: every message created before it (find and fork, until
 *   they run on the server).
 * See `useChatTranscript` in the web app.
 */
export const listByParent = authQuery({
  args: {
    parentId: parentIdValidator,
    tail: v.optional(v.number()),
    since: v.optional(v.number()),
    before: v.optional(v.number()),
  },
  returns: v.array(messageValidator),
  handler: async (ctx, args) => {
    await assertMessageParentAccess(ctx.db, args.parentId, ctx.userId);
    const messages = await resolveMessageUrls(
      ctx,
      args.parentId,
      messageRange(args),
    );
    return messages.map((message) => {
      const activityLog = trimActivityLogForTranscript(message.activityLog);
      return activityLog === message.activityLog
        ? message
        : Object.assign({}, message, { activityLog });
    });
  },
});

/**
 * Whether a chat has any message created before `before`: tells the web app
 * if history sits above its live rows. Reads at most one row.
 */
export const hasMessagesBefore = authQuery({
  args: { parentId: parentIdValidator, before: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await assertMessageParentAccess(ctx.db, args.parentId, ctx.userId);
    const older = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) =>
        q.eq("parentId", args.parentId).lt("_creationTime", args.before),
      )
      .first();
    return older !== null;
  },
});

/**
 * Every user message of a chat, oldest first: the jump rail's ticks and the
 * composer's up-arrow recall. Reads through `by_parent_and_role`, so it never
 * touches the assistant rows that carry the heavy activity logs.
 */
export const listUserMessagesByParent = authQuery({
  args: { parentId: parentIdValidator },
  returns: v.array(
    v.object({
      _id: v.id("messages"),
      _creationTime: v.number(),
      content: v.string(),
      isSystemAlert: v.optional(v.boolean()),
    }),
  ),
  handler: async (ctx, args) => {
    await assertMessageParentAccess(ctx.db, args.parentId, ctx.userId);
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_parent_and_role", (q) =>
        q.eq("parentId", args.parentId).eq("role", "user"),
      )
      .collect();
    return rows.map((row) => ({
      _id: row._id,
      _creationTime: row._creationTime,
      content: row.content,
      ...(row.isSystemAlert === undefined
        ? {}
        : { isSystemAlert: row.isSystemAlert }),
    }));
  },
});

/**
 * The untrimmed activity payload for one message, fetched when a reader expands
 * a turn whose steps `listByParent` trimmed.
 *
 * Takes a plain string because the chat renders optimistic rows under
 * client-minted ids; `normalizeId` rejects those the same way it rejects a
 * deleted row, so the caller gets `null` rather than an argument error.
 */
export const activityLogById = authQuery({
  args: { messageId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const messageId = ctx.db.normalizeId("messages", args.messageId);
    if (!messageId) return null;
    const message = await ctx.db.get(messageId);
    if (!message) return null;
    await assertMessageParentAccess(ctx.db, message.parentId, ctx.userId);
    return message.activityLog ?? null;
  },
});

/**
 * The reply bubble a turn opened, or null when the id is unknown or the row
 * is gone. Takes a string: the callback sends the turn id it got from env.
 */
async function turnReplyMessage(
  db: QueryCtx["db"],
  turnId: string | undefined,
): Promise<Doc<"messages"> | null> {
  if (turnId === undefined) return null;
  const id = db.normalizeId("turns", turnId);
  if (!id) return null;
  const turn = await db.get(id);
  if (turn?.placeholderMessageId === undefined) return null;
  return await db.get(turn.placeholderMessageId);
}

/** Updates an exact message, else the turn's own reply, else the latest message. */
export const updateLastInternal = internalMutation({
  args: {
    parentId: parentIdValidator,
    messageId: v.optional(v.id("messages")),
    /**
     * The turn that made the media. Its own reply is the target, so a queued
     * follow-up that lands during the upload cannot take the media.
     */
    turnId: v.optional(v.string()),
    content: v.optional(v.string()),
    activityLog: v.optional(v.string()),
    variations: v.optional(v.array(variationValidator)),
    // Legacy single-media args: stale callback bundles still in flight during
    // a deploy call with these instead of mediaStorageIds. New callers use
    // mediaStorageIds.
    imageStorageId: v.optional(v.id("_storage")),
    videoStorageId: v.optional(v.id("_storage")),
    mediaStorageIds: v.optional(v.array(v.id("_storage"))),
    /** Set by public entry points (`screenshots:attachMedia`) to enforce access. */
    requesterUserId: v.optional(v.id("users")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.requesterUserId !== undefined) {
      await assertMessageParentAccess(
        ctx.db,
        args.parentId,
        args.requesterUserId,
      );
    }
    const target = args.messageId
      ? await ctx.db.get(args.messageId)
      : ((await turnReplyMessage(ctx.db, args.turnId)) ??
        (await ctx.db
          .query("messages")
          .withIndex("by_parent", (q) => q.eq("parentId", args.parentId))
          .order("desc")
          .first()));
    if (!target || target.parentId !== args.parentId) return null;

    const patch: {
      content?: string;
      activityLog?: string;
      variations?: (typeof variationValidator.type)[];
      mediaStorageIds?: Id<"_storage">[];
    } = {};
    if (args.content !== undefined) patch.content = args.content;
    if (args.activityLog !== undefined) patch.activityLog = args.activityLog;
    if (args.variations !== undefined) patch.variations = args.variations;

    // Accumulates within a turn, so a second capture cannot orphan the first.
    const mediaStorageIds = appendMediaStorageIds(target.mediaStorageIds, args);
    if (mediaStorageIds !== undefined) {
      patch.mediaStorageIds = mediaStorageIds;
    }

    await ctx.db.patch(target._id, patch);
    return null;
  },
});
