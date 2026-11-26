"use client";

import { useLocalStorage } from "usehooks-ts";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";
import { repoMatchesPath } from "@/lib/components/sidebar/_utils/repoSessionPaths";

type RepoRow = FunctionReturnType<typeof api.githubRepos.list>[number];

function parseOpenById(
  value: Record<string, boolean>,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [key, open] of Object.entries(value)) {
    if (typeof open === "boolean") out[key] = open;
  }
  return out;
}

/**
 * Persisted expand/collapse map keyed by group id; unset ids return
 * `undefined`. With a fixed `defaultOpen`, only states that differ from it are
 * stored, so the map holds just the groups the user changed.
 */
export function useStoredGroupOpen(storageKey: string, defaultOpen?: boolean) {
  const [openById, setOpenById] = useLocalStorage<Record<string, boolean>>(
    storageKey,
    {},
  );

  const storedOpen = (id: string): boolean | undefined =>
    parseOpenById(openById)[id];

  const setGroupOpen = (
    id: string,
    open: boolean,
    liveIds?: ReadonlySet<string>,
  ) => {
    setOpenById((prev) => {
      const next: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(parseOpenById(prev))) {
        if (key === id) continue;
        if (liveIds === undefined || liveIds.has(key)) next[key] = value;
      }
      if (open !== defaultOpen) next[id] = open;
      return next;
    });
  };

  return { storedOpen, setGroupOpen };
}

interface SidebarAppGroupOpenOptions {
  storageKey: string;
  sectionSegment: string;
  repos: RepoRow[] | undefined;
}

/** Persisted expand/collapse for app groups in a global sidebar section. */
export function useSidebarAppGroupOpen(
  pathname: string,
  options: SidebarAppGroupOpenOptions,
) {
  const stored = useStoredGroupOpen(options.storageKey);

  const isGroupOpen = (repo: RepoRow): boolean => {
    const open = stored.storedOpen(repo._id);
    if (open !== undefined) return open;
    return (
      repoMatchesPath(repo, pathname) &&
      pathname.includes(options.sectionSegment)
    );
  };

  const setGroupOpen = (repoId: string, open: boolean) => {
    const liveIds = options.repos
      ? new Set<string>(options.repos.map((repo) => repo._id))
      : undefined;
    stored.setGroupOpen(repoId, open, liveIds);
  };

  return { isGroupOpen, setGroupOpen };
}
