"use client";

import { useLocalStorage } from "usehooks-ts";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";
import { repoMatchesPath } from "@/lib/components/sidebar/_utils/repoSessionPaths";

type RepoRow = FunctionReturnType<typeof api.githubRepos.list>[number];

function parseOpenByRepoId(
  value: Record<string, boolean>,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [key, open] of Object.entries(value)) {
    if (typeof open === "boolean") out[key] = open;
  }
  return out;
}

/** Persisted expand/collapse map keyed by group id; unset ids return `undefined`. */
export function useStoredGroupOpen(storageKey: string) {
  const [openById, setOpenById] = useLocalStorage<Record<string, boolean>>(
    storageKey,
    {},
  );

  const storedOpen = (id: string): boolean | undefined =>
    parseOpenByRepoId(openById)[id];

  const setGroupOpen = (id: string, open: boolean) => {
    setOpenById((prev) => ({
      ...parseOpenByRepoId(prev),
      [id]: open,
    }));
  };

  return { storedOpen, setGroupOpen };
}

interface SidebarAppGroupOpenOptions {
  /** localStorage key — one per sidebar section so they do not collide. */
  storageKey: string;
  /** URL segment that marks the section, e.g. `/sessions`. */
  sectionSegment: string;
}

/** Persisted expand/collapse for app groups in a global sidebar section. */
export function useSidebarAppGroupOpen(
  pathname: string,
  options: SidebarAppGroupOpenOptions,
) {
  const { storedOpen, setGroupOpen } = useStoredGroupOpen(options.storageKey);

  const isGroupOpen = (repo: RepoRow): boolean => {
    const stored = storedOpen(repo._id);
    if (stored !== undefined) return stored;
    // Default: collapsed unless this app owns the active URL in this section.
    return (
      repoMatchesPath(repo, pathname) &&
      pathname.includes(options.sectionSegment)
    );
  };

  return { isGroupOpen, setGroupOpen };
}
