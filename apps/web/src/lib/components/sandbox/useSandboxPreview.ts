"use client";

import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { useQueryState } from "nuqs";
import { previewPortParser } from "@/lib/search-params";
import { stripPreviewGrant } from "@/lib/utils/previewGrant";
import {
  dropPreviewGroup,
  getPreviewMeta,
  setPreviewMeta,
} from "./previewIframeHost";

interface PreviewInfo {
  url: string;
  port: number;
}

export interface SandboxPreviewApi {
  previewInfo: PreviewInfo | null;
  isLoading: boolean;
  error: string | null;
  iframeKey: number;
  /** Revalidates the URL; keeps the loaded iframe when the target is unchanged. */
  fetchPreview: () => Promise<void>;
  /** User-initiated refresh: always remounts the iframe with a fresh URL. */
  reloadPreview: () => Promise<void>;
  effectivePort: number;
  setPort: (next: number | null) => Promise<URLSearchParams>;
}

interface UseSandboxPreviewArgs {
  sandboxId: string | undefined;
  isActive: boolean;
  /**
   * False while this session shell is cached-but-hidden. Stops clearing the
   * iframe when a sibling session's `?port=` (or effect re-subscribe) churns.
   */
  isRouteActive?: boolean;
  repoId: Id<"githubRepos">;
  devPort?: number;
  /** Fired when the user changes Preview port (sessions → Convex sticky). */
  onPortPersist?: (port: number) => void;
}

function clearLegacyPreviewUrlCache(): void {
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (key?.startsWith("eva:") && key.includes(":nav-sync-")) {
      keys.push(key);
    }
  }

  for (const key of keys) {
    sessionStorage.removeItem(key);
  }
}

/** Port the preview falls back to when the app declares no dev port. */
export const DEFAULT_PREVIEW_PORT = 3000;

/**
 * Drives the WebPreview pane: resolves a sandbox+port to a live URL and polls
 * until the dev server is reachable. Signed Vercel preview URLs are kept in
 * memory only because persisting them can resurrect stale iframe targets.
 */
