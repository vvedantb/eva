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
  /** Absolute sandbox path from `?file=`; empty when nothing is open. */
  filePath: string;
}

export interface SandboxFileContentsApi {
  state: ViewerState;
  /**
   * Bumped on every successful read and install, so callers can build a
   * highlight cache key that changes exactly when the contents do.
   */
  revision: number;
  refresh: () => void;
  /** Record contents we just wrote, so no re-read is needed to show them. */
  install: (content: string) => void;
}

// Last successful read per sandbox+path. The session view re-renders every ~5s
// (agent streaming heartbeat); seeding from this cache lets a re-render or
// remount show content instantly instead of flashing the loading spinner.
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
  // The (path + refresh) tuple we last kicked a load for. Guards against the
  // ~5s heartbeat re-renders re-fetching the same file over and over: we only
  // load when the selected file actually changes or Refresh bumps refreshKey.
  const loadedFor = useRef<string>("");

  // The one effect here is unavoidable: the file to read comes from the URL,
  // and reading it is an action with no query to subscribe to.
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

    // Show cached content immediately (no spinner) while we revalidate; only
    // fall back to the spinner when this file has never been read.
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
            // if/else rather than a ternary: React Compiler bails on the whole
            // file when a conditional expression sits inside a try/catch.
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
        // Let the next change retry rather than pinning the failed attempt.
        loadedFor.current = "";
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Failed to read file",
        });
      }
    })();

    return () => {
      cancelled = true;
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
      // A saved file is never truncated: the write action refuses anything over
      // the read cap, so what we sent is the whole file.
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
