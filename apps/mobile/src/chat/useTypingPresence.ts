import { api, type Id } from "@eva/backend";
import {
  createTypingSignal,
  typingUsersFrom,
  type TypingUser,
} from "@eva/shared/typingPresence";
import { usePresence } from "@convex-dev/presence/react-native";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";

/**
 * The web `useTypingPresence` on the phone, on the presence component's React
 * Native hook (it follows `AppState` instead of the page's visibility): being
 * in `roomId` keeps this person present there, `onActivity` on each keystroke
 * says they are typing (and stopped after a quiet spell), `stopTyping` says
 * stopped at once, and `typingUsers` is everyone else typing in the room.
 * Rules and wording are `@eva/shared/typingPresence`, as on the web.
 */
export function useTypingPresence(
  roomId: string,
  userId: Id<"users"> | null | undefined,
): {
  typingUsers: TypingUser[];
  onActivity: () => void;
  stopTyping: () => void;
} {
  const members = usePresence(api.presence, roomId, userId ?? "");
  const updateTyping = useMutation(api.presence.updateTyping);
  const [signal] = useState(() =>
    createTypingSignal((room, isTyping) => {
      updateTyping({ roomId: room, isTyping }).catch(() => undefined);
    }),
  );
  // Presence is an external system: leaving the screen (or the room) must say
  // "stopped" there, or teammates see this person typing until the timeout.
  // `roomId` on purpose: a new room stops the old one's flag.
  useEffect(() => signal.stop, [signal, roomId]);
  return {
    typingUsers: typingUsersFrom(members, userId ?? undefined),
    onActivity: () => {
      if (userId) signal.activity(roomId);
    },
    stopTyping: signal.stop,
  };
}
