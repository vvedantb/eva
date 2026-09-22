import { useState, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@eva/backend";

const PARTICIPANT_KEY_STORAGE = "eva:presentation-participant-key";
const hostKeyStorage = (code: string) => `eva:presentation-host:${code}`;

function readParticipantKey(): string {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(PARTICIPANT_KEY_STORAGE);
  if (existing) return existing;
  const key = crypto.randomUUID();
  window.localStorage.setItem(PARTICIPANT_KEY_STORAGE, key);
  return key;
}

interface UsePresentationSyncArgs {
  slide: number;
  sessionCode: string | undefined;
  updateSearch: (next: { slide?: number; session?: string }) => void;
}

export type SessionState =
  | "none"
  | "loading"
  | "live"
  | "ended"
  | "notfound";

export function usePresentationSync({
  slide,
  sessionCode,
  updateSearch,
}: UsePresentationSyncArgs) {
  const [participantKey] = useState(readParticipantKey);

  const [hostKey, setHostKey] = useState<string | null>(() =>
    typeof window !== "undefined" && sessionCode
      ? window.localStorage.getItem(hostKeyStorage(sessionCode))
      : null,
  );

  useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined" || !sessionCode) {
        setHostKey(null);
        return () => {};
      }
      setHostKey(window.localStorage.getItem(hostKeyStorage(sessionCode)));
      return () => {};
    },
    () => sessionCode ?? "",
    () => sessionCode ?? "",
  );

  const isHost = hostKey !== null;

  const [mode, setMode] = useState<"following" | "private">("following");

  useSyncExternalStore(
    () => {
      setMode("following");
      return () => {};
    },
    () => sessionCode ?? "",
    () => sessionCode ?? "",
  );

  const session = useQuery(
    api.presentations.getSession,
    sessionCode && !isHost ? { code: sessionCode } : "skip",
  );

  const createSessionMut = useMutation(api.presentations.createSession);
  const setSlideMut = useMutation(api.presentations.setSlide);
  const stopSharingMut = useMutation(api.presentations.stopSharing);

  const [isStarting, setIsStarting] = useState(false);

  const sessionState: SessionState = !sessionCode
    ? "none"
    : isHost
      ? "live"
      : session === undefined
        ? "loading"
        : session === null
          ? "notfound"
          : session.status;

  const isFollowing =
    !isHost && mode === "following" && sessionState === "live";
  const effectiveSlide =
    isFollowing && session && session.status === "live" ? session.slide : slide;

  const onNavigate = (target: number) => {
    if (isHost && hostKey && sessionCode) {
      updateSearch({ slide: target });
      void setSlideMut({ code: sessionCode, hostKey, slide: target }).catch(
        () => undefined,
      );
      return;
    }
    if (sessionCode && mode === "following") {
      setMode("private");
    }
    updateSearch({ slide: target });
  };

  const startSharing = async () => {
    setIsStarting(true);
    try {
      const result = await createSessionMut({ slide });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          hostKeyStorage(result.code),
          result.hostKey,
        );
      }
      setHostKey(result.hostKey);
      updateSearch({ session: result.code });
    } finally {
      setIsStarting(false);
    }
  };

  const stopSharing = async () => {
    if (!sessionCode || !hostKey) return;
    await stopSharingMut({ code: sessionCode, hostKey }).catch(() => undefined);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(hostKeyStorage(sessionCode));
    }
    setHostKey(null);
    updateSearch({ session: undefined });
  };

  const backToLive = () => {
    setMode("following");
  };

  const shareUrl =
    sessionCode && typeof window !== "undefined"
      ? `${window.location.origin}/slides?session=${sessionCode}`
      : null;

  return {
    isHost,
    mode,
    sessionState,
    effectiveSlide,
    onNavigate,
    participantKey,
    hostKey,
    startSharing,
    stopSharing,
    backToLive,
    shareUrl,
    isStarting,
  };
}

export type PresentationSync = ReturnType<typeof usePresentationSync>;
