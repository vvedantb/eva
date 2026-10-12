"use client";

import { Link } from "@tanstack/react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from "@eva/ui";
import { IconPlus } from "@tabler/icons-react";
import { RepoLogo } from "@/lib/components/RepoLogo";
import { repoSessionsIndexPath } from "@/lib/components/sidebar/_utils/repoSessionPaths";
import { repoDisplayLabel, type RepoWithLogo } from "@/lib/utils/repoGrouping";
import { repoTileColor } from "@/lib/utils/repoTileColor";

interface SessionTabsNewMenuProps {
  /** Apps in strip order, so the menu reads in the same order as the tabs. */
  repos: RepoWithLogo[];
}

/**
 * Chrome's new-tab button: one + at the end of the strip rather than one per
 * group. A session belongs to an app, so the button asks which app first — the
 * same list the landing composer's app switcher offers, landing on that app's
 * new-session composer.
 */
export function SessionTabsNewMenu({ repos }: SessionTabsNewMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="New session"
          title="New session"
          className="flex size-7 max-sm:size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <IconPlus size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-80 w-64 overflow-y-auto"
      >
        {repos.map((repo) => {
          const displayName = repoDisplayLabel(repo);
          const tile = repoTileColor(
            `${repo.owner}/${repo.name}/${displayName}`,
          );

          return (
            <DropdownMenuItem key={repo._id} asChild>
              <Link
                to={repoSessionsIndexPath(repo)}
                className="flex items-center gap-2"
              >
                <RepoLogo
                  logoUrl={repo.logoUrl}
                  size={20}
                  fallback={
                    <span
                      className={cn(
                        "flex size-5 items-center justify-center rounded text-3xs font-semibold",
                        tile.bg,
                        tile.text,
                      )}
                    >
                      {displayName.charAt(0).toUpperCase()}
                    </span>
                  }
                />
                <span className="truncate">{displayName}</span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
