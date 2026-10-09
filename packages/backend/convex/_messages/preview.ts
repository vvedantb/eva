import type { DatabaseReader } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { stripMentionTokens } from "../_mentions/resolveDocMentions";
import { stripSkillTokens } from "../_mentions/skillToken";

const PREVIEW_MAX_CHARS = 160;

type MessageParentId = Id<"sessionChats"> | Id<"sessions"> | Id<"projects"> | Id<"agentTasks">;

/** Collapses whitespace and truncates for sidebar hover previews. */
export function formatMessagePreview(content: string): string {
  const stripped = stripSkillTokens(stripMentionTokens(content))
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length === 0) return "";
  if (stripped.length <= PREVIEW_MAX_CHARS) return stripped;
  return `${stripped.slice(0, PREVIEW_MAX_CHARS - 1)}…`;
}

/**
 * Returns a short preview of the earliest non-empty user message for a chat
 * parent, or null when none exists yet.
 */
export async function firstUserMessagePreview(
  db: DatabaseReader,
  parentId: MessageParentId,
): Promise<string | null> {
  const messages = await db
    .query("messages")
    .withIndex("by_parent", (q) => q.eq("parentId", parentId))
    .order("asc")
    .take(30);

  for (const message of messages) {
    if (message.role !== "user") continue;
    if (message.isSystemAlert === true) continue;
    const preview = formatMessagePreview(message.content);
    if (preview.length > 0) return preview;
  }
  return null;
}
