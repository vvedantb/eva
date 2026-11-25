import type { MentionItem } from "./mentionComposer";

/**
 * Who a person's message in a project coordinator chat is for (plan
 * `projects-v2-chat.md`, decision 1). A message that `@`-mentions only
 * teammates is a quiet comment between people: it starts no Eva turn, and the
 * teammates are notified. Every other message wakes Eva: no mention, `@Eva`,
 * or `@Eva` together with teammates (Eva leaves their part to them).
 */
export type ChatMessageRoute = "wake" | "quiet";

/**
 * The `@Eva` token id in a coordinator chat. Same token shape as a person or
 * data mention (`@[Eva](id)`), so it fits the token pattern
 * (`[a-z0-9_]{16,40}`), but it names no table row.
 */
export const EVA_MENTION_ID = "eva_coordinator_mention";

/** The `@Eva` row of a coordinator chat's mention picker. */
export const EVA_MENTION_ITEM: MentionItem = {
  id: EVA_MENTION_ID,
  label: "Eva",
  badge: "Coordinator",
};

/** True when `content` holds an `@Eva` token. */
export function mentionsEva(content: string): boolean {
  return content.includes(`](${EVA_MENTION_ID})`);
}

export function chatMessageRoute(message: {
  mentionsEva: boolean;
  /** Teammates `@`-mentioned, not counting the author. */
  mentionedPeople: number;
}): ChatMessageRoute {
  return message.mentionedPeople > 0 && !message.mentionsEva ? "quiet" : "wake";
}
