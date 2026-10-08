"use client";

import { useEffect } from "react";
import { shouldFireAutoWake } from "./idleWake";

/** Fires `onWake` once when mounted (visibility is the mount condition — see SandboxPaneSlots). */
export function SandboxAutoWake({
  wakeKey,
  onWake,
}: {
  wakeKey: string;
  onWake: () => void;
}) {
  /* eslint-disable no-effect/no-event-handler --
     Landing on a visible sandbox tab of a paused sandbox is the trigger, not a
     click; the host mounts this only while that holds. */
  useEffect(() => {
    if (shouldFireAutoWake(wakeKey, Date.now())) onWake();
  }, [wakeKey, onWake]);
  /* eslint-enable no-effect/no-event-handler */
  return null;
}
