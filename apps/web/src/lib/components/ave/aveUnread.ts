import { useEffect } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { useDocumentVisible } from "@vvedantb/ui";

/**
 * Ave replied after the user last had the chat on screen (`readAt`). A run in
 * flight is not unread: the launcher face already shows it working.
 */
export function aveHasUnread(
  thread: { status: "idle" | "running"; readAt?: number } | null | undefined,
  messages:
    | readonly { role: "user" | "assistant"; timestamp: number; finishedAt?: number }[]
    | undefined,
): boolean {
  if (!thread || thread.status !== "idle") return false;
  const last = messages?.[messages.length - 1];
  if (last?.role !== "assistant") return false;
  return (last.finishedAt ?? last.timestamp) > (thread.readAt ?? 0);
}

/** Both queries are shared with the launcher face and the chat through the cache. */
export function useAveUnread(): boolean {
  return aveHasUnread(
    useQuery(api.ave.getThread, {}),
    useQuery(api.ave.listMessages, {}),
  );
}

/** Marks Ave read while its chat is on screen: surface visible and tab visible. */
export function useMarkAveRead(visible: boolean) {
  const isActive = useDocumentVisible() && visible;
  const hasUnread = useAveUnread();
  const markRead = useMutation(api.ave.markRead);
  /* eslint-disable no-effect/no-event-handler --
     The trigger is Ave's run finishing on the server, which arrives as a
     live-query change; there is no local event to mark read from. Same
     reasoning as `useChatReadState`. */
  useEffect(() => {
    if (!isActive || !hasUnread) return;
    void markRead({});
  }, [isActive, hasUnread, markRead]);
  /* eslint-enable no-effect/no-event-handler */
}
