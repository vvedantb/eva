import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import usePresence from "@convex-dev/presence/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import {
  createTypingSignal,
  typingUsersFrom,
  type TypingUser,
} from "@eva/shared/typingPresence";

export type { TypingUser };

export interface TypingPresence {
  typingUsers: TypingUser[];
  onActivity: () => void;
  stopTyping: () => void;
}

/**
 * Broadcasts and observes ephemeral "is typing" presence for a conversation,
 * built on the @convex-dev/presence component (same mechanism as live
 * cursors). State lives only in presence, so it auto-clears when a user goes
 * offline — no DB table or cleanup job.
 *
 * `userId` may be undefined while the current-user query resolves; activity is
 * a no-op until it is known.
 */
export function useTypingPresence(
  roomId: string,
  userId: Id<"users"> | undefined,
): TypingPresence {
  const presenceState = usePresence(api.presence, roomId, userId ?? "");
  const updateTyping = useMutation(api.presence.updateTyping);
  const [signal] = useState(() =>
    createTypingSignal((room, isTyping) => {
      updateTyping({ roomId: room, isTyping }).catch(console.error);
    }),
  );

  function onActivity() {
    if (!userId) return;
    signal.activity(roomId);
  }

  useEffect(() => signal.stop, [signal, roomId]);

  const typingUsers = typingUsersFrom(presenceState, userId);
  const stopTyping = signal.stop;

  return { typingUsers, onActivity, stopTyping };
}
