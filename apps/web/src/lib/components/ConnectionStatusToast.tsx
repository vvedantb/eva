"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useConvexConnectionState } from "convex/react";
import { toast } from "@eva/ui";

const TOAST_ID = "connection-status";

/**
 * Short drops are normal (tab wake, a flaky hop) and the client recovers on its
 * own, so nothing is said until the outage outlasts this.
 */
const GRACE_MS = 3_000;

/** Module-level so a remount cannot lose the "we owe them a Back online". */
let disconnectedToastShown = false;

function subscribeToOnline(listener: () => void): () => void {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

function readOnline(): boolean {
  return navigator.onLine;
}

/**
 * Tells the user when the app has stopped talking to the server.
 *
 * Without it a dropped WebSocket is indistinguishable from a hung agent: the
 * transcript simply stops, queries never resolve, and the obvious move is to
 * refresh and re-send — which is exactly what the sync layer is about to make
 * unnecessary. `navigator.onLine` only separates "your wifi is gone" from "we
 * cannot reach Eva"; the Convex socket is the signal that matters, because it
 * can be down while the network is fine.
 */
export function ConnectionStatusToast() {
  const { isWebSocketConnected } = useConvexConnectionState();
  const isOnline = useSyncExternalStore(
    subscribeToOnline,
    readOnline,
    () => true,
  );
  const isDisconnected = !isWebSocketConnected || !isOnline;

  useEffect(() => {
    if (!isDisconnected) {
      if (!disconnectedToastShown) return;
      disconnectedToastShown = false;
      // Updates the sticky toast in place rather than dismissing it first:
      // sonner defers a dismiss to the next frame, so a same-id toast created
      // straight after it is removed as soon as that frame lands. The update
      // path also resets the lifetime, so Infinity → 2000 auto-closes.
      toast.success("Back online", { id: TOAST_ID, duration: 2000 });
      return;
    }

    // Already complaining: re-title immediately when the network drops out
    // from under an already-dead socket, rather than waiting the grace again.
    const delay = disconnectedToastShown ? 0 : GRACE_MS;
    const timerId = window.setTimeout(() => {
      disconnectedToastShown = true;
      toast.message(isOnline ? "Reconnecting to Eva…" : "You're offline", {
        id: TOAST_ID,
        duration: Number.POSITIVE_INFINITY,
        description: "Changes you make will sync when the connection returns.",
      });
    }, delay);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [isDisconnected, isOnline]);

  return null;
}
