"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@eva/ui";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { DynamicLink } from "@/lib/components/DynamicLink";
import { RepoLogo } from "@/lib/components/RepoLogo";
import { useRepo } from "@/lib/contexts/RepoContext";
import { sessionHrefForRow } from "@/lib/components/sidebar/_utils/repoSessionPaths";
import { sortSessionsForSidebar } from "@/lib/components/sidebar/_utils/sessionsSidebarSettings";
import { entityPathSegment } from "@/lib/numId";
import { repoDisplayLabel } from "@/lib/utils/repoGrouping";
import { repoTileColor } from "@/lib/utils/repoTileColor";
import { isSessionSidebarActive } from "../_utils/sessionReadOnly";

interface SessionSwitcherProps {
  sessionId: Id<"sessions">;
  title: string;
}

export function SessionSwitcher({ sessionId, title }: SessionSwitcherProps) {
  const { repo } = useRepo();
  const logoUrl = useQuery(api.githubRepos.getLogoUrl, { repoId: repo._id });
  const sessions = useQuery(api.sessions.list, { repoId: repo._id });
  const appName = repoDisplayLabel(repo);
  const activeSessions = sortSessionsForSidebar(
    (sessions ?? []).filter(
      (session) =>
        isSessionSidebarActive(session) && entityPathSegment(session) !== null,
    ),
    "updated_at",
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={`${appName} / ${title}`}
          aria-label="Switch session"
          className="motion-press flex min-w-0 max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm font-semibold hover:bg-muted active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <RepoLogo
            logoUrl={logoUrl}
            size={16}
            className="border-0"
            fallback={
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded text-[9px] font-semibold text-white",
                  repoTileColor(`${repo.owner}/${repo.name}/${appName}`),
                )}
              >
                {appName.charAt(0).toUpperCase()}
              </span>
            }
          />
          <span className="shrink-0 text-muted-foreground">{appName}</span>
          <span className="shrink-0 font-normal text-muted-foreground/50">
            /
          </span>
          <span className="min-w-0 truncate">{title}</span>
          <IconChevronDown
            size={14}
            className="shrink-0 text-muted-foreground"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 min-w-56">
        {activeSessions.length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            No active sessions
          </div>
        ) : (
          activeSessions.map((session) => {
            const segment = entityPathSegment(session);
            if (segment === null) return null;
            const active = session._id === sessionId;

            return (
              <DropdownMenuItem key={session._id} asChild>
                <DynamicLink
                  to={sessionHrefForRow(repo, session)}
                  className="flex items-center gap-2"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {session.title}
                  </span>
                  {active ? (
                    <IconCheck
                      size={14}
                      className="ml-auto shrink-0 text-primary"
                    />
                  ) : null}
                </DynamicLink>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
