import type { DatabaseReader } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { ChatEntityKind } from "../validators";

type ChatParentId = Id<"sessions"> | Id<"agentTasks"> | Id<"projects">;

/**
 * Narrows a bare turn owner id to a chat entity. Null for runs, docs,
 * automation runs and evaluation reports, which own turns but no chat.
 */
export function chatParentIdOf(
  db: DatabaseReader,
  entityId: string,
): ChatParentId | null {
  return (
    db.normalizeId("sessions", entityId) ??
    db.normalizeId("agentTasks", entityId) ??
    db.normalizeId("projects", entityId)
  );
}

/** The chat a sandbox token names, resolved to the id its messages hang off. */
export function resolveChatParent(
  db: DatabaseReader,
  entityKind: ChatEntityKind,
  entityId: string,
): ChatParentId | null {
  if (entityKind === "session") return db.normalizeId("sessions", entityId);
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
