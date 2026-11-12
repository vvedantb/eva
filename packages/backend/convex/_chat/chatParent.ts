import type { DatabaseReader } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { findMainChat } from "../_sessionChats/helpers";
import type { ChatEntityKind } from "../_validators/enums";
import {
  findProjectSession,
  findProjectTaskChat,
  findTaskWorkSession,
} from "../_sessions/owner";

type ChatParentId = Id<"sessionChats"> | Id<"sessions">;

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
    db.normalizeId("sessions", entityId)
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
    const task = taskId ? await db.get(taskId) : null;
    if (!task) return null;
    // A project task's own chat in the project's session, once it has one;
    // else the Main chat of the session it works on (a quick task's own, a
    // project task's project's). A run's cards land there too.
    const taskChat =
      task.projectId !== undefined
        ? await findProjectTaskChat(db, task._id)
        : null;
    if (taskChat) return taskChat._id;
    const session = await findTaskWorkSession(db, task);
    return session ? ((await findMainChat(db, session._id))?._id ?? null) : null;
  }
  const projectId = db.normalizeId("projects", entityId);
  if (!projectId) return null;
  // A project's chat is its session's Main chat.
  const session = await findProjectSession(db, projectId);
  return session ? ((await findMainChat(db, session._id))?._id ?? null) : null;
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