export function useSandboxPreview({
  sandboxId,
  isActive,
  isRouteActive = true,
  repoId,
  devPort,
  onPortPersist,
}: UseSandboxPreviewArgs): SandboxPreviewApi {
  const [port, setPortQuery] = useQueryState("port", previewPortParser);
  const effectivePort = port ?? devPort ?? DEFAULT_PREVIEW_PORT;
  const configKey = `${sandboxId ?? ""}:${effectivePort}`;

  // Seed from the iframe-host meta cache: when this hook remounts (route
  // change, cross-app switch) while the host still holds a live iframe for
  // this sandbox+port, starting resolved skips the loading overlay AND keeps
  // iframeKey aligned with the cached iframe's epoch so it is not remounted.
  const seed = sandboxId !== undefined ? getPreviewMeta(configKey) : undefined;
  const [previewInfo, setPreviewInfo] = useState<PreviewInfo | null>(
    seed?.previewInfo ?? null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(seed?.epoch ?? 0);
  // Epoch source of truth for async continuations: a queued poll callback
  // closes over a stale iframeKey, and `stale + 1` could collide with the
  // current epoch (host would keep an iframe the user asked to reload).
  const epochRef = useRef(seed?.epoch ?? 0);

  const setPort = async (next: number | null) => {
    const params = await setPortQuery(next);
    if (next !== null) {
      onPortPersist?.(next);
    }
    return params;
  };

  const getPreviewUrl = useAction(api.sandbox.getPreviewUrl);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Poll generation. An in-flight getPreviewUrl continuation used to re-arm the
  // 3s timer AFTER the isActive-flip cleanup ran (stale closure with the old
  // isActive=true), so the poll chain kept hitting the backend forever after a
  // sandbox stop — which on Vercel resumed the stopped sandbox. Each config
  // change bumps the generation; stale continuations see the mismatch and bail.
  const generationRef = useRef(0);
  // Last URL painted into the iframe — skip iframeKey bumps when revalidation
  // returns the same signed URL (session switch keep-alive / effect re-run).
  // Seeded so a remount silently revalidates instead of remounting the iframe.
  const loadedUrlRef = useRef<string | null>(seed?.strippedTarget ?? null);
  const prevConfigKeyRef = useRef(configKey);

  useEffect(() => {
    clearLegacyPreviewUrlCache();
  }, []);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const fetchPreview = async () => {
    if (!sandboxId || !isActive) return;
    const generation = generationRef.current;
    // Revalidation with an iframe already on screen is silent — flipping
    // isLoading here would spin the nav-bar reload button on every return to a
    // cached session tab even though the preview never reloads.
    if (loadedUrlRef.current === null) {
      setIsLoading(true);
    }
    setError(null);
    stopPolling();
    try {
      const data = await getPreviewUrl({
        sandboxId,
        port: effectivePort,
        checkReady: true,
        navigationSync: true,
        repoId,
      });
      // Config changed (sandbox stopped / port switched) while the request was
      // in flight — drop the result and do NOT re-arm the poll timer.
      if (generation !== generationRef.current) return;
      if (data.ready) {
        if (generation !== generationRef.current) return;
        // getPreviewUrl mints a fresh __eva_grant on every call, so raw URLs
        // never compare equal. Compare grant-stripped targets instead: when
        // the sandbox+port URL is unchanged, the loaded iframe is already
        // authenticated via the proxy's 24h session cookie and must be kept —
        // updating previewInfo here would rebuild iframeSrc and reload the
        // app on every return to a cached session tab.
        const target = stripPreviewGrant(data.url);
        if (loadedUrlRef.current !== target) {
          loadedUrlRef.current = target;
          const nextEpoch = epochRef.current + 1;
          epochRef.current = nextEpoch;
          setPreviewInfo(data);
          setIframeKey(nextEpoch);
          setPreviewMeta(configKey, {
            previewInfo: data,
            strippedTarget: target,
            epoch: nextEpoch,
          });
        }
        setIsLoading(false);
      } else {
        // Dev server not reachable (sandbox resuming / server restarting):
        // the on-screen iframe is stale, so surface the spinner while polling.
        setIsLoading(true);
        pollingRef.current = setTimeout(() => {
          void fetchPreview();
        }, 3000);
      }
    } catch (err) {
      if (generation !== generationRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load preview");
      setIsLoading(false);
    }
  };

  // The Preview nav-bar refresh button: forget the loaded target so the fetch
  // always takes the remount path (fresh grant, new iframe). Also the recovery
  // path when the in-sandbox proxy restarted and orphaned the session cookie.
  const reloadPreview = async () => {
    loadedUrlRef.current = null;
    await fetchPreview();
  };

  useEffect(() => {
    // Cached-but-hidden session: keep the iframe, pause polling. Do not clear
    // previewInfo — returning to this session must not flash/reload.
    if (!isRouteActive) {
      stopPolling();
      return stopPolling;
    }

    const configChanged = prevConfigKeyRef.current !== configKey;
    prevConfigKeyRef.current = configKey;
    generationRef.current++;

    if (!isActive) {
      loadedUrlRef.current = null;
      setPreviewInfo(null);
      setIsLoading(false);
      // Sandbox stopped: every port's hosted iframes are dead documents.
      if (sandboxId !== undefined) {
        dropPreviewGroup(sandboxId);
      }
      return stopPolling;
    }
    if (!sandboxId) {
      return stopPolling;
    }

    // Sandbox/port identity changed → blank and reload. Same identity (e.g.
    // becoming route-active again after a sibling session) → revalidate in
    // place without wiping the cached iframe.
    if (configChanged) {
      loadedUrlRef.current = null;
      setPreviewInfo(null);
    }
    void fetchPreview();
    return stopPolling;
  }, [isRouteActive, isActive, sandboxId, configKey]);

  return {
    previewInfo,
    isLoading,
    error,
    iframeKey,
    fetchPreview,
    reloadPreview,
    effectivePort,
    setPort,
  };
}
