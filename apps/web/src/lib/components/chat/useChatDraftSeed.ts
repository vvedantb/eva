import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { tokenizedToEditable } from "@/lib/components/mentions";

type SessionChatTarget = {
  kind: "sessionChat";
  sessionId: Id<"sessions">;
  chatId: Id<"sessionChats">;
};

export type ChatDraftTarget = SessionChatTarget;

export type ChatDraftSeed = {
  target: ChatDraftTarget;
  initialDisplay: string;
  mentionMap: Map<string, string>;
  skillMap: Map<string, string>;
};

/**
 * Fetches the persisted draft for a chat surface and converts the stored
 * tokenized content into the display text and mention maps the editor needs.
 *
 * isReady is false until the Convex query has resolved (undefined → loading).
 * The PromptInputProvider subtree must NOT mount until isReady is true so that
 * initialInput is never seeded with an empty string before the draft loads.
 */
export function useChatDraftSeed(target: ChatDraftTarget | undefined): {
  isReady: boolean;
  initialDisplay: string;
  mentionMap: Map<string, string>;
  skillMap: Map<string, string>;
} {
  const data = useQuery(
    api.drafts.getForTarget,
    target ? { target } : "skip",
  );

  const isReady = target === undefined || data !== undefined;

  const { displayText, mentionMap, skillMap } = tokenizedToEditable(data ?? "");

  return { isReady, initialDisplay: displayText, mentionMap, skillMap };
}
