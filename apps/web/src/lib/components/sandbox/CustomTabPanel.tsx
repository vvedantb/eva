"use client";

import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { Spinner, Button } from "@eva/ui";
import {
  IconRefresh,
  IconMaximize,
  IconExternalLink,
} from "@tabler/icons-react";
import { ensureHttps } from "@/lib/utils/ensureHttps";
import { stripPreviewGrant } from "@/lib/utils/previewGrant";
import { convexErrorMessage } from "@/lib/utils/convexErrorMessage";

type PanelState = "loading" | "running" | "error";

interface CustomTabPanelProps {
  name: string;
  port: number;
  sandboxId: string | undefined;
  isActive: boolean;
  /**
   * False while another sandbox tab is selected. Keeps the iframe mounted
   * (parent hides this panel) but pauses readiness polling.
   */
  isForeground?: boolean;
  repoId: Id<"githubRepos">;
}

const MAX_ATTEMPTS = 40;

/**
 * Renders a user-defined custom tab: a fixed sandbox port resolved through the
 * same auth proxy as the Preview tab and shown in an iframe. Unlike the Editor /
 * Desktop panels there is no start/stop gate — the service (Supabase, Convex,
 * ...) is started by the app's own dev / startup commands, so this auto-polls
 * `getPreviewUrl` until the port is reachable.
 *
 * Stays mounted while hidden so returning to the tab restores the iframe
 * without re-polling; polling only runs while the tab is foreground.
 */
export function CustomTabPanel({
  name,
  port,
  sandboxId,
  isActive,
  isForeground = true,
  repoId,
}: CustomTabPanelProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<PanelState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  // Bumped by Retry so the poll effect restarts without clearing a cached URL
  // on ordinary foreground toggles.
  const [retryNonce, setRetryNonce] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const attempts = useRef(0);
  // Bumped on every config change so an in-flight poll continuation bails
  // instead of re-arming after the sandbox stopped or the tab unmounted.
  const generation = useRef(0);
  // Written in an effect (not during render) so React Compiler can compile the
  // file; the async poll continuations that read it only run after commit.
  const foregroundRef = useRef(isForeground);
  useEffect(() => {
    foregroundRef.current = isForeground;
  }, [isForeground]);

  const getPreviewUrl = useAction(api.sandbox.getPreviewUrl);

  const stopPolling = () => {
    clearTimeout(pollTimer.current);
    pollTimer.current = undefined;
  };

  // Clear cached URL when the sandbox / port identity changes (not on tab hide).
  useEffect(() => {
    generation.current += 1;
    stopPolling();
    attempts.current = 0;
    setUrl(null);
    setError(null);
    setState("loading");
    return stopPolling;
  }, [isActive, sandboxId, port, retryNonce]);

  // Poll only while the sandbox is up and this tab is foreground; keep iframe
  // state when the user switches away.
  useEffect(() => {
    stopPolling();
    if (!isActive || !sandboxId || !isForeground) {
      return stopPolling;
    }
    // Already resolved — keep the cached iframe, do not re-poll.
    if (url !== null && state === "running") {
      return stopPolling;
    }
    if (state === "error") {
      return stopPolling;
    }

    const gen = generation.current;

    const fetchUrl = async () => {
      if (!foregroundRef.current) return;
      try {
        const data = await getPreviewUrl({
          sandboxId,
          port,
          checkReady: true,
          repoId,
        });
        if (gen !== generation.current) return;
        if (!foregroundRef.current) return;
        if (data.ready) {
          if (gen !== generation.current) return;
          setUrl(data.url);
          setState("running");
          setIframeKey((k) => k + 1);
          return;
        }
        attempts.current += 1;
        if (attempts.current >= MAX_ATTEMPTS) {
          setError(`${name} did not become reachable on port ${port}.`);
          setState("error");
          return;
        }
        pollTimer.current = setTimeout(() => {
          void fetchUrl();
        }, 3000);
      } catch (err) {
        if (gen !== generation.current) return;
        setError(convexErrorMessage(err, `Failed to load ${name}.`));
        setState("error");
      }
    };

    void fetchUrl();
    return stopPolling;
  }, [
    isActive,
    sandboxId,
    port,
    isForeground,
    url,
    state,
    name,
    repoId,
    getPreviewUrl,
    retryNonce,
  ]);

  const retry = () => {
    setRetryNonce((n) => n + 1);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  };

  if (!isActive || !sandboxId) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Wake Eva up to use {name}.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" ref={containerRef}>
      {url && state === "running" ? (
        <div className="flex items-center justify-end gap-1 px-2 py-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={`Reload ${name}`}
            onClick={() => setIframeKey((k) => k + 1)}
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
              aria-label={`Open ${name} in a new tab`}
            >
              <IconExternalLink className="w-4 h-4" />
            </a>
          </Button>
        </div>
      ) : null}
      <div className="flex-1 min-h-0 relative">
        {state === "loading" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-secondary z-10 gap-3">
            <Spinner size="lg" />
            <p className="text-sm text-muted-foreground">
              Waiting for {name} on port {port}...
            </p>
          </div>
        ) : null}
        {state === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 p-4">
            <pre className="text-sm text-destructive whitespace-pre-wrap max-w-full max-h-48 overflow-auto scroll-fade rounded-surface bg-destructive/5 p-3">
              {error}
            </pre>
            <Button size="sm" variant="secondary" onClick={retry}>
              <IconRefresh className="w-4 h-4 mr-1" />
              Retry
            </Button>
          </div>
        ) : null}
        {url && state === "running" ? (
          <iframe
            key={iframeKey}
            src={ensureHttps(url)}
            className="absolute inset-0 w-full h-full border-0"
          />
        ) : null}
      </div>
    </div>
  );
}
