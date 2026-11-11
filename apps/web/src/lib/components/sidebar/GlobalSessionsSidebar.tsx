"use client";

import { useQueries } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import {
  CenteredSpinner,
  tokenTransition,
  useRequestConfirm,
} from "@vvedantb/ui";
import { AnimatePresence, m } from "motion/react";
import { GlobalSessionGroup } from "@/lib/components/sidebar/_components/GlobalSessionGroup";
import { LinkedSessionGroupSection } from "@/lib/components/sidebar/_components/LinkedSessionGroupSection";
import {
  linkedSessionGroups,
  type LinkedSessionGroup,
} from "@/lib/components/sidebar/_utils/linkedSessionGroups";
import { SessionsListModeTabs } from "@/lib/components/sidebar/_components/SessionsListModeTabs";
import type { SessionListMode } from "@/lib/components/sidebar/_utils/sessionsSidebarSettings";
import {
  filterSessionsStartedBy,
  LINKED_SESSION_GROUPS_OPEN_KEY,
  sessionActivityAt,
  sortAppsForSidebar,
  SESSIONS_APP_GROUPS_OPEN_KEY,
} from "@/lib/components/sidebar/_utils/sessionsSidebarSettings";
import { useSessionsSidebarSettings } from "@/lib/components/sidebar/useSessionsSidebarSettings";
import {
  useSidebarAppGroupOpen,
  useStoredGroupOpen,
} from "@/lib/components/sidebar/useSidebarAppGroupOpen";
import { entityPathSegment } from "@/lib/numId";
import { useArchiveSession } from "@/lib/components/sidebar/useArchiveSession";
import {
  SessionDialogs,
  type SessionArchiveTarget,
  type SessionRenameTarget,
} from "@/lib/components/sidebar/SessionDialogs";

type SessionListItem = FunctionReturnType<typeof api.sessions.list>[number];
type RepoRow = FunctionReturnType<typeof api.githubRepos.list>[number];

/** One top-level sidebar section: a linked-session group or an app. */
type SidebarEntry =
  | {
      kind: "group";
      _id: string;
      _creationTime: number;
      group: LinkedSessionGroup<SessionListItem, RepoRow>;
    }
  | { kind: "repo"; _id: string; _creationTime: number; repo: RepoRow };

interface GlobalSessionsSidebarProps {
  pathname: string;
  onNavigate?: () => void;
}

const SESSION_LIST_QUERIES = {
  active: api.sessions.list,
  archived: api.sessions.listArchived,
} satisfies Record<SessionListMode, unknown>;

type SessionListQueries = Record<
  string,
  {
    query: (typeof SESSION_LIST_QUERIES)[SessionListMode];
    args: { repoId: RepoRow["_id"] };
  }
>;

const sessionListQueryCache = new Map<string, SessionListQueries>();

/**
 * One list query per repo for the mode. `useQueries` resubscribes, and sets
 * state in render, whenever its argument changes identity. A render-local memo
 * did not hold across React's render-phase retry and looped ("Too many
 * re-renders"), so the maps are cached here by their value.
 */
function sessionListQueries(
  mode: SessionListMode,
  repos: RepoRow[] | undefined,
): SessionListQueries {
  const ids = (repos ?? []).map((repo) => repo._id);
  const key = `${mode}:${ids.join(",")}`;
  const cached = sessionListQueryCache.get(key);
  if (cached) return cached;
  const queries: SessionListQueries = Object.fromEntries(
    ids.map((repoId) => [
      repoId,
      { query: SESSION_LIST_QUERIES[mode], args: { repoId } },
    ]),
  );
  sessionListQueryCache.set(key, queries);
  return queries;
}

/**
 * One app's rows out of the `useQueries` map. A failed query is reported as an
 * `Error` value; a group treats that the same as "still loading" rather than
 * rendering a half-built list.
 */
function listedSessions(
  result: SessionListItem[] | Error | undefined,
): SessionListItem[] | undefined {
  return result === undefined || result instanceof Error ? undefined : result;
}

/**
 * Cross-repo Sessions list for the rail entry point: every accessible app as a
 * collapsible group, with Active / Archived list modes.
 */
