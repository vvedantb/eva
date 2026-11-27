"use client";

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { cn } from "@eva/ui";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Spinner,
  CountPop,
  countLabel,
} from "@vvedantb/ui";
import { AnimatePresence, m } from "motion/react";
import { IconChevronDown, IconPlus } from "@tabler/icons-react";
import { RepoLogo } from "@/lib/components/RepoLogo";
import { SessionListShowMore } from "@/lib/components/sidebar/_components/SessionListShowMore";
import {
  SharedLayoutNav,
  SharedLayoutNavSurface,
  sidebarNavLinkClass,
} from "@/lib/components/sidebar/SharedLayoutNav";
import { SidebarListHoverCard } from "@/lib/components/sidebar/SidebarListHoverCard";
import { sidebarTextPreview } from "@/lib/components/sidebar/sidebarTextPreview";
import { repoBasePaths } from "@/lib/components/sidebar/_utils/repoSessionPaths";
import { automationMatchesPath } from "@/lib/components/sidebar/_utils/repoAutomationPaths";
import { previewSessions } from "@/lib/components/sidebar/_utils/sessionListPreview";
import { sortSessionsForSidebar } from "@/lib/components/sidebar/_utils/sessionsSidebarSettings";
import type { AutomationSortOrder } from "@/lib/components/sidebar/_utils/automationsSidebarSettings";
import { entityPathSegment } from "@/lib/numId";
import { repoDisplayLabel, type RepoWithLogo } from "@/lib/utils/repoGrouping";
import { sidebarRowPresence } from "@/lib/components/sidebar/_utils/sidebarRowPresence";

type AutomationListItem = FunctionReturnType<
  typeof api.automations.list
>[number];

interface GlobalAutomationGroupProps {
  repo: RepoWithLogo;
  /** Deduped to this app by the parent panel. */
  automations: AutomationListItem[];
  isLoading: boolean;
  pathname: string;
  automationSortOrder: AutomationSortOrder;
  automationPreviewCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: () => void;
}

/**
 * One collapsible app group in the global Automations sidebar: logo + title,
 * `+` → that app's Automations Hub (install or create), then that app's automations (capped with
 * Show more). Each row's dot shows whether the automation is enabled.
 */
export function GlobalAutomationGroup({
  repo,
  automations,
  isLoading,
  pathname,
  automationSortOrder,
  automationPreviewCount,
  open,
  onOpenChange,
  onNavigate,
}: GlobalAutomationGroupProps) {
  const [isListExpanded, setIsListExpanded] = useState(false);
  const label = repoDisplayLabel(repo);
  const baseUrl = `${repoBasePaths(repo)[0]}/automations`;

  const sorted = sortSessionsForSidebar(automations, automationSortOrder);
  const selectedId =
    sorted.find((automation) =>
      automationMatchesPath(repo, entityPathSegment(automation), pathname),
    )?._id ?? null;
  const {
    visible: visibleAutomations,
    hasOverflow,
    hiddenCount,
  } = previewSessions(sorted, {
    expanded: isListExpanded,
    selectedId,
    limit: automationPreviewCount,
  });
  const hasNoResults = !isLoading && sorted.length === 0;

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className="flex items-center gap-0.5">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-menu-item px-4 py-1.5 text-left transition-colors hover:bg-sidebar-accent/50"
          >
            <RepoLogo
              logoUrl={repo.logoUrl}
              size={18}
              fallback={
                <span className="flex size-[18px] items-center justify-center rounded-sm bg-muted text-3xs font-semibold text-muted-foreground">
                  {label.charAt(0).toUpperCase()}
                </span>
              }
            />
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-xs font-medium text-muted-foreground">
                {label}
              </span>
              <CountPop
                label={countLabel(sorted.length)}
                className="shrink-0 px-1.5 py-0 text-2xs font-medium tabular-nums text-muted-foreground"
              />
              <IconChevronDown
                size={14}
                className={cn(
                  "shrink-0 text-muted-foreground transition-transform duration-[var(--motion-base)]",
                  !open && "-rotate-90",
                )}
              />
            </span>
          </button>
        </CollapsibleTrigger>
        <Link
          to={baseUrl}
          aria-label={`Add an automation in ${label}`}
          title={`Add an automation in ${label}`}
          className="flex size-7 max-sm:size-10 shrink-0 items-center justify-center rounded-menu-item text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          onClick={onNavigate}
        >
          <IconPlus size={14} />
        </Link>
      </div>
      <CollapsibleContent>
        <div className="pb-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-3">
              <Spinner size="sm" />
            </div>
          ) : hasNoResults ? (
            <div className="px-3 py-3 text-center">
              <p className="text-xs font-medium text-foreground">
                No automations yet
              </p>
              <p className="mt-0.5 text-2xs text-muted-foreground">
                Press + to add one.
              </p>
            </div>
          ) : (
            <SharedLayoutNav
              layoutId={`global-automations-${repo._id}`}
              className="space-y-1"
            >
              <AnimatePresence initial={false}>
                {visibleAutomations.map((automation) => {
                  const segment = entityPathSegment(automation);
                  if (!segment) return null;
                  const isSelected = automationMatchesPath(
                    repo,
                    segment,
                    pathname,
                  );
                  // Plain `string`, not a template-literal type: `<Link to>` is a
                  // union of known route paths and rejects the narrowed form.
                  const href: string = `${baseUrl}/${segment}`;
                  return (
                    <m.div
                      key={automation._id}
                      {...sidebarRowPresence}
                    >
                      <SharedLayoutNavSurface
                        itemId={automation._id}
                        isActive={isSelected}
                        className="group"
                      >
                        <SidebarListHoverCard
                          title={automation.title}
                          preview={sidebarTextPreview(automation.description)}
                          createdAt={automation.createdAt}
                          userId={automation.createdBy}
                        >
                          <Link
                            to={href}
                            onClick={onNavigate}
                            className={sidebarNavLinkClass(isSelected)}
                          >
                            <span
                              className={cn(
                                "h-2 w-2 shrink-0 rounded-full",
                                automation.enabled
                                  ? "bg-success"
                                  : "bg-muted-foreground/30",
                              )}
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {automation.title}
                            </span>
                            {automation.systemKey !== undefined && (
                              <span className="shrink-0 rounded-full bg-muted px-1.5 text-3xs text-muted-foreground">
                                System
                              </span>
                            )}
                          </Link>
                        </SidebarListHoverCard>
                      </SharedLayoutNavSurface>
                    </m.div>
                  );
                })}
              </AnimatePresence>
              {hasOverflow ? (
                <SessionListShowMore
                  expanded={isListExpanded}
                  hiddenCount={hiddenCount}
                  onToggle={() => setIsListExpanded((prev) => !prev)}
                />
              ) : null}
            </SharedLayoutNav>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
