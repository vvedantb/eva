import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@eva/backend";
import { useDocumentVisible } from "@/lib/hooks/useDocumentVisible";
import type { ChatParentId } from "@/lib/components/chat/chatBodyUtils";

/**
 * Read state of the open chat, for every surface (session, quick task,
 * project) from one place in ChatBody.
 *
 * - Marks the chat read while it is on screen: route active and tab visible.
 *   Cached hidden session shells pass `active: false`, so they never clear
 *   their own dot.
 * - Returns `newSinceAt`, the read time from before `markRead` moved it. The
 *   "NEW" divider anchors on it. It is captured from the first `isUnread`
 *   result after the chat becomes active and held until the chat goes
 *   inactive or `parentId` changes, so the divider does not vanish when the
 *   mark-read lands.
 *
 * `parentId` is absent for Manager Ave, which has no read state.
 */
export function useChatReadState({
  parentId,
  active,
}: {
  parentId: ChatParentId | undefined;
  active: boolean;
}): { newSinceAt: number | undefined } {
  const visible = useDocumentVisible();
  const isActive = active && visible && parentId !== undefined;
  const read = useQuery(
    api.chatReads.isUnread,
    isActive && parentId !== undefined ? { parentId } : "skip",
  );
  const markRead = useMutation(api.chatReads.markRead);

  // State, not a ref: the anchor drives render (the divider must appear once
  // it is captured). Adjusted during render, React's "store information from
  // previous renders" pattern, so no effect and no extra commit.
  const [captured, setCaptured] = useState<{
    parentId: ChatParentId;
    anchor: number | undefined;
  } | null>(null);
  if (!isActive) {
    // Leaving (hidden tab or cached shell) drops the anchor, so the return
    // gets a fresh one.
    if (captured !== null) setCaptured(null);
  } else if (
    read !== undefined &&
    (captured === null || captured.parentId !== parentId)
  ) {
    setCaptured({
      parentId,
      anchor: read.hasUnread ? (read.lastReadAt ?? 0) : undefined,
    });
  }

  const hasUnread = read?.hasUnread;
  /* eslint-disable no-effect/no-event-handler --
     The trigger is a turn finishing on the server, which arrives as a
     live-query change to `isUnread`; there is no local event to mark read
     from. Same reasoning as `useAgentReplyChime`. */
  useEffect(() => {
    if (!isActive || parentId === undefined || hasUnread !== true) return;
    void markRead({ parentId });
  }, [parentId, isActive, hasUnread, markRead]);
  /* eslint-enable no-effect/no-event-handler */

  return {
    newSinceAt:
      captured !== null && captured.parentId === parentId
        ? captured.anchor
        : undefined,
  };
}
