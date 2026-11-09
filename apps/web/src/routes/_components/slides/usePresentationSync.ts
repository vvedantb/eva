import { useState, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "convex/react";
import { useLocalStorage } from "usehooks-ts";
import { z } from "zod";
import { api } from "@eva/backend";

/** Session code → host key, for every deck this browser is presenting. */
const HOST_KEYS_STORAGE = "eva:presentation-host-keys";
const hostKeysSchema = z.record(z.string(), z.string());

function parseHostKeys(raw: string): Record<string, string> {
  try {
    const parsed = hostKeysSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

interface UsePresentationSyncArgs {
  slide: number;
  sessionCode: string | undefined;
  updateSearch: (next: { slide?: number; session?: string }) => void;
}

type SessionState = "none" | "loading" | "live" | "ended" | "notfound";

export function usePresentationSync({
  slide,
  sessionCode,
  updateSearch,
}: UsePresentationSyncArgs) {
  const [hostKeys, setHostKeys] = useLocalStorage<Record<string, string>>(
    HOST_KEYS_STORAGE,
    {},
    { deserializer: parseHostKeys },
  );
  const hostKey = (sessionCode && hostKeys[sessionCode]) || null;

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

  const shareSession = async () => {
    const result = await createSessionMut({ slide });
    setHostKeys((prev) => ({ ...prev, [result.code]: result.hostKey }));
    updateSearch({ session: result.code });
  };

  // No `finally`: the React Compiler cannot compile it and skips the whole
  // file. The cleanup runs in the `catch` and again after the `try`.
  const startSharing = async () => {
    setIsStarting(true);
    try {
      await shareSession();
    } catch (error) {
      setIsStarting(false);
      throw error;
    }
    setIsStarting(false);
  };

  const stopSharing = async () => {
    if (!sessionCode || !hostKey) return;
    await stopSharingMut({ code: sessionCode, hostKey }).catch(() => undefined);
    // Avoid computed ObjectPattern keys: React Compiler bails on them (BuildHIR).
    setHostKeys((keys) => {
      const next: Record<string, string> = {};
      for (const [code, key] of Object.entries(keys)) {
        if (code !== sessionCode) next[code] = key;
      }
      return next;
    });
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
    hostKey,
    startSharing,
    stopSharing,
    backToLive,
    shareUrl,
    isStarting,
  };
}

export type PresentationSync = ReturnType<typeof usePresentationSync>;
