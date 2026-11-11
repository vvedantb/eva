import type { DatabaseReader } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { findMainChat } from "../_sessionChats/helpers";
import type { ChatEntityKind } from "../_validators/enums";
import {
  findProjectSession,
  findProjectTaskChat,
  findQuickTaskSession,
} from "../_sessions/owner";


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
  if (entityKind === "task") {
    const taskId = db.normalizeId("agentTasks", entityId);
    if (!taskId) return null;
    // A quick task's chat is its session's Main chat (a run's cards land
    // there too), a project task's its own chat in the project's session; a
    // task with no session chat yet keeps its own.
    const task = await db.get(taskId);
    if (task?.projectId !== undefined) {
      return (await findProjectTaskChat(db, taskId))?._id ?? taskId;
    }
    const session = task ? await findQuickTaskSession(db, task) : null;
    const mainChat = session ? await findMainChat(db, session._id) : null;
    return mainChat?._id ?? taskId;
  }
  const projectId = db.normalizeId("projects", entityId);
  if (!projectId) return null;
  // A project's chat is its session's Main chat, once it has one.
  const session = await findProjectSession(db, projectId);
  const mainChat = session ? await findMainChat(db, session._id) : null;
  return mainChat?._id ?? projectId;
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
