"use client";

import { Link } from "@tanstack/react-router";
import type { ComponentType } from "react";
import type { FunctionReturnType } from "convex/server";
import { IconChevronRight } from "@tabler/icons-react";
import {
  DocumentsIcon,
  ReviewsIcon,
  ProjectsIcon,
  QuickTasksIcon,
  SettingsIcon,
  StatsIcon,
  TestingArenaIcon,
} from "@/lib/components/sidebar/icons/AnimatedNavIcons";
import { type api } from "@eva/backend";
import { Button, Tooltip, TooltipContent, TooltipTrigger, cn } from "@eva/ui";
import { ActiveTasksBadge } from "@/lib/components/sidebar/ActiveTasksBadge";
import { BuildingProjectsBadge } from "@/lib/components/sidebar/BuildingProjectsBadge";
import {
  SharedLayoutNav,
  SharedLayoutNavSurface,
  sidebarNavLinkClass,
  sidebarSectionLabelClass,
} from "@/lib/components/sidebar/SharedLayoutNav";
import {
  contextSidebarModeForNav,
  type ContextSidebarMode,
} from "@/lib/components/sidebar/contextSidebarModes";
import { useSimpleView } from "@/lib/hooks/useSimpleView";

type RepoDoc = FunctionReturnType<typeof api.githubRepos.getByOwnerAndName>;

type RepoMainNavIcon = ComponentType<{
  size?: number;
  className?: string;
}>;

type RepoMainNavItem = {
  name: string;
  href: string;
  icon: RepoMainNavIcon;
  devOnly?: boolean;
};

type RepoMainNavGroup = {
  label: string;
  items: RepoMainNavItem[];
  devOnly?: boolean;
};

interface RepoNavSectionsProps {
  repoBasePath: string;
  pathname: string;
  collapsed: boolean;
  repo: RepoDoc | null | undefined;
  onOpenContextSidebar: (mode: ContextSidebarMode) => void;
  onNavigate: () => void;
}

/**
 * Per-repo build-pipeline navigation (Build/Ship/Test/More groups) for the
 * active repo. The far-left `RepoRail` handles switching between repos;
 * Inbox/Drafts: Inbox is on the left icon rail (global); Drafts stay above
 * these groups in `RepoTopNav` because they are per-repo.
 */
export function RepoNavSections({
  repoBasePath,
  pathname,
  collapsed,
  repo,
  onOpenContextSidebar,
  onNavigate,
}: RepoNavSectionsProps) {
  const isDev = import.meta.env.DEV;
  const simpleView = useSimpleView();

  const repoNavigation = (() => {
    const allGroups: RepoMainNavGroup[] = [
      {
        label: "Ship",
        items: [
          {
            name: "Projects",
            href: `${repoBasePath}/projects`,
            icon: ProjectsIcon,
          },
          {
            name: "Quick Tasks",
            href: `${repoBasePath}/quick-tasks`,
            icon: QuickTasksIcon,
          },
        ],
      },
      {
        label: "Test",
        items: [
          {
            name: "Documents",
            href: `${repoBasePath}/docs`,
            icon: DocumentsIcon,
          },
          ...(simpleView
            ? []
            : [
                {
                  name: "Reviews",
                  href: `${repoBasePath}/reviews`,
                  icon: ReviewsIcon,
                } satisfies RepoMainNavItem,
              ]),
          {
            name: "Testing Arena",
            href: `${repoBasePath}/testing-arena`,
            icon: TestingArenaIcon,
          },
        ],
      },
      {
        label: "More",
        items: [
          {
            name: "Stats",
            href: `${repoBasePath}/stats`,
            icon: StatsIcon,
          },
          // Simple view has no repo settings pages, so the entry is dropped
          // here; the rail's gear still opens global settings.
          ...(simpleView
            ? []
            : [
                {
                  name: "Settings",
                  href: `${repoBasePath}/settings/config`,
                  icon: SettingsIcon,
                } satisfies RepoMainNavItem,
              ]),
        ],
      },
    ];
    if (isDev) return allGroups;
    return allGroups.flatMap((g) => {
      if (g.devOnly) return [];
      const items = g.items.filter((i) => !i.devOnly);
      if (items.length === 0) return [];
      return [{ ...g, items }];
    });
  })();

  const navItemClass = (isActive: boolean) =>
    sidebarNavLinkClass(isActive, collapsed);

  const renderRepoNavItem = (item: RepoMainNavItem) => {
    const isActive =
      item.name === "Settings"
        ? pathname.startsWith(`${repoBasePath}/settings`)
        : pathname.startsWith(item.href);
    const contextMode = contextSidebarModeForNav(item.name);

    if (contextMode && !collapsed) {
      return (
        <SharedLayoutNavSurface
          key={item.name}
          itemId={item.name}
          isActive={isActive}
          className="group relative"
        >
          <button
            type="button"
            onClick={() => {
              onOpenContextSidebar(contextMode);
            }}
            className={cn(navItemClass(isActive), "w-full pr-9")}
          >
            <item.icon
              size={19}
              className={cn(
                "shrink-0",
                isActive ? "text-sidebar-primary" : "text-muted-foreground",
              )}
            />
            <span className="truncate">{item.name}</span>
          </button>
          <Button
            size="icon-sm"
            variant="ghost"
            // `reveal-on-hover` rather than a hand-rolled
            // `sm:opacity-0 group-hover:opacity-100`: `group-hover:` compiles with
            // `@media (hover: hover)` but `sm:opacity-0` does not, so the pair
            // leaves this permanently invisible on a landscape tablet — and this
            // is the only way into the section's context sidebar. `hit-target` and
            // `transition-opacity` predate this work, so they stay ungated.
            className="reveal-on-hover hit-target transition-opacity absolute right-2 top-1/2 z-20 h-6 w-6 -translate-y-1/2 text-muted-foreground hover:text-sidebar-foreground"
            aria-label={`Open ${item.name.toLowerCase()} sidebar`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenContextSidebar(contextMode);
            }}
            title={`Open ${item.name.toLowerCase()} sidebar`}
          >
            <IconChevronRight size={14} className="text-muted-foreground" />
          </Button>
        </SharedLayoutNavSurface>
      );
    }

    const linkElement = (
      <SharedLayoutNavSurface
        key={item.name}
        itemId={item.name}
        isActive={isActive}
      >
        <Link
          to={item.href}
          onClick={() => {
            if (contextMode) {
              onOpenContextSidebar(contextMode);
            }
            if (!contextMode) {
              onNavigate();
            }
          }}
          className={navItemClass(isActive)}
        >
          <item.icon
            size={19}
            className={cn(
              "shrink-0",
              isActive ? "text-sidebar-primary" : "text-muted-foreground",
            )}
          />
          {!collapsed && <span className="truncate">{item.name}</span>}
          {item.name === "Quick Tasks" && !collapsed && repo && (
            <ActiveTasksBadge repoId={repo._id} />
          )}
          {item.name === "Projects" && !collapsed && repo && (
            <BuildingProjectsBadge repoId={repo._id} basePath={repoBasePath} />
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
  };

  return (
    <SharedLayoutNav layoutId="repo-main-nav" className="space-y-4">
      {repoNavigation.map((group) => (
        <div key={group.label}>
          {!collapsed ? (
            <p className={sidebarSectionLabelClass}>{group.label}</p>
          ) : null}
          <div className="space-y-1">{group.items.map(renderRepoNavItem)}</div>
        </div>
      ))}
    </SharedLayoutNav>
  );
}
