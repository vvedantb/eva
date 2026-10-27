"use client";

import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@eva/ui";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  tokenTransition,
  RelativeDateTime,
} from "@vvedantb/ui";
import { m } from "motion/react";
import { IconGitPullRequest, IconPencil } from "@tabler/icons-react";
import {
  SharedLayoutNavSurface,
  sidebarNavLinkClass,
} from "@/lib/components/sidebar/SharedLayoutNav";
import {
  useOpenPrOnGithubClick,
  useOpenPrsOnGithub,
} from "@/lib/hooks/useOpenPrsOnGithub";

/** How long the pointer must rest on a row before it counts as intent. */
const HOVER_INTENT_MS = 90;

interface ReviewsSidebarRowProps {
  pr: {
    number: number;
    title: string;
    state: "open" | "closed";
    draft: boolean;
    authorLogin: string | null;
    updatedAt: string;
  };
  href: string;
  /** The PR on github.com; plain clicks go here when `openPrsOnGithub` is on. */
  githubUrl: string;
  isActive: boolean;
  onNavigate?: () => void;
  /**
   * Warms the review payloads for this PR. Called on hover intent (and
   * immediately on keyboard focus), so opening the row has nothing left to
   * fetch.
   */
  onPrefetch: () => void;
  /** Opens the sidebar's rename dialog for this pull request. */
  onRename: () => void;
}

export function ReviewsSidebarRow({
  pr,
  href,
  githubUrl,
  isActive,
  onNavigate,
  onPrefetch,
  onRename,
}: ReviewsSidebarRowProps) {
  const openPrOnGithubClick = useOpenPrOnGithubClick();
  // A plain click leaves Eva for GitHub, so warming the in-app review is waste.
  const prefetch = useOpenPrsOnGithub() ? undefined : onPrefetch;
  // Sweeping the pointer down the list should not fire a fetch per row, so the
  // warm-up waits for the pointer to settle.
  const intentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelIntent = () => {
    if (intentTimer.current === null) return;
    clearTimeout(intentTimer.current);
    intentTimer.current = null;
  };

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={tokenTransition.fast}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <SharedLayoutNavSurface
            itemId={String(pr.number)}
            isActive={isActive}
          >
            <Link
              to={href}
              onClick={(event) => {
                openPrOnGithubClick(event, githubUrl);
                onNavigate?.();
              }}
              onPointerEnter={() => {
                cancelIntent();
                if (prefetch === undefined) return;
                intentTimer.current = setTimeout(prefetch, HOVER_INTENT_MS);
              }}
              onPointerLeave={cancelIntent}
              onFocus={prefetch}
              className={cn(
                sidebarNavLinkClass(isActive),
                "flex-col items-start gap-0.5 py-2.5",
              )}
            >
              <span className="flex w-full min-w-0 items-center gap-1.5">
                <IconGitPullRequest
                  size={14}
                  className={cn(
                    "shrink-0",
                    pr.draft || pr.state !== "open"
                      ? "text-muted-foreground"
                      : "text-emerald-600 dark:text-emerald-400",
                  )}
                />
                <span className="truncate text-sm font-medium">{pr.title}</span>
              </span>
              <span className="flex w-full min-w-0 items-center gap-1.5 pl-5 text-2xs text-muted-foreground">
                <span className="shrink-0">#{pr.number}</span>
                {pr.authorLogin ? (
                  <span className="truncate">{pr.authorLogin}</span>
                ) : null}
                <span className="ml-auto shrink-0">
                  <RelativeDateTime at={new Date(pr.updatedAt).getTime()} />
                </span>
              </span>
            </Link>
          </SharedLayoutNavSurface>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={onRename}>
            <IconPencil size={16} />
            Rename
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </m.div>
  );
}
