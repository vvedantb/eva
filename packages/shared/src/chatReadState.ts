import { api } from "@eva/backend";
import { useMutation, useQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { useEffect, useState } from "react";
import { isOtherUserChatMessage, type ChatUserAttribution } from "./teammateMessages";

// The open chat's read state, web and phone: it marks the chat read while it
// is on screen, and remembers where unseen replies began for the "NEW" divider.
// A subpath (`@eva/shared/chatReadState`), not the root: it is React.

/** A chat whose read state is kept (a session chat, task or project). */
export type ChatReadParentId = FunctionArgs<typeof api.chatReads.markRead>["parentId"];

/**
 * Read state of the open chat.
 *
 * - Marks the chat read each time it comes on screen (`active`: the web's
 *   route and tab visibility, the phone's screen focus and app foreground),
 *   and again when a reply lands while it is. The server also records the
 *   visit and may start a recap.
 * - Returns `newSinceAt`, the read time from before `markRead` moved it, which
 *   the "NEW" divider anchors on. It is captured from the first `isUnread`
 *   result after the chat becomes active and held until it goes inactive or
 *   `parentId` changes, so the divider does not vanish when the mark lands.
 *
 * `parentId` undefined (a chat with no read state yet) does nothing.
 */
export function useChatReadState({
  parentId,
  active,
}: {
  parentId: ChatReadParentId | undefined;
  active: boolean;
}): { newSinceAt: number | undefined } {
  const isActive = active && parentId !== undefined;
  const read = useQuery(api.chatReads.isUnread, isActive && parentId !== undefined ? { parentId } : "skip");
  const markRead = useMutation(api.chatReads.markRead);

  // State, not a ref: the anchor drives render (the divider must appear once
  // it is captured). Adjusted during render, React's "store information from
  // previous renders" pattern, so no effect and no extra commit.
  const [captured, setCaptured] = useState<{ parentId: ChatReadParentId; anchor: number | undefined } | null>(null);
  if (!isActive) {
    // Leaving (hidden tab, cached shell, another screen) drops the anchor, so the return gets a fresh one.
    if (captured !== null) setCaptured(null);
  } else if (read !== undefined && (captured === null || captured.parentId !== parentId)) {
    setCaptured({ parentId, anchor: read.hasUnread ? (read.lastReadAt ?? 0) : undefined });
  }

  const hasUnread = read?.hasUnread;
  /* eslint-disable no-effect/no-event-handler --
     The triggers are the chat coming on screen (web route and tab, phone
     focus and foreground: no single event across both apps) and a turn
     finishing on the server, which arrives as a live-query change to
     `isUnread`. Every open marks, read or not: the server decides on it
     whether to write a recap (`chatRecaps.maybeStartRecap`). */
  useEffect(() => {
    if (!isActive || parentId === undefined) return;
    void markRead({ parentId });
  }, [parentId, isActive, markRead]);
  useEffect(() => {
    if (!isActive || parentId === undefined || hasUnread !== true) return;
    void markRead({ parentId });
  }, [parentId, isActive, hasUnread, markRead]);
  /* eslint-enable no-effect/no-event-handler */

  return { newSinceAt: captured !== null && captured.parentId === parentId ? captured.anchor : undefined };
}

/**
 * The messages that arrived after `newSinceAt` and are someone else's (Eva's
 * replies, a teammate's turns), oldest first: the "NEW" divider goes above
 * the first. None when there is no anchor.
 */
export function findNewMessageIds<TId extends string>(
  messages: ReadonlyArray<{ _id: TId; timestamp: number; finishedAt?: number } & ChatUserAttribution>,
  newSinceAt: number | undefined,
  currentUserId: string | undefined,
): TId[] {
  if (newSinceAt === undefined) return [];
  return messages
    .filter(
      (message) =>
        !message.isSystemAlert &&
        (message.finishedAt ?? message.timestamp) > newSinceAt &&
        (message.role === "assistant" || isOtherUserChatMessage(message, currentUserId)),
    )
    .map((message) => message._id);
}

/**
 * The open chat's recap, web and phone (`chatRecaps`): "away" when `markRead`
 * saw the user come back after a long absence, "full" from "Recap chat". `text` is undefined while the model writes it. The card
 * goes once the user sends a message after it: the recap is about the past,
 * and the chat has moved on. `dismiss` deletes it for good.
 */
export function useChatRecap({
  parentId,
  active,
  messages,
  currentUserId,
}: {
  parentId: ChatReadParentId | undefined;
  active: boolean;
  messages: ReadonlyArray<{ timestamp: number } & ChatUserAttribution>;
  currentUserId: string | undefined;
}): { recap: { kind: "away" | "full"; text: string | undefined } | null; dismiss: () => void } {
  const row = useQuery(api.chatRecaps.forChat, active && parentId !== undefined ? { parentId } : "skip");
  const dismissRecap = useMutation(api.chatRecaps.dismiss);
  const answered =
    row != null &&
    messages.some(
      (message) =>
        message.role === "user" && message.timestamp > row.createdAt && !isOtherUserChatMessage(message, currentUserId),
    );
  const recap = row == null || answered ? null : { kind: row.kind, text: row.text };
  const dismiss = () => {
    if (row) void dismissRecap({ recapId: row._id });
  };
  return { recap, dismiss };
}

/** The recap card's title for each kind. */
export const RECAP_TITLE: Record<"away" | "full", string> = {
  away: "Since you've been gone",
  full: "Recap",
};
