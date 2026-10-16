"use client";

import type { MouseEvent } from "react";
import { useQuery } from "convex/react";
import { api } from "@eva/backend";

/** Convex opt-in for opening PR links on GitHub (false while flags are loading). */
export function useOpenPrsOnGithub(): boolean {
  const flags = useQuery(api.auth.getExperimentalFlags);
  return flags?.openPrsOnGithub === true;
}

/** A plain left click: no modifier, so the browser would follow the link in place. */
function isPlainLeftClick(event: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * Click handler for every link that opens Eva's in-app PR view. With the
 * flag on, a plain click opens `githubUrl` in a new tab instead. Modifier
 * clicks keep the link's own behaviour (for example, the in-app view in a new
 * tab).
 */
export function useOpenPrOnGithubClick(): (
  event: MouseEvent<HTMLAnchorElement>,
  githubUrl: string,
) => void {
  const openPrsOnGithub = useOpenPrsOnGithub();
  return (event, githubUrl) => {
    if (!openPrsOnGithub || event.defaultPrevented) return;
    if (!isPlainLeftClick(event)) return;
    event.preventDefault();
    window.open(githubUrl, "_blank", "noopener,noreferrer");
  };
}
