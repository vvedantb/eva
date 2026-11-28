"use client";

import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import {
  fileCacheKey,
  type LoadedPayload,
  type ViewerState,
} from "../_utils/-fileViewerState";
import { mediaFileForPath } from "../_utils/-fileViewerMedia";

interface UseSandboxFileContentsArgs {
  sandboxId: string | undefined;
  repoId: Id<"githubRepos">;
  isActive: boolean;
  filePath: string;
}

export interface SandboxFileContentsApi {
  state: ViewerState;
  revision: number;
  refresh: () => void;
  install: (content: string) => void;
}

const fileCache = new Map<string, LoadedPayload>();

/**
 * Reads one file out of a live sandbox. A one-shot action rather than a
 * reactive query, so the result is held here and re-fetched on demand.
 */
export function useSandboxFileContents({
  sandboxId,
  repoId,
  isActive,
  filePath,
}: UseSandboxFileContentsArgs): SandboxFileContentsApi {
  const readSandboxFile = useAction(api.sandbox.readSandboxFile);
  const readSandboxMediaFile = useAction(api.sandbox.readSandboxMediaFile);
  const [refreshKey, setRefreshKey] = useState(0);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ViewerState>(() => {
    if (!filePath || !sandboxId || !isActive) return { kind: "empty" };
    return (
      fileCache.get(fileCacheKey(sandboxId, filePath)) ?? { kind: "empty" }
    );
  });
  const loadedFor = useRef<string>("");

  useEffect(() => {
    if (!filePath) {
      setState({ kind: "empty" });
      loadedFor.current = "";
      return;
    }
    if (!sandboxId || !isActive) {
      setState({ kind: "not_running" });
      loadedFor.current = "";
      return;
    }

    const key = fileCacheKey(sandboxId, filePath);
    const attempt = `${key} ${refreshKey}`;
    if (attempt === loadedFor.current) return;
    loadedFor.current = attempt;

    const cached = fileCache.get(key);
    setState(cached ?? { kind: "loading" });

    let cancelled = false;
    void (async () => {
      try {
        const media = mediaFileForPath(filePath);
        if (media) {
          const res = await readSandboxMediaFile({
            sandboxId,
            repoId,
            path: filePath,
          });
          if (cancelled) return;
          if (res.status === "ok") {
            const payload: LoadedPayload = {
              kind: "media",
              media,
              dataUrl: `data:${media.mimeType};base64,${res.base64}`,
            };
            fileCache.set(key, payload);
            setState(payload);
            setRevision((n) => n + 1);
          } else {
            fileCache.delete(key);
            if (res.status === "too_large") {
              setState({ kind: "too_large", size: res.size });
            } else {
              setState({ kind: res.status });
            }
          }
          return;
        }

        const res = await readSandboxFile({
          sandboxId,
          repoId,
          path: filePath,
        });
        if (cancelled) return;
        if (res.status === "ok") {
          const payload: LoadedPayload = {
            kind: "loaded",
            content: res.content,
            truncated: res.truncated,
          };
          fileCache.set(key, payload);
          setState(payload);
          setRevision((n) => n + 1);
        } else {
          fileCache.delete(key);
          setState({ kind: res.status });
        }
      } catch (err) {
        if (cancelled) return;
        loadedFor.current = "";
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Failed to read file",
        });
      }
    })();

    return () => {
      cancelled = true;
      loadedFor.current = "";
    };
  }, [
    filePath,
    sandboxId,
    isActive,
    repoId,
    readSandboxFile,
    readSandboxMediaFile,
    refreshKey,
  ]);

  return {
    state,
    revision,
    refresh: () => setRefreshKey((k) => k + 1),
    install: (content: string) => {
      if (!sandboxId || !filePath) return;
      const payload: LoadedPayload = {
        kind: "loaded",
        content,
        truncated: false,
      };
      fileCache.set(fileCacheKey(sandboxId, filePath), payload);
      setState(payload);
      setRevision((n) => n + 1);
    },
  };
}
