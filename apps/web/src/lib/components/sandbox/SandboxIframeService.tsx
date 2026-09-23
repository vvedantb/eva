"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { useAction } from "convex/react";
import { useSessionStorage } from "usehooks-ts";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { Spinner, Button } from "@eva/ui";
import {
  IconRefresh,
  IconMaximize,
  IconExternalLink,
  IconPlayerStop,
} from "@tabler/icons-react";
import { ensureHttps } from "@/lib/utils/ensureHttps";
import { stripPreviewGrant } from "@/lib/utils/previewGrant";

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

/**
 * Formats a failed start into a user-facing message, appending sandbox logs
 * when the action returned any. A helper rather than an inline ternary because
 * React Compiler bails on a whole file when a conditional or nullish-coalescing
 * expression sits inside a try/catch, and this runs after the start await.
 */
function startErrorMessage(
  result: { message?: string; logs?: string },
  fallback: string,
): string {
  const message = result.message ?? fallback;
  if (!result.logs) return message;
  return `${message}\n\nLogs:\n${result.logs}`;
}

interface SandboxIframeServiceProps {
  /** sessionStorage namespace for caching the resolved iframe URL. */
  cacheNamespace: string;
  cacheKey: string;
  sandboxId: string | undefined;
  isActive: boolean;
  repoId: Id<"githubRepos">;
  port: number;
  /** Caller-bound Convex action to start the service. */
  startAction: () => Promise<StartResult>;
  /** Caller-bound Convex action to stop the service. */
  stopAction: () => Promise<unknown>;
  /** Optional URL transform applied after preview URL resolves. */
  transformUrl?: (url: string) => string;
  /** Optional side-effect when the service becomes ready (e.g. launch chrome). */
  onReady?: (url: string) => void;
  /** Run startAction before accepting an already-ready port. */
  ensureStartedBeforeReady?: boolean;
  /** Maximum poll attempts before declaring failure. */
  maxAttempts: number;
  /** Tabler icon shown in the inactive / idle empty states. */
  icon: ComponentType<{ className?: string }>;
  /** Shown when the sandbox itself isn't running. */
  inactiveLabel: string;
  /** Shown when the service is idle (sandbox up, service stopped). */
  idleLabel: string;
  /** Label for the start button. */
  startLabel: string;
  /** Label shown beside the spinner during startup. */
  startingLabel: string;
  /** Error prefix used when polling exhausts max attempts. */
  pollFailedError: string;
  /** Generic error fallback when the start action throws. */
  startFailedError: string;
  /** Generic error fallback when polling throws. */
  loadFailedError: string;
  /** Optional `allow` attribute on the iframe (e.g. clipboard). */
  iframeAllow?: string;
  /**
   * When set, skips the idle Start button and starts automatically — once per
   * distinct key. Callers pass the timestamp of whatever proved the service is
   * already up (e.g. the agent's browsing lock), so a manual Stop sticks until
   * the next signal instead of instantly restarting.
   */
  autoStartKey?: number;
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
}: SandboxIframeServiceProps) {
  // Scope the cache key by sandboxId — Vercel signed URLs embed the sandbox
  // ID in the domain, so a URL cached against a destroyed sandbox would
  // 400 with "Sandbox not found" once the sandbox is recreated for the same
  // session/task. useSessionStorage re-reads automatically when the key
  // changes (e.g. on sandbox swap).
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
    // Cache the grant-free URL; the iframe still loads `finalUrl` (with grant)
    // for its first paint, which sets the proxy session cookie.
    setCachedUrl(stripPreviewGrant(finalUrl));
    onReady?.(finalUrl);
  };

  const pollForReady = async () => {
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
        setError(err instanceof Error ? err.message : loadFailedError);
        setState("error");
      }
    };

    check();
  };

  const start = async () => {
    if (!sandboxId) return;
    setState("starting");
    setError(null);
    setUrl(null);
    stopPolling();
    try {
      if (ensureStartedBeforeReady) {
        const result = await startAction();
        if (!result.success) {
          setError(startErrorMessage(result, startFailedError));
          setState("error");
          return;
        }
        await pollForReady();
        return;
      }

      const existing = await getPreviewUrl({
        sandboxId,
        port,
        checkReady: true,
        repoId,
      });
      if (existing.ready) {
        acceptReady(existing.url);
        return;
      }
      const result = await startAction();
      if (!result.success) {
        setError(startErrorMessage(result, startFailedError));
        setState("error");
        return;
      }
      await pollForReady();
    } catch (err) {
      setError(err instanceof Error ? err.message : startFailedError);
      setState("error");
    }
  };

  const stop = async () => {
    if (!sandboxId) return;
    stopPolling();
    setState("idle");
    setUrl(null);
    setError(null);
    setCachedUrl(null);
    try {
      await stopAction();
    } catch {
      // best-effort stop
    }
  };

  // Hydrate from sessionStorage cache when the sandbox is up; clear on stop.
  // Desktop (ensureStartedBeforeReady) must NOT paint a cached URL immediately —
  // a stale noVNC URL loads the HTML chrome while the RFB WebSocket is dead
  // (zombie websockify), which looks like a permanent "Loading" bar. Re-run
  // start + readiness poll instead.
  useEffect(() => {
    if (isActive && sandboxId && state === "idle") {
      if (
        autoStartKey !== undefined &&
        handledAutoStartKey.current !== autoStartKey
      ) {
        // Mark before starting so a later Stop (state → idle) is not undone by
        // this effect re-running against the same key.
        handledAutoStartKey.current = autoStartKey;
        void start();
        return stopPolling;
      }
      if (cachedUrl) {
        if (ensureStartedBeforeReady) {
          void start();
          return stopPolling;
        }
        setUrl(cachedUrl);
        setState("running");
        onReady?.(cachedUrl);
      }
    }
    if (!isActive) {
      setCachedUrl(null);
    }
    return stopPolling;
  }, [
    isActive,
    sandboxId,
    state,
    stopPolling,
    cachedUrl,
    setCachedUrl,
    onReady,
    ensureStartedBeforeReady,
    start,
    autoStartKey,
  ]);

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

  // `isFullscreen` is owned here for the API symmetry with the original
  // panels; we don't currently render anything different based on it, but it
  // could drive an icon swap in the future. Reading it keeps lint happy.
  void isFullscreen;

  if (!isActive || !sandboxId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
        <Icon className="w-12 h-12 opacity-50" />
        <p className="text-sm">{inactiveLabel}</p>
      </div>
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
              href={stripPreviewGrant(url)}
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
