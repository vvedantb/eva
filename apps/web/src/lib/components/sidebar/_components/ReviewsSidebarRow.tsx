"use client";

import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import {
  cn,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  motionFast,
} from "@eva/ui";
import { m } from "motion/react";
import { IconGitPullRequest, IconPencil } from "@tabler/icons-react";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import {
  SharedLayoutNavSurface,
  sidebarNavLinkClass,
} from "@/lib/components/sidebar/SharedLayoutNav";

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
  isActive,
  onNavigate,
  onPrefetch,
  onRename,
}: ReviewsSidebarRowProps) {
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
      transition={motionFast}
    >
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <SharedLayoutNavSurface itemId={String(pr.number)} isActive={isActive}>
          <Link
            to={href}
            onClick={() => onNavigate?.()}
            onPointerEnter={() => {
              cancelIntent();
              intentTimer.current = setTimeout(onPrefetch, HOVER_INTENT_MS);
            }}
            onPointerLeave={cancelIntent}
            onFocus={onPrefetch}
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
            <span className="flex w-full min-w-0 items-center gap-1.5 pl-5 text-[11px] text-muted-foreground">
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
