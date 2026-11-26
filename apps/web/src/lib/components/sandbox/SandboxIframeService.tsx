"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { useAction } from "convex/react";
import { useSessionStorage } from "usehooks-ts";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { Spinner, Button } from "@vvedantb/ui";
import {
  IconRefresh,
  IconMaximize,
  IconExternalLink,
  IconPlayerStop,
} from "@tabler/icons-react";
import { ensureHttps } from "@/lib/utils/ensureHttps";
import { stripPreviewGrant } from "@/lib/utils/previewGrant";
import {
  SandboxAsleepState,
  type SandboxWake,
} from "@/lib/components/sandbox/SandboxAsleepState";

export type SandboxIframeServiceState =
  | "idle"
  | "starting"
  | "running"
  | "error";

/**
 * Result shape the start callback must return. Mirrors `toggleCodeServer` —
 * desktop's toggle has no useful return so its wrapper returns `{ success: true }`.
 */
export interface StartResult {
  success: boolean;
  message?: string;
  logs?: string;
}

function startErrorMessage(
  result: { message?: string; logs?: string },
  fallback: string,
): string {
  const message = result.message ?? fallback;
  if (!result.logs) return message;
  return `${message}\n\nLogs:\n${result.logs}`;
}

interface SandboxIframeServiceProps {
  cacheNamespace: string;
  cacheKey: string;
  sandboxId: string | undefined;
  isActive: boolean;
  repoId: Id<"githubRepos">;
  port: number;
  startAction: () => Promise<StartResult>;
  stopAction: () => Promise<unknown>;
  transformUrl?: (url: string) => string;
  onReady?: (url: string) => void;
  ensureStartedBeforeReady?: boolean;
  maxAttempts: number;
  icon: ComponentType<{ className?: string }>;
  inactiveLabel: string;
  idleLabel: string;
  startLabel: string;
  startingLabel: string;
  pollFailedError: string;
  startFailedError: string;
  loadFailedError: string;
  iframeAllow?: string;
  autoStartKey?: number;
  externalHref?: string;
  wake?: SandboxWake;
}

/**
 * Generic sandbox-service iframe panel. Shared by `EditorPanel` (code-server,
 * port 8080) and `DesktopPanel` (NoVNC, port 6080) — their state machines,
 * polling, sessionStorage cache, fullscreen toggle, and header buttons are
 * identical; only the port, action, URL transform, and copy differ.
 */
