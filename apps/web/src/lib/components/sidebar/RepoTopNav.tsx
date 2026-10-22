"use client";

import { Link } from "@tanstack/react-router";
import type { ComponentType, ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { IconSunrise } from "@tabler/icons-react";
import { Tooltip, TooltipContent, TooltipTrigger, cn } from "@eva/ui";
import { DraftIcon } from "@vvedantb/ui";
import { api } from "@eva/backend";
import { DraftsCountBadge } from "@/lib/components/sidebar/DraftsCountBadge";
import {
  SharedLayoutNav,
  SharedLayoutNavSurface,
  sidebarNavLinkClass,
} from "@/lib/components/sidebar/SharedLayoutNav";

type RepoDoc = FunctionReturnType<typeof api.githubRepos.getByOwnerAndName>;

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
  badge?: ReactNode;
};

/**
 * Per-repo workspace shortcuts above the build-pipeline nav. These sit outside
 * the Ship/Test/More groups because they are not pipeline stages: Today is
 * what already happened, Drafts is what you have not started. Inbox lives on
 * the left icon rail instead, being global rather than per-repo.
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
  const standupEnabled = useQuery(
    api.today.isStandupEnabled,
    repo ? { repoId: repo._id } : "skip",
  );

  const items: TopNavItem[] = [
    ...(standupEnabled === true
      ? [
          {
            name: "Today",
            href: `${repoBasePath}/today`,
            icon: IconSunrise,
          } satisfies TopNavItem,
        ]
      : []),
    {
      name: "Drafts",
      href: `${repoBasePath}/drafts`,
      icon: DraftIcon,
      badge:
        !collapsed && repo ? <DraftsCountBadge repoId={repo._id} /> : undefined,
    },
  ];

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
              {item.badge}
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
