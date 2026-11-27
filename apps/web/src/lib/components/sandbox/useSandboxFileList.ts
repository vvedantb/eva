"use client";

import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api, type Id } from "@eva/backend";

type LoadedSandboxFileList = {
  kind: "loaded";
  root: string;
  paths: string[];
  truncated: boolean;
  version: number;
};

type SandboxFileListState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "not_running" }
  | { kind: "error"; message: string }
  | LoadedSandboxFileList;

type CachedFileList = Omit<LoadedSandboxFileList, "kind">;

export interface SandboxFileListApi {
  state: SandboxFileListState;
  isRefreshing: boolean;
  refresh: () => void;
}

interface SandboxFileListSnapshot {
  cacheKey: string;
  state: SandboxFileListState;
}

const fileListCache = new Map<string, CachedFileList>();

function fileListCacheKey(
  sandboxId: string,
  rootPath: string | undefined,
): string {
  return `${sandboxId}:${rootPath ?? ""}`;
}

function pathsEqual(first: string[], second: string[]): boolean {
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index++) {
    if (first[index] !== second[index]) return false;
  }
  return true;
}

function nextListVersion(
  previous: CachedFileList | undefined,
  next: Omit<CachedFileList, "version">,
): number {
  if (previous === undefined) return 1;
  const unchanged =
    previous.root === next.root &&
    previous.truncated === next.truncated &&
    pathsEqual(previous.paths, next.paths);
  return unchanged ? previous.version : previous.version + 1;
}

function cachedState(cacheKey: string | undefined): SandboxFileListState {
  if (!cacheKey) return { kind: "idle" };
  const cached = fileListCache.get(cacheKey);
  return cached ? { kind: "loaded", ...cached } : { kind: "idle" };
}

export function useSandboxFileList({
  sandboxId,
  repoId,
  isActive,
  rootPath,
}: {
  sandboxId: string | undefined;
  repoId: Id<"githubRepos">;
  isActive: boolean;
  rootPath?: string;
}): SandboxFileListApi {
  const listSandboxFiles = useAction(api.sandbox.listSandboxFiles);
  const cacheKey = sandboxId ? fileListCacheKey(sandboxId, rootPath) : "";
  const [snapshot, setSnapshot] = useState<SandboxFileListSnapshot>(() => ({
    cacheKey,
    state: cachedState(cacheKey),
  }));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const loadedFor = useRef("");

  const fetchList = async (key: string, refreshing: boolean): Promise<void> => {
    if (!sandboxId) return;
    if (refreshing) {
      setIsRefreshing(true);
    }

    try {
      const result = await listSandboxFiles({ sandboxId, repoId, rootPath });
      if (result.status === "not_running") {
        fileListCache.delete(key);
        setSnapshot({ cacheKey: key, state: { kind: "not_running" } });
      } else {
        const nextWithoutVersion = {
          root: result.root,
          paths: result.paths,
          truncated: result.truncated,
        };
        const next = {
          ...nextWithoutVersion,
          version: nextListVersion(fileListCache.get(key), nextWithoutVersion),
        };
        fileListCache.set(key, next);
        setSnapshot({
          cacheKey: key,
          state: { kind: "loaded", ...next },
        });
      }
    } catch (error) {
      loadedFor.current = "";
      setSnapshot({
        cacheKey: key,
        state: {
          kind: "error",
          message:
            error instanceof Error ? error.message : "Failed to list files",
        },
      });
    }
    setIsRefreshing(false);
  };

  useEffect(() => {
    if (!sandboxId) {
      loadedFor.current = "";
      return;
    }
    if (!isActive) {
      loadedFor.current = "";
      return;
    }
    const key = fileListCacheKey(sandboxId, rootPath);
    if (loadedFor.current === key) return;
    loadedFor.current = key;

    const cached = fileListCache.get(key);
    if (cached) return;

    let cancelled = false;
    void (async () => {
      try {
        const result = await listSandboxFiles({ sandboxId, repoId, rootPath });
        if (cancelled) return;
        if (result.status === "not_running") {
          fileListCache.delete(key);
          setSnapshot({
            cacheKey: key,
            state: { kind: "not_running" },
          });
        } else {
          const next = {
            root: result.root,
            paths: result.paths,
            truncated: result.truncated,
            version: 1,
          };
          fileListCache.set(key, next);
          setSnapshot({
            cacheKey: key,
            state: { kind: "loaded", ...next },
          });
        }
      } catch (error) {
        if (cancelled) return;
        loadedFor.current = "";
        setSnapshot({
          cacheKey: key,
          state: {
            kind: "error",
            message:
              error instanceof Error ? error.message : "Failed to list files",
          },
        });
      }
    })();

    return () => {
      cancelled = true;
      loadedFor.current = "";
    };
  }, [sandboxId, isActive, repoId, rootPath, listSandboxFiles]);

  let state: SandboxFileListState;
  if (!sandboxId) {
    state = { kind: "idle" };
  } else if (!isActive) {
    state = { kind: "not_running" };
  } else if (snapshot.cacheKey === cacheKey) {
    state = snapshot.state;
  } else {
    state = cachedState(cacheKey);
  }

  const refresh = () => {
    if (!sandboxId || isRefreshing || state.kind === "loading") return;
    if (state.kind === "idle" && loadedFor.current === cacheKey) return;
    void fetchList(cacheKey, true);
  };

  return { state, isRefreshing, refresh };
}
