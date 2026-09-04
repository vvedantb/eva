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
  sandboxId: string;
  state: SandboxFileListState;
}

// Sandboxes heartbeat frequently and the Files tab stays mounted while hidden.
// Keep one listing per sandbox so quick-open and the tree share the same data.
const fileListCache = new Map<string, CachedFileList>();

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

function cachedState(sandboxId: string | undefined): SandboxFileListState {
  if (!sandboxId) return { kind: "idle" };
  const cached = fileListCache.get(sandboxId);
  return cached ? { kind: "loaded", ...cached } : { kind: "idle" };
}

export function useSandboxFileList({
  sandboxId,
  repoId,
  isActive,
}: {
  sandboxId: string | undefined;
  repoId: Id<"githubRepos">;
  isActive: boolean;
}): SandboxFileListApi {
  const listSandboxFiles = useAction(api.sandbox.listSandboxFiles);
  const [snapshot, setSnapshot] = useState<SandboxFileListSnapshot>(() => ({
    sandboxId: sandboxId ?? "",
    state: cachedState(sandboxId),
  }));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const loadedFor = useRef("");

  const fetchList = async (id: string, refreshing: boolean): Promise<void> => {
    if (refreshing) {
      setIsRefreshing(true);
    }

    try {
      const result = await listSandboxFiles({ sandboxId: id, repoId });
      if (result.status === "not_running") {
        fileListCache.delete(id);
        setSnapshot({ sandboxId: id, state: { kind: "not_running" } });
      } else {
        const nextWithoutVersion = {
          root: result.root,
          paths: result.paths,
          truncated: result.truncated,
        };
        const next = {
          ...nextWithoutVersion,
          version: nextListVersion(fileListCache.get(id), nextWithoutVersion),
        };
        fileListCache.set(id, next);
        setSnapshot({
          sandboxId: id,
          state: { kind: "loaded", ...next },
        });
      }
    } catch (error) {
      loadedFor.current = "";
      setSnapshot({
        sandboxId: id,
        state: {
          kind: "error",
          message:
            error instanceof Error ? error.message : "Failed to list files",
        },
      });
    }
    setIsRefreshing(false);
  };

  // Listing is an imperative sandbox action rather than a live Convex query;
  // this effect synchronizes it when a sandbox starts or changes.
  useEffect(() => {
    if (!sandboxId) {
      loadedFor.current = "";
      return;
    }
    if (!isActive) {
      loadedFor.current = "";
      return;
    }
    if (loadedFor.current === sandboxId) return;
    loadedFor.current = sandboxId;

    const cached = fileListCache.get(sandboxId);
    if (cached) return;

    let cancelled = false;
    void (async () => {
      try {
        const result = await listSandboxFiles({ sandboxId, repoId });
        if (cancelled) return;
        if (result.status === "not_running") {
          fileListCache.delete(sandboxId);
          setSnapshot({
            sandboxId,
            state: { kind: "not_running" },
          });
        } else {
          const next = {
            root: result.root,
            paths: result.paths,
            truncated: result.truncated,
            version: 1,
          };
          fileListCache.set(sandboxId, next);
          setSnapshot({
            sandboxId,
            state: { kind: "loaded", ...next },
          });
        }
      } catch (error) {
        if (cancelled) return;
        loadedFor.current = "";
        setSnapshot({
          sandboxId,
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
      // A cancelled attempt must not count as loaded: StrictMode runs this
      // effect twice on mount, and the second run would otherwise skip the
      // fetch the first run just abandoned, leaving the tree on its spinner.
      loadedFor.current = "";
    };
  }, [sandboxId, isActive, repoId, listSandboxFiles]);

  let state: SandboxFileListState;
  if (!sandboxId) {
    state = { kind: "idle" };
  } else if (!isActive) {
    state = { kind: "not_running" };
  } else if (snapshot.sandboxId === sandboxId) {
    state = snapshot.state;
  } else {
    state = cachedState(sandboxId);
  }

  const refresh = () => {
    if (!sandboxId || isRefreshing || state.kind === "loading") return;
    if (state.kind === "idle" && loadedFor.current === sandboxId) return;
    void fetchList(sandboxId, true);
  };

  return { state, isRefreshing, refresh };
}
