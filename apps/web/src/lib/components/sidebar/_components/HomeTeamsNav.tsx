"use client";

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "@eva/ui";
import { IconChevronDown, IconUsers } from "@tabler/icons-react";
import { RepoLogo } from "@/lib/components/RepoLogo";
import {
  SharedLayoutNavSurface,
  sidebarNavLinkClassCompact,
} from "@/lib/components/sidebar/SharedLayoutNav";

/**
 * Home sidebar Teams row: the index link, plus an indented collapsible list of
 * the user's teams so they can jump to one without opening the Teams page.
 */
export function HomeTeamsNav({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  const teams = useQuery(api.teams.list);
  const onTeams = pathname === "/teams" || pathname.startsWith("/teams/");
  const [open, setOpen] = useState(onTeams);
  const hasTeams = teams !== undefined && teams.length > 0;
  const indexActive = pathname === "/teams";

  const sorted = (teams ?? []).toSorted((a, b) =>
    (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name),
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-0.5">
        <SharedLayoutNavSurface
          className="min-w-0 flex-1"
          itemId="Teams"
          isActive={indexActive}
        >
          <Link
            to="/teams"
            onClick={() => {
              setOpen(true);
              onNavigate?.();
            }}
            className={sidebarNavLinkClassCompact(indexActive)}
          >
            <IconUsers size={14} />
            <span>Teams</span>
          </Link>
        </SharedLayoutNavSurface>
        {hasTeams ? (
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-label={open ? "Hide teams" : "Show teams"}
              className="flex size-7 max-sm:size-10 shrink-0 items-center justify-center rounded-menu-item text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <IconChevronDown
                size={14}
                className={cn(
                  "transition-transform duration-[var(--motion-base)]",
                  !open && "-rotate-90",
                )}
              />
            </button>
          </CollapsibleTrigger>
        ) : null}
      </div>
      {hasTeams ? (
        <CollapsibleContent>
          <div className="pb-0.5">
            {sorted.map((team) => {
              const href = `/teams/${team._id}`;
              const isActive =
                pathname === href || pathname.startsWith(`${href}/`);
              const label = team.displayName ?? team.name;
              return (
                <SharedLayoutNavSurface
                  key={team._id}
                  itemId={team._id}
                  isActive={isActive}
                >
                  <Link
                    to="/teams/$teamId"
                    params={{ teamId: team._id }}
                    onClick={onNavigate}
                    className={cn(
                      sidebarNavLinkClassCompact(isActive),
                      "pl-10",
                    )}
                  >
                    <RepoLogo
                      logoUrl={team.logoUrl}
                      size={14}
                      fallback={
                        <span className="flex size-3.5 items-center justify-center rounded-sm bg-muted text-[8px] font-semibold text-muted-foreground">
                          {label.charAt(0).toUpperCase()}
                        </span>
                      }
                    />
                    <span className="truncate">{label}</span>
                  </Link>
                </SharedLayoutNavSurface>
              );
            })}
          </div>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}
