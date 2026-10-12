"use client";

import usePresence from "@convex-dev/presence/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { sandboxPresenceRoomId } from "@eva/shared";

/**
 * Keeps the current user "present" in the entity's sandbox room while a
 * sandbox tab is in the foreground and in use (the host unmounts it once
 * `useUserEngaged` reads false). Renders nothing; the presence library owns
 * the heartbeat, pauses it when the browser tab is hidden and disconnects on
 * unload. The idle-pause sweep reads this room: anyone present means "in use".
 */
export function SandboxPresenceBeacon({
  entityId,
  userId,
}: {
  entityId: string;
  userId: Id<"users">;
}) {
  usePresence(api.presence, sandboxPresenceRoomId(entityId), userId);
  return null;
}
