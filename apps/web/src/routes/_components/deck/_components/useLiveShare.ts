import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@eva/backend";

/**
 * "Follow the presenter" for the deck. One browser holds the secret `hostKey`
 * returned by `createSession` and is the only one allowed to move the deck;
 * everyone opening `?session=CODE` subscribes to the session row and renders
 * whatever slide the host is on.
 *
 * There is no take-control and no presence: the backend session row carries a
 * slide and a status, nothing else.
 */

/** Survives a reload, so refreshing the host window keeps the host role. */
const hostStorageKey = (code: string) => `eva:presentation-host:${code}`;

interface HostRecord {
  code: string;
  hostKey: string;
}

export type LiveShareState =
  | "none"
  | "loading"
  | "live"
  | "ended"
  | "notfound";

export interface LiveShare {
  sessionCode: string | undefined;
  /** This browser owns the session and drives every viewer. */
  isHost: boolean;
  /** This browser is pinned to the host's slide and cannot navigate. */
  isFollower: boolean;
  sessionState: LiveShareState;
  /** The slide to render: the host's for a follower, the URL's otherwise. */
  effectiveSlide: number;
  isStarting: boolean;
  onNavigate: (slide: number) => void;
  startSharing: () => Promise<void>;
  stopSharing: () => Promise<void>;
  /** Drops `?session=` without ending the session. */
  leave: () => void;
  /**
   * Call from a ref callback once the deck is mounted. Re-reads the stored host
   * key for the current code, so a reload restores the host role without ever
   * touching `localStorage` during render.
   */
  restoreHost: () => void;
}

interface UseLiveShareArgs {
  slide: number;
  sessionCode: string | undefined;
  updateSearch: (next: {
    slide?: number;
    session?: string | undefined;
  }) => void;
}

export function useLiveShare({
  slide,
  sessionCode,
  updateSearch,
}: UseLiveShareArgs): LiveShare {
  const [host, setHost] = useState<HostRecord | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const session = useQuery(
    api.presentations.getSession,
    sessionCode ? { code: sessionCode } : "skip",
  );

  const createSession = useMutation(api.presentations.createSession);
  const setSlide = useMutation(api.presentations.setSlide);
  const endSession = useMutation(api.presentations.stopSharing);

  const sessionState: LiveShareState = !sessionCode
    ? "none"
    : session === undefined
      ? "loading"
      : session === null
        ? "notfound"
        : session.status;

  // A code nobody can find is not a session at all, so the deck falls back to
  // local control rather than stranding the viewer on slide 1.
  const hosting = host !== null && host.code === sessionCode;
  const isHost = hosting && sessionState !== "notfound";
  const isFollower =
    sessionCode !== undefined && !hosting && sessionState !== "notfound";
  const effectiveSlide =
    isFollower && session !== undefined && session !== null
      ? session.slide
      : slide;

  function restoreHost() {
    if (!sessionCode) {
      if (host !== null) setHost(null);
      return;
    }
    if (host !== null && host.code === sessionCode) return;
    const stored = window.localStorage.getItem(hostStorageKey(sessionCode));
    setHost(stored === null ? null : { code: sessionCode, hostKey: stored });
  }

  function onNavigate(target: number) {
    if (isFollower) return;
    updateSearch({ slide: target });
    if (!isHost || host === null) return;
    void setSlide({
      code: host.code,
      hostKey: host.hostKey,
      slide: target,
    }).catch(() => undefined);
  }

  async function startSharing() {
    setIsStarting(true);
    try {
      const created = await createSession({ slide });
      window.localStorage.setItem(
        hostStorageKey(created.code),
        created.hostKey,
      );
      setHost({ code: created.code, hostKey: created.hostKey });
      updateSearch({ session: created.code });
    } finally {
      setIsStarting(false);
    }
  }

  async function stopSharing() {
    if (host === null) return;
    await endSession({ code: host.code, hostKey: host.hostKey }).catch(
      () => undefined,
    );
    window.localStorage.removeItem(hostStorageKey(host.code));
    setHost(null);
    updateSearch({ session: undefined });
  }

  function leave() {
    setHost(null);
    updateSearch({ session: undefined });
  }

  return {
    sessionCode,
    isHost,
    isFollower,
    sessionState,
    effectiveSlide,
    isStarting,
    onNavigate,
    startSharing,
    stopSharing,
    leave,
    restoreHost,
  };
}
