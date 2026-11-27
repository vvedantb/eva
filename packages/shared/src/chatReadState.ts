import { api } from "@eva/backend";
import { useMutation, useQuery } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";
import dayjs from "./utils/dates";
import { isOtherUserChatMessage, type ChatUserAttribution } from "./teammateMessages";

// The open chat's read state, web and phone: it marks the chat read while it
// is on screen, and remembers where unseen replies began for the "NEW" divider.
// A subpath (`@eva/shared/chatReadState`), not the root: it is React.

/** How often an on-screen chat reports presence; well under the 30-minute away recap. */
const VISIT_HEARTBEAT_MS = 5 * 60 * 1000;

/** A chat whose read state is kept (a session chat, task or project). */
export type ChatReadParentId = FunctionArgs<typeof api.chatReads.markRead>["parentId"];

/**
 * Read state of the open chat.
 *
 * - Marks the chat read each time it comes on screen (`active`: the web's
 *   route and tab visibility, the phone's screen focus and app foreground),
 *   and again when a reply lands while it is. The server also records the
 *   visit and may start a recap. While on screen it reports presence every
 *   `VISIT_HEARTBEAT_MS`, and once on leaving, so an absence starts when the
 *   user leaves.
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
  const touchVisit = useMutation(api.chatReads.touchVisit);

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
    void markRead({ parentId, opened: true });
    // Present while on screen, and once on leaving: the next recap measures
    // the absence from here, not from the open.
    const timer = setInterval(() => touchVisit({ parentId }).catch(() => undefined), VISIT_HEARTBEAT_MS);
    return () => {
      clearInterval(timer);
      // Best effort: signing out or closing the app can drop it.
      touchVisit({ parentId }).catch(() => undefined);
    };
  }, [parentId, isActive, markRead, touchVisit]);
  useEffect(() => {
    if (!isActive || parentId === undefined || hasUnread !== true) return;
    void markRead({ parentId });
  }, [parentId, isActive, hasUnread, markRead]);
  /* eslint-enable no-effect/no-event-handler */

  return { newSinceAt: captured !== null && captured.parentId === parentId ? captured.anchor : undefined };
}

/** A reply thread's read and follow state for the caller (`threads.readState`). */
export type ThreadReadState = FunctionReturnType<typeof api.threads.readState>;

/**
 * Read state of an open reply thread, web and phone, as `useChatReadState`
 * for a chat: marks the thread read when it comes on screen (`active`) and
 * again when a reply lands while it is, which also reads its notifications.
 * Returns the thread's `state` (null: not a participant) and `newSinceAt`,
 * the read time from before the mark, for the "New" line: captured from the
 * first result while active and held until it goes inactive or `rootId`
 * changes.
 */
export function useThreadReadState({
  rootId,
  active,
}: {
  rootId: string;
  active: boolean;
}): { state: ThreadReadState | undefined; newSinceAt: number | undefined } {
  const state = useQuery(api.threads.readState, { rootId });
  const markRead = useMutation(api.threads.markRead);

  // Adjusted during render, as `useChatReadState`: no effect, no extra commit.
  const [captured, setCaptured] = useState<{ rootId: string; anchor: number | undefined } | null>(null);
  if (!active) {
    if (captured !== null) setCaptured(null);
  } else if (state !== undefined && (captured === null || captured.rootId !== rootId)) {
    setCaptured({ rootId, anchor: state !== null && state.unread > 0 ? (state.lastReadAt ?? 0) : undefined });
  }

  const hasUnread = (state?.unread ?? 0) > 0;
  // Mark only once the state has loaded: the "New" line is captured from it
  // above, and marking first would leave nothing unread to place it at.
  const loaded = state !== undefined;
  /* eslint-disable no-effect/no-event-handler --
     The triggers are the thread coming on screen (web panel and tab, phone
     focus and foreground, a deep link: no single event across both apps)
     and a reply landing, which arrives as a live-query change. Opening
     marks even with no unread replies: it reads the thread's notifications. */
  useEffect(() => {
    if (!active || !loaded) return;
    void markRead({ rootId });
  }, [rootId, active, loaded, hasUnread, markRead]);
  /* eslint-enable no-effect/no-event-handler */

  return { state, newSinceAt: captured !== null && captured.rootId === rootId ? captured.anchor : undefined };
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

/**
 * The recap card's title. An "away" recap says when the absence began
 * ("Since you left 3 hours ago", "Since you left a week ago"); `since` is the
 * last time the user saw the chat.
 */
export function recapTitle(kind: "away" | "full", since: number): string {
  return kind === "away" ? `Since you left ${dayjs(since).fromNow()}` : "Recap";
}
