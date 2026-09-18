"use client";

import { useNavigate } from "@tanstack/react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  cn,
} from "@eva/ui";
import { IconChevronDown, IconPlus, IconX } from "@tabler/icons-react";
import { useClosedSessionTabs } from "@/lib/components/sidebar/session-tabs/useClosedSessionTabs";
import { DynamicLink } from "@/lib/components/DynamicLink";
import { RepoLogo } from "@/lib/components/RepoLogo";
import {
  repoSessionsIndexPath,
  sessionHrefForRow,
  sessionRowMatchesPath,
  type RepoPathParts,
} from "@/lib/components/sidebar/_utils/repoSessionPaths";
import { repoDisplayLabel, type RepoWithLogo } from "@/lib/utils/repoGrouping";

interface OverflowSession {
  _id: string;
  numId?: number;
  title: string;
  updatedAt?: number;
  _creationTime: number;
  /** Linked-in row: the session's primary repo owns its URL. */
  linkedFrom?: RepoPathParts;
}

export interface OverflowGroup {
  repo: RepoWithLogo;
  sessions: OverflowSession[];
}

interface SessionTabsOverflowMenuProps {
  groups: OverflowGroup[];
  /** All apps - so empty apps still get a New session entry. */
  allRepos: RepoWithLogo[];
  pathname: string;
}

/**
 * Full active-session list by app (Chrome-style overflow) + new-session links.
 *
 * This is also how a closed tab comes back: every active session is listed here
 * whether or not its tab is in the strip, and opening one from here reopens it.
 */
export function SessionTabsOverflowMenu({
  groups,
  allRepos,
  pathname,
}: SessionTabsOverflowMenuProps) {
  const navigate = useNavigate();
  const { isClosed, reopen } = useClosedSessionTabs();
  const sessionsByRepoId = new Map(
    groups.map((group) => [group.repo._id, group.sessions]),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="All sessions"
          aria-label="All sessions"
          className="flex h-full w-10 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-foreground/6 hover:text-foreground"
        >
          <IconChevronDown size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-80 w-56 overflow-y-auto"
      >
        {allRepos.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            No apps yet
          </p>
        ) : (
          allRepos.map((repo) => {
            const label = repoDisplayLabel(repo);
            const sessions = sessionsByRepoId.get(repo._id) ?? [];
            return (
              <DropdownMenuSub key={repo._id}>
                <DropdownMenuSubTrigger>
                  <RepoLogo
                    logoUrl={repo.logoUrl}
                    size={16}
                    fallback={
                      <span className="flex size-4 shrink-0 items-center justify-center rounded-sm bg-muted text-[9px] font-semibold text-muted-foreground">
                        {label.charAt(0).toUpperCase()}
                      </span>
                    }
                  />
                  <span className="truncate">{label}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-72 w-64 overflow-y-auto">
                  {sessions.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-muted-foreground">
                      No active sessions
                    </p>
                  ) : (
                    sessions.map((session) => {
                      const href = sessionHrefForRow(repo, session);
                      const isSelected = sessionRowMatchesPath(
                        repo,
                        session,
                        pathname,
                      );
                      const closed = isClosed(session._id);
                      return (
                        <DropdownMenuItem
                          key={session._id}
                          asChild
                          onSelect={() => reopen(session._id)}
                        >
                          <DynamicLink
                            to={href}
                            title={
                              closed
                                ? "Closed tab — opens it again"
                                : undefined
                            }
                            className={cn(
                              "cursor-pointer",
                              isSelected && "bg-accent",
                            )}
                          >
                            <span className="truncate">{session.title}</span>
                            {closed ? (
                              <IconX
                                size={12}
                                aria-hidden
                                className="ml-auto shrink-0 text-muted-foreground"
                              />
                            ) : null}
                          </DynamicLink>
                        </DropdownMenuItem>
                      );
                    })
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      navigate({ to: repoSessionsIndexPath(repo) });
                    }}
                  >
                    <IconPlus size={14} />
                    New session
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
