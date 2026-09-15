"use client";

import { useQueries } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { useMemo, useState } from "react";
import { Skeleton } from "@eva/ui";
import {
  sessionActivityAt,
  sortAppsForSidebar,
  sortSessionsForSidebar,
  SESSIONS_APP_GROUPS_OPEN_KEY,
} from "@/lib/components/sidebar/_utils/sessionsSidebarSettings";
import { useSessionsSidebarSettings } from "@/lib/components/sidebar/useSessionsSidebarSettings";
import { useSidebarAppGroupOpen } from "@/lib/components/sidebar/useSidebarAppGroupOpen";
import { SessionChromeTabGroup } from "@/lib/components/sidebar/session-tabs/SessionChromeTabGroup";
import {
  SessionTabsArchivedMenu,
  type ArchivedMenuGroup,
} from "@/lib/components/sidebar/session-tabs/SessionTabsArchivedMenu";
import {
  SessionTabsDialogs,
  type SessionArchiveTarget,
  type SessionRenameTarget,
} from "@/lib/components/sidebar/session-tabs/SessionTabsDialogs";
import { SessionTabsNewMenu } from "@/lib/components/sidebar/session-tabs/SessionTabsNewMenu";
import {
  SessionTabsOverflowMenu,
  type OverflowGroup,
} from "@/lib/components/sidebar/session-tabs/SessionTabsOverflowMenu";
import { partitionSessionsForChromeTabs } from "@/lib/components/sidebar/session-tabs/sessionTabsPartition";
import { entityPathSegment } from "@/lib/numId";
import { useArchiveSession } from "@/lib/components/sidebar/useArchiveSession";
import { requestConfirm, useAltHeld } from "@/lib/confirm";

type SessionListItem = FunctionReturnType<typeof api.sessions.list>[number];
type ArchivedListItem = FunctionReturnType<
  typeof api.sessions.listArchived
>[number];
type RepoRow = FunctionReturnType<typeof api.githubRepos.list>[number];

interface SessionChromeTabsBarProps {
  pathname: string;
}

/**
 * Chrome-style horizontal session tabs: repo groups of active sessions, plus
 * overflow (full active list) and Archived (archived ∪ merged/closed) menus.
 */
