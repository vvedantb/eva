"use client";

import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@eva/ui";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
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
import { sidebarRowPresence } from "@/lib/components/sidebar/_utils/sidebarRowPresence";

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
  githubUrl: string;
  isActive: boolean;
  onNavigate?: () => void;
  onPrefetch: () => void;
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
  const prefetch = useOpenPrsOnGithub() ? undefined : onPrefetch;
  const intentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelIntent = () => {
    if (intentTimer.current === null) return;
    clearTimeout(intentTimer.current);
    intentTimer.current = null;
  };

  return (
    <m.div {...sidebarRowPresence}>
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
