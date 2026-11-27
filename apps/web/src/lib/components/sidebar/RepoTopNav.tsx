"use client";

import { Link } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { IconSunrise } from "@tabler/icons-react";
import { cn } from "@eva/ui";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnreadDot,
} from "@vvedantb/ui";
import { api } from "@eva/backend";
import {
  SharedLayoutNav,
  SharedLayoutNavSurface,
  sidebarNavLinkClass,
} from "@/lib/components/sidebar/SharedLayoutNav";

import type { RepoDoc } from "@/lib/components/sidebar/sidebarPanelState";

interface RepoTopNavProps {
  repoBasePath: string;
  pathname: string;
  collapsed: boolean;
  repo: RepoDoc | null | undefined;
  onNavigate: () => void;
}

type TopNavItem = {
  name: string;
  href: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  unread: boolean;
};

/**
 * Per-repo workspace shortcuts above the build-pipeline nav. These sit outside
 * the Ship/Test/More groups because they are not pipeline stages: Today is
 * what already happened. Inbox lives on the left icon rail instead, being
 * global rather than per-repo. Unsent drafts show as marks on their own rows
 * (quick tasks in To Do, a pencil on session rows, a pill on task cards).
 */
export function RepoTopNav({
  repoBasePath,
  pathname,
  collapsed,
  repo,
  onNavigate,
}: RepoTopNavProps) {
  // Today only exists while the "Daily standup" system automation is on, so
  // the entry appears with the install and disappears with the uninstall.
  // A dot marks a standup the user has not opened yet.
  const standup = useQuery(
    api.today.standupStatus,
    repo ? { repoId: repo._id } : "skip",
  );

  const items: TopNavItem[] =
    standup?.enabled === true
      ? [
          {
            name: "Today",
            href: `${repoBasePath}/today`,
            icon: IconSunrise,
            unread: standup.unreadAt !== null,
          },
        ]
      : [];
  if (items.length === 0) return null;

  return (
    <SharedLayoutNav layoutId="repo-top-nav" className="space-y-1">
      {items.map((item) => {
        const isActive = pathname.startsWith(item.href);
        const linkElement = (
          <SharedLayoutNavSurface
            key={item.name}
            itemId={item.name}
            isActive={isActive}
          >
            <Link
              to={item.href}
              onClick={onNavigate}
              className={sidebarNavLinkClass(isActive, collapsed)}
            >
              <item.icon
                size={19}
                className={cn(
                  "shrink-0",
                  isActive ? "text-sidebar-primary" : "text-muted-foreground",
                )}
              />
              {!collapsed && <span className="truncate">{item.name}</span>}
              {!collapsed && (
                <UnreadDot show={item.unread && !isActive} className="ml-auto" />
              )}
            </Link>
          </SharedLayoutNavSurface>
        );

        if (collapsed) {
          return (
            <Tooltip key={item.name}>
              <TooltipTrigger asChild>{linkElement}</TooltipTrigger>
              <TooltipContent side="right">{item.name}</TooltipContent>
            </Tooltip>
          );
        }
        return linkElement;
      })}
    </SharedLayoutNav>
  );
}
