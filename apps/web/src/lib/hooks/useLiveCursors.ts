import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import usePresence from "@convex-dev/presence/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";

const THROTTLE_MS = 150;
/** Ignore jitter smaller than this share of the viewport (percent). */
const MIN_MOVE_PCT = 0.25;
/** Hide remote cursors that have not moved recently (presence can lag behind tab close). */
const CURSOR_ACTIVE_MS = 45_000;

export function cursorMovedEnough(
  last: { x: number; y: number } | null,
  next: { x: number; y: number },
): boolean {
  if (last === null) return true;
  return (
    Math.abs(next.x - last.x) >= MIN_MOVE_PCT ||
    Math.abs(next.y - last.y) >= MIN_MOVE_PCT
  );
}

interface CursorData {
  x: number;
  y: number;
  firstName: string;
  accentColor: string;
  updatedAt: number;
}

function isCursorData(data: object): data is CursorData {
  return (
    "x" in data &&
    "y" in data &&
    "firstName" in data &&
    "accentColor" in data &&
    "updatedAt" in data &&
    typeof data.x === "number" &&
    typeof data.y === "number" &&
    typeof data.firstName === "string" &&
    typeof data.accentColor === "string" &&
    typeof data.updatedAt === "number"
  );
}

export interface RemoteCursor {
  userId: string;
  x: number;
  y: number;
  firstName: string;
  accentColor: string;
}

export function useLiveCursors(
  roomId: string,
  userId: Id<"users">,
): RemoteCursor[] {
  const presenceState = usePresence(api.presence, roomId, userId);
  const updateCursor = useMutation(api.presence.updateCursor);
  const lastSentRef = useRef(0);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const hasRemoteOnline = Boolean(
    presenceState?.some((member) => member.userId !== userId && member.online),
  );

  useEffect(() => {
    if (!hasRemoteOnline) return;
    let intervalId = 0;
    const start = () => {
      if (intervalId !== 0) return;
      intervalId = window.setInterval(
        () => setNow(Date.now()),
        CURSOR_ACTIVE_MS / 2,
      );
    };
    const stop = () => {
      if (intervalId === 0) return;
      window.clearInterval(intervalId);
      intervalId = 0;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        start();
        return;
      }
      stop();
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hasRemoteOnline]);

  const updateCursorRef = useRef(updateCursor);
  updateCursorRef.current = updateCursor;

  const sendUpdate = useCallback((x: number, y: number) => {
    if (!cursorMovedEnough(lastPosRef.current, { x, y })) return;
    lastPosRef.current = { x, y };
    updateCursorRef.current({ roomId, x, y }).catch(console.error);
  }, [roomId]);

  useEffect(() => {
    if (!hasRemoteOnline) return;

    let attached = false;

    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      const now = Date.now();

      if (now - lastSentRef.current >= THROTTLE_MS) {
        lastSentRef.current = now;
        sendUpdate(x, y);
        pendingRef.current = null;
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      } else {
        pendingRef.current = { x, y };
        if (!timerRef.current) {
          timerRef.current = setTimeout(() => {
            if (pendingRef.current) {
              lastSentRef.current = Date.now();
              sendUpdate(pendingRef.current.x, pendingRef.current.y);
              pendingRef.current = null;
            }
            timerRef.current = null;
          }, THROTTLE_MS);
        }
      }
    };

    const syncMouseListener = () => {
      const shouldAttach = document.visibilityState === "visible";
      if (shouldAttach && !attached) {
        window.addEventListener("mousemove", handleMouseMove);
        attached = true;
      } else if (!shouldAttach && attached) {
        window.removeEventListener("mousemove", handleMouseMove);
        attached = false;
      }
    };

    syncMouseListener();
    document.addEventListener("visibilitychange", syncMouseListener);
    return () => {
      document.removeEventListener("visibilitychange", syncMouseListener);
      if (attached) {
        window.removeEventListener("mousemove", handleMouseMove);
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [hasRemoteOnline, sendUpdate]);

  if (!presenceState) return [];
  const cursors: RemoteCursor[] = [];
  for (const member of presenceState) {
    if (member.userId === userId) continue;
    if (!member.online) continue;
    const d = member.data;
    if (typeof d !== "object" || d === null) continue;
    if (!isCursorData(d)) continue;
    if (now - d.updatedAt > CURSOR_ACTIVE_MS) continue;
    cursors.push({
      userId: member.userId,
      x: d.x,
      y: d.y,
      firstName: d.firstName,
      accentColor: d.accentColor,
    });
  }
  return cursors;
}
