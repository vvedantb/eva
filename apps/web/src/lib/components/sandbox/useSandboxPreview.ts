"use client";

import { useEffect, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id, SandboxOwner } from "@eva/backend";
import { useQueryState } from "nuqs";
import { previewPortParser } from "@/lib/search-params";
import { DEFAULT_PREVIEW_PORT } from "@eva/shared";
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
  fetchPreview: () => Promise<void>;
  reloadPreview: () => Promise<void>;
  effectivePort: number;
  setPort: (next: number) => Promise<void>;
}

interface UseSandboxPreviewArgs {
  owner: SandboxOwner;
  sandboxId: string | undefined;
  isActive: boolean;
  isRouteActive?: boolean;
  repoId: Id<"githubRepos">;
  devPort?: number;
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

/**
 * Drives the WebPreview pane: resolves a sandbox+port to a live URL and polls
 * until the dev server is reachable. Signed Vercel preview URLs are kept in
 * memory only because persisting them can resurrect stale iframe targets.
 */
export function useSandboxPreview({
  owner,
  sandboxId,
  isActive,
  isRouteActive = true,
  repoId,
  devPort,
}: UseSandboxPreviewArgs): SandboxPreviewApi {
  const [linkPort, setLinkPort] = useQueryState("port", previewPortParser);
  const setPreviewPort = useMutation(api.sandboxPanes.setPreviewPort);
  const effectivePort = linkPort ?? devPort ?? DEFAULT_PREVIEW_PORT;
  const configKey = `${sandboxId ?? ""}:${effectivePort}`;

  const seed = sandboxId !== undefined ? getPreviewMeta(configKey) : undefined;
  const [previewInfo, setPreviewInfo] = useState<PreviewInfo | null>(
    seed?.previewInfo ?? null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(seed?.epoch ?? 0);
  const epochRef = useRef(seed?.epoch ?? 0);

  const setPort = async (next: number) => {
    await setPreviewPort({ owner, port: next });
  };

  /* eslint-disable no-effect/no-event-handler --
     The deep link arrives with navigation, not a click: apply it once. Only
     the route-active shell applies it; cached sibling sessions share the URL
     and must not take another session's port. */
  useEffect(() => {
    if (linkPort === null || !isRouteActive) return;
    void setPreviewPort({ owner, port: linkPort })
      .catch(() => undefined)
      .then(() => setLinkPort(null));
  }, [linkPort, isRouteActive]);
  /* eslint-enable no-effect/no-event-handler */

  const getPreviewUrl = useAction(api.sandbox.getPreviewUrl);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);
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
      if (generation !== generationRef.current) return;
      if (data.ready) {
        if (generation !== generationRef.current) return;
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

  const reloadPreview = async () => {
    loadedUrlRef.current = null;
    await fetchPreview();
  };

  /* eslint-disable no-effect/no-adjust-state-on-prop-change --
     Starts and stops a polling loop against the sandbox and drops cached
     preview grants; all of that is external work, not derivable state. */
  useEffect(() => {
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
      if (sandboxId !== undefined) {
        dropPreviewGroup(sandboxId);
      }
      return stopPolling;
    }
    if (!sandboxId) {
      return stopPolling;
    }

    if (configChanged) {
      loadedUrlRef.current = null;
      setPreviewInfo(null);
    }
    void fetchPreview();
    return stopPolling;
  }, [isRouteActive, isActive, sandboxId, configKey]);
  /* eslint-enable no-effect/no-adjust-state-on-prop-change */

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
