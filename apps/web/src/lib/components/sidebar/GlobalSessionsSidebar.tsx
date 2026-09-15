"use client";

import { useMutation, useQueries } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { useMemo, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Skeleton,
  motionFast,
} from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { GlobalSessionGroup } from "@/lib/components/sidebar/_components/GlobalSessionGroup";
import { SessionsListModeTabs } from "@/lib/components/sidebar/_components/SessionsListModeTabs";
import {
  sessionActivityAt,
  sortAppsForSidebar,
  SESSIONS_APP_GROUPS_OPEN_KEY,
} from "@/lib/components/sidebar/_utils/sessionsSidebarSettings";
import { useSessionsSidebarSettings } from "@/lib/components/sidebar/useSessionsSidebarSettings";
import { useSidebarAppGroupOpen } from "@/lib/components/sidebar/useSidebarAppGroupOpen";
import { entityPathSegment } from "@/lib/numId";
import {
  mutationError,
  mutationSuccess,
} from "@/lib/utils/mutationToast";
import { useArchiveSession } from "@/lib/components/sidebar/useArchiveSession";
import { requestConfirm, useAltHeld } from "@/lib/confirm";

type SessionListItem = FunctionReturnType<typeof api.sessions.list>[number];
type RepoRow = FunctionReturnType<typeof api.githubRepos.list>[number];

interface GlobalSessionsSidebarProps {
  pathname: string;
  onNavigate?: () => void;
}

/**
 * Cross-repo Sessions list for the rail entry point: every accessible app as a
 * collapsible group, with Active / Archived list modes.
 */
export function GlobalSessionsSidebar({
  pathname,
  onNavigate,
}: GlobalSessionsSidebarProps) {
  const { settings, setListMode } = useSessionsSidebarSettings();
  const altHeld = useAltHeld();
  const { archive, isArchiving } = useArchiveSession();
  const { isGroupOpen, setGroupOpen } = useSidebarAppGroupOpen(pathname, {
    storageKey: SESSIONS_APP_GROUPS_OPEN_KEY,
    sectionSegment: "/sessions",
  });
  const repos = useQuery(api.githubRepos.list, {});
  const [sessionToRename, setSessionToRename] = useState<{
    session: SessionListItem;
    repo: RepoRow;
  } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [sessionToArchive, setSessionToArchive] = useState<{
    session: SessionListItem;
    repo: RepoRow;
    pathSegment: string;
  } | null>(null);
  const saveSessionRename = async () => {
    if (!sessionToRename || !renameValue.trim()) return;
    setIsRenaming(true);
    try {
      await updateSession({
        id: sessionToRename.session._id,
        title: renameValue.trim(),
      });
      mutationSuccess("Session renamed", "session-rename");
      setSessionToRename(null);
    } catch {
      mutationError("Couldn't rename session", "session-rename");
      setIsRenaming(false);
      return;
    }
    setIsRenaming(false);
  };
  const updateSession = useMutation(api.sessions.update);

  // Stable identity required by useQueries; deduped with each group's list watch.
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
  const sessionsByRepoId = useQueries(sessionListQueries);

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

  return (
    <>
      <div className="flex-1 px-0 pb-1">
        <div className="flex h-11 w-full items-center">
          <SessionsListModeTabs
            mode={settings.listMode}
            onChange={setListMode}
          />
        </div>
        <div className="pt-1.5">
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={settings.listMode}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={motionFast}
            >
              {orderedRepos === undefined ? (
                <div
                  className="min-h-48 space-y-2 px-3"
                  aria-busy="true"
                  aria-label="Loading sessions"
                >
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-9" />
                  ))}
                </div>
              ) : orderedRepos.length === 0 ? (
                <div className="px-3 py-8 text-center">
                  <p className="text-sm font-medium text-foreground">
                    No apps yet
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Connect a codebase from Home.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {orderedRepos.map((repo) => (
                    <GlobalSessionGroup
                      key={repo._id}
                      repo={repo}
                      pathname={pathname}
                      open={isGroupOpen(repo)}
                      onOpenChange={(open) => {
                        setGroupOpen(repo._id, open);
                      }}
                      onNavigate={onNavigate}
                      sessionSortOrder={settings.sessionSortOrder}
                      sessionPreviewCount={settings.sessionPreviewCount}
                      listMode={settings.listMode}
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
                            void archive(target, pathname, () => {
                              setSessionToArchive(null);
                              if (onNavigate) onNavigate();
                            });
                          },
                        );
                      }}
                    />
                  ))}
                </div>
              )}
            </m.div>
          </AnimatePresence>
        </div>
      </div>

      <Dialog
        open={sessionToRename !== null}
        onOpenChange={(open) => {
          if (!open) setSessionToRename(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename session</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameValue.trim() && sessionToRename) {
                e.preventDefault();
                void saveSessionRename();
              }
            }}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setSessionToRename(null)}
              disabled={isRenaming}
            >
              Cancel
            </Button>
            <Button
              disabled={!renameValue.trim() || isRenaming}
              onClick={() => void saveSessionRename()}
            >
              {isRenaming ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={sessionToArchive !== null}
        onOpenChange={(open) => {
          if (!open) setSessionToArchive(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Session</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will stop the sandbox and remove{" "}
            <span className="font-medium text-foreground">
              {sessionToArchive?.session.title}
            </span>{" "}
            from the active list. An open or draft PR will be closed, and
            reopened if you unarchive.
          </p>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setSessionToArchive(null)}
              disabled={isArchiving}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isArchiving}
              onClick={() => {
                if (!sessionToArchive) return;
                void archive(sessionToArchive, pathname, () => {
                  setSessionToArchive(null);
                  if (onNavigate) onNavigate();
                });
              }}
            >
              {isArchiving ? "Archiving…" : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
