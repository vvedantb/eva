import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useLocalStorage } from "usehooks-ts";
import { z } from "zod";
import { api } from "@eva/backend";

const HOST_KEYS_STORAGE = "eva:deck-host-keys";
const hostKeysSchema = z.record(z.string(), z.string());

function parseHostKeys(raw: string): Record<string, string> {
  try {
    const parsed = hostKeysSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export type LiveShareState = "none" | "loading" | "live" | "ended" | "notfound";

export interface LiveShare {
  sessionCode: string | undefined;
  isHost: boolean;
  isFollower: boolean;
  sessionState: LiveShareState;
  effectiveSlide: number;
  isStarting: boolean;
  onNavigate: (slide: number) => void;
  startSharing: () => Promise<void>;
  stopSharing: () => Promise<void>;
  leave: () => void;
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
  const [hostKeys, setHostKeys] = useLocalStorage<Record<string, string>>(
    HOST_KEYS_STORAGE,
    {},
    { deserializer: parseHostKeys },
  );
  const hostKey = sessionCode ? hostKeys[sessionCode] : undefined;
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

  const hosting = hostKey !== undefined;
  const isHost = hosting && sessionState !== "notfound";
  const isFollower =
    sessionCode !== undefined && !hosting && sessionState !== "notfound";
  const effectiveSlide =
    isFollower && session !== undefined && session !== null
      ? session.slide
      : slide;

  function onNavigate(target: number) {
    if (isFollower) return;
    updateSearch({ slide: target });
    if (!isHost || !sessionCode || hostKey === undefined) return;
    void setSlide({
      code: sessionCode,
      hostKey,
      slide: target,
    }).catch(() => undefined);
  }

  async function startSharing() {
    setIsStarting(true);
    try {
      const created = await createSession({ slide });
      setHostKeys((keys) => ({ ...keys, [created.code]: created.hostKey }));
      updateSearch({ session: created.code });
    } catch (error) {
      setIsStarting(false);
      throw error;
    }
    setIsStarting(false);
  }

  async function stopSharing() {
    if (!sessionCode || hostKey === undefined) return;
    const code = sessionCode;
    await endSession({ code, hostKey }).catch(() => undefined);
    setHostKeys((keys) =>
      Object.fromEntries(Object.entries(keys).filter(([key]) => key !== code)),
    );
    updateSearch({ session: undefined });
  }

  function leave() {
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
  };
}
