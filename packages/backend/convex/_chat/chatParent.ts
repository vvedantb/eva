import { v } from "convex/values";
import type { DatabaseReader } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { findMainChat } from "../_sessionChats/helpers";

/** The chat surface a sandbox MCP token names. */
export const chatEntityKindValidator = v.union(
  v.literal("session"),
  v.literal("task"),
  v.literal("project"),
);

type ChatEntityKind = typeof chatEntityKindValidator.type;

type ChatParentId =
  | Id<"sessionChats">
  | Id<"sessions">
  | Id<"agentTasks">
  | Id<"projects">;

/**
 * Narrows a bare turn owner id to a chat entity. Null for runs, docs,
 * automation runs and evaluation reports, which own turns but no chat.
 */
export function chatParentIdOf(
  db: DatabaseReader,
  entityId: string,
): ChatParentId | null {
  return (
    db.normalizeId("sessionChats", entityId) ??
    db.normalizeId("sessions", entityId) ??
    db.normalizeId("agentTasks", entityId) ??
    db.normalizeId("projects", entityId)
  );
}

/**
 * The chat a sandbox token names, resolved to the id its messages hang off.
 * A session's messages live on its chats, so a bare session id (an MCP caller
 * naming the session, or a token minted before chats) lands on its Main chat.
 */
export async function resolveChatParent(
  db: DatabaseReader,
  entityKind: ChatEntityKind,
  entityId: string,
): Promise<ChatParentId | null> {
  if (entityKind === "session") {
    const chatId = db.normalizeId("sessionChats", entityId);
    if (chatId) return chatId;
    const sessionId = db.normalizeId("sessions", entityId);
    if (!sessionId) return null;
    const mainChat = await findMainChat(db, sessionId);
    return mainChat?._id ?? null;
  }
  if (entityKind === "task") return db.normalizeId("agentTasks", entityId);
  return db.normalizeId("projects", entityId);
}

/**
 * The newest message in a chat. During a turn that is the assistant
 * placeholder the agent is filling in, so an inline card anchored here shows
 * under the reply that created it rather than at the end of history.
 */
export async function latestChatMessageId(
  db: DatabaseReader,
  parentId: ChatParentId,
): Promise<Id<"messages"> | undefined> {
  const latest = await db
    .query("messages")
    .withIndex("by_parent", (q) => q.eq("parentId", parentId))
    .order("desc")
    .first();
  return latest?._id;
}