export function SandboxIframeService({
  cacheNamespace,
  cacheKey,
  sandboxId,
  isActive,
  repoId,
  port,
  startAction,
  stopAction,
  transformUrl,
  onReady,
  ensureStartedBeforeReady = false,
  maxAttempts,
  icon: Icon,
  inactiveLabel,
  idleLabel,
  startLabel,
  startingLabel,
  pollFailedError,
  startFailedError,
  loadFailedError,
  iframeAllow,
  autoStartKey,
  externalHref,
  wake,
}: SandboxIframeServiceProps) {
  const [cachedUrl, setCachedUrl] = useSessionStorage<string | null>(
    `eva:${cacheNamespace}:${cacheKey}:${sandboxId ?? "no-sandbox"}`,
    null,
  );

  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<SandboxIframeServiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const attempts = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const handledAutoStartKey = useRef<number | undefined>(undefined);
  const generation = useRef(0);
  const refreshIframe = () => {
    setIframeKey((k) => k + 1);
  };

  const getPreviewUrl = useAction(api.sandbox.getPreviewUrl);

  const stopPolling = () => {
    clearTimeout(pollTimer.current);
    pollTimer.current = undefined;
  };

  const acceptReady = (rawUrl: string) => {
    const finalUrl = transformUrl ? transformUrl(rawUrl) : rawUrl;
    setUrl(finalUrl);
    setState("running");
    setCachedUrl(stripPreviewGrant(finalUrl));
    onReady?.(finalUrl);
  };

  const pollForReady = async (gen: number) => {
    if (!sandboxId || !isActive) return;
    attempts.current = 0;

    const check = async () => {
      try {
        const data = await getPreviewUrl({
          sandboxId,
          port,
          checkReady: true,
          repoId,
        });
        if (generation.current !== gen) return;
        if (data.ready) {
          acceptReady(data.url);
          return;
        }
        attempts.current += 1;
        if (attempts.current >= maxAttempts) {
          setError(pollFailedError);
          setState("error");
          return;
        }
        pollTimer.current = setTimeout(check, 3000);
      } catch (err) {
        if (generation.current !== gen) return;
        setError(err instanceof Error ? err.message : loadFailedError);
        setState("error");
      }
    };

    check();
  };

  const start = async () => {
    if (!sandboxId) return;
    generation.current += 1;
    const gen = generation.current;
    setState("starting");
    setError(null);
    setUrl(null);
    stopPolling();
    try {
      if (ensureStartedBeforeReady) {
        const result = await startAction();
        if (generation.current !== gen) return;
        if (!result.success) {
          setError(startErrorMessage(result, startFailedError));
          setState("error");
          return;
        }
        await pollForReady(gen);
        return;
      }

      const existing = await getPreviewUrl({
        sandboxId,
        port,
        checkReady: true,
        repoId,
      });
      if (generation.current !== gen) return;
      if (existing.ready) {
        acceptReady(existing.url);
        return;
      }
      const result = await startAction();
      if (generation.current !== gen) return;
      if (!result.success) {
        setError(startErrorMessage(result, startFailedError));
        setState("error");
        return;
      }
      await pollForReady(gen);
    } catch (err) {
      if (generation.current !== gen) return;
      setError(err instanceof Error ? err.message : startFailedError);
      setState("error");
    }
  };

  const stop = async () => {
    if (!sandboxId) return;
    generation.current += 1;
    stopPolling();
    setState("idle");
    setUrl(null);
    setError(null);
    setCachedUrl(null);
    try {
      await stopAction();
    } catch {
    }
  };

  /* eslint-disable no-effect/no-adjust-state-on-prop-change, no-effect/no-event-handler, no-effect/no-chain-state-updates, no-effect/no-pass-data-to-parent --
     Reads sessionStorage and kicks off a readiness poll against the sandbox;
     the sandbox can also go down without any local event. */
  useEffect(() => {
    if (isActive && sandboxId && state === "idle") {
      if (
        autoStartKey !== undefined &&
        handledAutoStartKey.current !== autoStartKey
      ) {
        handledAutoStartKey.current = autoStartKey;
        void start();
        return;
      }
      if (cachedUrl) {
        if (ensureStartedBeforeReady) {
          void start();
          return;
        }
        setUrl(cachedUrl);
        setState("running");
        onReady?.(cachedUrl);
      }
    }
    if (!isActive) {
      setCachedUrl(null);
    }
  }, [
    isActive,
    sandboxId,
    state,
    cachedUrl,
    setCachedUrl,
    onReady,
    ensureStartedBeforeReady,
    start,
    autoStartKey,
  ]);
  /* eslint-enable no-effect/no-adjust-state-on-prop-change, no-effect/no-event-handler, no-effect/no-chain-state-updates, no-effect/no-pass-data-to-parent */

  useEffect(
    () => () => {
      generation.current += 1;
      stopPolling();
      setState((current) => (current === "starting" ? "idle" : current));
    },
    [sandboxId, isActive],
  );

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    } else {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  void isFullscreen;

  if (!isActive || !sandboxId) {
    return (
      <SandboxAsleepState
        icon={Icon}
        label={inactiveLabel}
        wake={isActive ? undefined : wake}
      />
    );
  }

  if (state === "idle") {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
        <Icon className="w-12 h-12 opacity-50" />
        <p className="text-sm">{idleLabel}</p>
        <Button size="sm" variant="secondary" onClick={start}>
          {startLabel}
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" ref={containerRef}>
      {url && state === "running" && (
        <div className="flex items-center justify-end gap-1 pb-1 mb-1 px-2 py-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label="Reload"
            onClick={refreshIframe}
          >
            <IconRefresh className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label="Toggle fullscreen"
            onClick={toggleFullscreen}
          >
            <IconMaximize className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" className="size-8" asChild>
            <a
              href={externalHref ?? ensureHttps(stripPreviewGrant(url))}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open in a new tab"
            >
              <IconExternalLink className="w-4 h-4" />
            </a>
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8 text-destructive hover:bg-destructive/10"
            aria-label="Stop"
            onClick={stop}
          >
            <IconPlayerStop className="w-4 h-4" />
          </Button>
        </div>
      )}
      <div className="flex-1 min-h-0 relative">
        {state === "starting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-secondary z-10 gap-3">
            <Spinner size="lg" />
            <p className="text-sm text-muted-foreground">{startingLabel}</p>
          </div>
        )}
        {state === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 p-4">
            <pre className="text-sm text-destructive whitespace-pre-wrap max-w-full max-h-48 overflow-auto scroll-fade rounded-surface bg-destructive/5 p-3">
              {error}
            </pre>
            <Button size="sm" variant="secondary" onClick={start}>
              <IconRefresh className="w-4 h-4 mr-1" />
              Retry
            </Button>
          </div>
        )}
        {url && state === "running" && (
          <iframe
            key={iframeKey}
            src={ensureHttps(url)}
            className="absolute inset-0 w-full h-full border-0"
            allow={iframeAllow}
          />
        )}
      </div>
    </div>
  );
}
