"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useConvexConnectionState } from "convex/react";
import { toast } from "@vvedantb/ui";

const TOAST_ID = "connection-status";

const GRACE_MS = 3_000;

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
      toast.success("Back online", { id: TOAST_ID, duration: 2000 });
      return;
    }

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