export function GlobalSessionsSidebar({
  pathname,
  onNavigate,
}: GlobalSessionsSidebarProps) {
  const { settings } = useSessionsSidebarSettings();
  // Not persisted: the list opens on Active each time.
  const [listMode, setListMode] = useState<SessionListMode>("active");
  const { request: requestConfirm } = useRequestConfirm();
  const { archive } = useArchiveSession();
  const repos = useQuery(api.githubRepos.list, {});
  const { isGroupOpen, setGroupOpen } = useSidebarAppGroupOpen(pathname, {
    storageKey: SESSIONS_APP_GROUPS_OPEN_KEY,
    sectionSegment: "/sessions",
    repos,
  });
  const linkedGroupOpen = useStoredGroupOpen(
    LINKED_SESSION_GROUPS_OPEN_KEY,
    true,
  );
  const [sessionToRename, setSessionToRename] =
    useState<SessionRenameTarget | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sessionToArchive, setSessionToArchive] =
    useState<SessionArchiveTarget | null>(null);

  // The only watch on the lists: the rows are handed to each group as a prop.
  // The list mode picks active or archived rows, so linked groups form in both.
  const sessionsByRepoId = useQueries(sessionListQueries(listMode, repos));
  const currentUserId = useQuery(api.auth.me, settings.onlyMine ? {} : "skip");
  // "Only my sessions" drops a teammate's rows before any group sees them.
  const visibleSessions = (repoId: RepoRow["_id"]) => {
    const rows = listedSessions(sessionsByRepoId[repoId]);
    return settings.onlyMine
      ? filterSessionsStartedBy(rows, currentUserId)
      : rows;
  };

  // Linked sessions (one agent spun up another) leave their repo lists for a
  // cross-repo group of their own, in both list modes.
  const linkedGroups =
    repos === undefined
      ? []
      : linkedSessionGroups(
          repos.map((repo) => ({
            repo,
            sessions: visibleSessions(repo._id) ?? [],
          })),
        );
  const linkedSessionIds = new Set<string>(
    linkedGroups.flatMap((group) =>
      group.members.map((member) => member.session._id),
    ),
  );
  const repoSessions = (repoId: RepoRow["_id"]) =>
    visibleSessions(repoId)?.filter(
      (session) => !linkedSessionIds.has(session._id),
    );

  // "Sort projects" orders groups and repos as one list. Each sorts by the
  // rows it shows, so a repo does not rise on a linked session it gave away.
  const latestActivityById = new Map<string, number>();
  for (const group of linkedGroups) {
    latestActivityById.set(group.groupId, group.latestAt);
  }
  for (const repo of repos ?? []) {
    let latest = 0;
    for (const session of repoSessions(repo._id) ?? []) {
      latest = Math.max(latest, sessionActivityAt(session));
    }
    if (latest > 0) latestActivityById.set(repo._id, latest);
  }
  // Groups go first, so "Manual" (which keeps input order) pins them on top.
  const orderedEntries: SidebarEntry[] | undefined =
    repos === undefined
      ? undefined
      : sortAppsForSidebar(
          [
            ...linkedGroups.map(
              (group): SidebarEntry => ({
                kind: "group",
                _id: group.groupId,
                _creationTime: group.createdAt,
                group,
              }),
            ),
            ...repos.map((repo): SidebarEntry => ({
              kind: "repo",
              _id: repo._id,
              _creationTime: repo._creationTime,
              repo,
            })),
          ],
          settings.appSortOrder,
          latestActivityById,
        );
  const onRenameRequest = (session: SessionListItem) => {
    setSessionToRename({ session });
    setRenameValue(session.title);
  };
  const onArchiveRequest = (session: SessionListItem, groupRepo: RepoRow) => {
    const pathSegment = entityPathSegment(session);
    if (!pathSegment) return;
    const target = { session, repo: groupRepo, pathSegment };
    requestConfirm(
      () => setSessionToArchive(target),
      () => {
        void archive(target, pathname, () => {
          setSessionToArchive(null);
          if (onNavigate) onNavigate();
        });
      },
    );
  };

  return (
    <>
      <div className="flex-1 px-0 pb-1">
        <div className="flex w-full items-center pb-2 pt-1">
          <SessionsListModeTabs mode={listMode} onChange={setListMode} />
        </div>
        <div>
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={listMode}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={tokenTransition.fast}
            >
              {orderedEntries === undefined ? (
                <CenteredSpinner
                  label="Loading sessions"
                  className="min-h-48"
                />
              ) : orderedEntries.length === 0 ? (
                <div className="px-3 py-8 text-center">
                  <p className="text-sm font-medium text-foreground">
                    No apps yet
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Connect a codebase from Home.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {orderedEntries.map((entry) =>
                    entry.kind === "group" ? (
                      <LinkedSessionGroupSection
                        key={entry._id}
                        group={entry.group}
                        // Linked groups start open; a toggle is remembered.
                        open={linkedGroupOpen.storedOpen(entry._id) ?? true}
                        onOpenChange={(open) => {
                          linkedGroupOpen.setGroupOpen(entry._id, open);
                        }}
                        pathname={pathname}
                        listMode={listMode}
                        onNavigate={onNavigate}
                        sessionSortOrder={settings.sessionSortOrder}
                        sessionPreviewCount={settings.sessionPreviewCount}
                        onRenameRequest={onRenameRequest}
                        onArchiveRequest={onArchiveRequest}
                      />
                    ) : (
                      <GlobalSessionGroup
                        key={entry._id}
                        repo={entry.repo}
                        pathname={pathname}
                        sessions={repoSessions(entry.repo._id)}
                        open={isGroupOpen(entry.repo)}
                        onOpenChange={(open) => {
                          setGroupOpen(entry.repo._id, open);
                        }}
                        onNavigate={onNavigate}
                        sessionSortOrder={settings.sessionSortOrder}
                        sessionPreviewCount={settings.sessionPreviewCount}
                        listMode={listMode}
                        onRenameRequest={onRenameRequest}
                        onArchiveRequest={onArchiveRequest}
                      />
                    ),
                  )}
                </div>
              )}
            </m.div>
          </AnimatePresence>
        </div>
      </div>

      <SessionDialogs
        pathname={pathname}
        renameTarget={sessionToRename}
        renameValue={renameValue}
        onRenameValueChange={setRenameValue}
        onCloseRename={() => setSessionToRename(null)}
        archiveTarget={sessionToArchive}
        onCloseArchive={() => setSessionToArchive(null)}
        onArchived={onNavigate}
      />
    </>
  );
}