export function SessionChromeTabsBar({ pathname }: SessionChromeTabsBarProps) {
  const { settings } = useSessionsSidebarSettings();
  const altHeld = useAltHeld();
  const { archive } = useArchiveSession();
  const { isGroupOpen, setGroupOpen } = useSidebarAppGroupOpen(pathname, {
    storageKey: SESSIONS_APP_GROUPS_OPEN_KEY,
    sectionSegment: "/sessions",
  });
  const repos = useQuery(api.githubRepos.list, {});
  const [sessionToRename, setSessionToRename] =
    useState<SessionRenameTarget | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sessionToArchive, setSessionToArchive] =
    useState<SessionArchiveTarget | null>(null);

  const sessionListQueries = useMemo(() => {
    if (repos === undefined) return {};
    return Object.fromEntries(
      repos.map((repo) => [
        repo._id,
        {
          query: api.sessions.list,
          args: { repoId: repo._id },
        },
      ]),
    );
  }, [repos]);
  const archivedListQueries = useMemo(() => {
    if (repos === undefined) return {};
    return Object.fromEntries(
      repos.map((repo) => [
        repo._id,
        {
          query: api.sessions.listArchived,
          args: { repoId: repo._id },
        },
      ]),
    );
  }, [repos]);
  const sessionsByRepoId = useQueries(sessionListQueries);
  const archivedByRepoId = useQueries(archivedListQueries);

  const latestActivityByAppId = new Map<string, number>();
  for (const [repoId, result] of Object.entries(sessionsByRepoId)) {
    if (result === undefined || result instanceof Error) continue;
    let latest = 0;
    for (const session of result) {
      const at = sessionActivityAt(session);
      if (at > latest) latest = at;
    }
    if (latest > 0) latestActivityByAppId.set(repoId, latest);
  }

  const orderedRepos =
    repos === undefined
      ? undefined
      : sortAppsForSidebar(repos, settings.appSortOrder, latestActivityByAppId);

  const overflowGroups: OverflowGroup[] = [];
  const archivedGroups: ArchivedMenuGroup[] = [];
  if (orderedRepos) {
    for (const repo of orderedRepos) {
      const listed = sessionsByRepoId[repo._id];
      const archived = archivedByRepoId[repo._id];
      if (
        listed === undefined ||
        listed instanceof Error ||
        archived === undefined ||
        archived instanceof Error
      ) {
        continue;
      }
      const { active, archivedMenu } = partitionSessionsForChromeTabs<
        SessionListItem,
        ArchivedListItem
      >(listed, archived);
      overflowGroups.push({
        repo,
        sessions: sortSessionsForSidebar(active, settings.sessionSortOrder),
      });
      archivedGroups.push({
        repo,
        sessions: sortSessionsForSidebar(
          archivedMenu,
          settings.sessionSortOrder,
        ),
      });
    }
  }

  return (
    <>
      {/* The strip sits one tone step off the page so the selected tab, painted in
          the page's own colour, reads as part of the content below — Chrome's
          trick. z-20 keeps it above the page's top primary gradient. */}
      <div className="relative z-20 flex h-10 shrink-0 items-end bg-muted dark:bg-muted/40">
        {/* Divider between strip and content. It is drawn behind the tabs rather
            than as the strip's own border so the selected tab can cover it. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border"
        />
        {/* Chrome's strip never scrolls: tabs shrink to fit the width, and the
            chevron menu lists whatever no longer fits. */}
        <div className="flex min-w-0 flex-1 items-end gap-0.5 overflow-hidden px-1">
          {orderedRepos === undefined ? (
            <div
              className="flex items-end gap-0.5 pb-0 pl-1"
              aria-busy="true"
              aria-label="Loading session tabs"
            >
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-52 rounded-t-[0.625rem]" />
              ))}
            </div>
          ) : orderedRepos.length === 0 ? (
            <p className="flex items-center pb-3 pl-2 text-sm text-muted-foreground">
              No apps yet
            </p>
          ) : (
            orderedRepos.map((repo: RepoRow) => (
              <SessionChromeTabGroup
                key={repo._id}
                repo={repo}
                pathname={pathname}
                isOpen={isGroupOpen(repo)}
                onOpenChange={(open) => {
                  setGroupOpen(repo._id, open);
                }}
                hideWhenEmpty
                onRenameRequest={(session, groupRepo) => {
                  setSessionToRename({ session, repo: groupRepo });
                  setRenameValue(session.title);
                }}
                onArchiveRequest={(session, groupRepo) => {
                  const pathSegment = entityPathSegment(session);
                  if (!pathSegment) return;
                  const target = { session, repo: groupRepo, pathSegment };
                  requestConfirm(
                    altHeld,
                    () => setSessionToArchive(target),
                    () => {
                      void archive(target, pathname, () =>
                        setSessionToArchive(null),
                      );
                    },
                  );
                }}
              />
            ))
          )}
          {/* Chrome's new-tab button: one + after the last group, never squeezed
              out by tab pressure. A session needs an app, so it asks which. */}
          {orderedRepos && orderedRepos.length > 0 ? (
            <div className="flex h-9 shrink-0 items-center">
              <SessionTabsNewMenu repos={orderedRepos} />
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-stretch self-stretch border-l border-border">
          <SessionTabsOverflowMenu
            groups={overflowGroups}
            allRepos={orderedRepos ?? []}
            pathname={pathname}
          />
          <SessionTabsArchivedMenu
            groups={archivedGroups}
            pathname={pathname}
          />
        </div>
      </div>

      <SessionTabsDialogs
        pathname={pathname}
        renameTarget={sessionToRename}
        renameValue={renameValue}
        onRenameValueChange={setRenameValue}
        onCloseRename={() => setSessionToRename(null)}
        archiveTarget={sessionToArchive}
        onCloseArchive={() => setSessionToArchive(null)}
      />
    </>
  );
}
