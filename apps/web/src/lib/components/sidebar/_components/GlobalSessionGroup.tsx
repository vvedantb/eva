"use client";

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryState } from "nuqs";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Spinner,
  cn,
} from "@eva/ui";
import { IconChevronDown, IconPlus } from "@tabler/icons-react";
import { AnimatePresence } from "motion/react";
import { RepoLogo } from "@/lib/components/RepoLogo";
import { SessionListShowMore } from "@/lib/components/sidebar/_components/SessionListShowMore";
import { SidebarSessionRow } from "@/lib/components/sidebar/SidebarSessionRow";
import { SidebarChatRow } from "@/lib/components/sidebar/SidebarChatRow";
import { chatParser } from "@/lib/search-params";
import { CountPop, countLabel } from "@/lib/components/ui/CountPop";
import { SharedLayoutNav } from "@/lib/components/sidebar/SharedLayoutNav";
import {
  repoBasePaths,
  repoSessionsIndexPath,
  selectedChatNumber,
  sessionMatchesPath,
} from "@/lib/components/sidebar/_utils/repoSessionPaths";
import { previewSessions } from "@/lib/components/sidebar/_utils/sessionListPreview";
import {
  sortSessionsForSidebar,
  type SessionListMode,
  type SessionSortOrder,
} from "@/lib/components/sidebar/_utils/sessionsSidebarSettings";
import { entityPathSegment } from "@/lib/numId";
import {
  catchMutationError,
  mutationError,
  mutationSuccess,
} from "@/lib/utils/mutationToast";
import { repoDisplayLabel, type RepoWithLogo } from "@/lib/utils/repoGrouping";
import { isSessionSidebarActive } from "@/routes/_repo/$owner/$repo/sessions/_utils/sessionReadOnly";

type SessionListItem = FunctionReturnType<typeof api.sessions.list>[number];

interface GlobalSessionGroupProps {
  repo: RepoWithLogo;
  pathname: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: () => void;
  onRenameRequest: (session: SessionListItem, repo: RepoWithLogo) => void;
  onArchiveRequest: (session: SessionListItem, repo: RepoWithLogo) => void;
  sessionSortOrder: SessionSortOrder;
  sessionPreviewCount: number;
  listMode: SessionListMode;
}

/**
 * One collapsible app group in the global Sessions sidebar: logo + title,
 * `+` â†’ that app's sessions composer, then Active or Archived rows for the
 * current list mode (capped with Show more).
 */
export function GlobalSessionGroup({
  repo,
  pathname,
  open,
  onOpenChange,
  onNavigate,
  onRenameRequest,
  onArchiveRequest,
  sessionSortOrder,
  sessionPreviewCount,
  listMode,
}: GlobalSessionGroupProps) {
  const navigate = useNavigate();
  const [isListExpanded, setIsListExpanded] = useState(false);
  const activeSessions = useQuery(
    api.sessions.list,
    listMode === "active" ? { repoId: repo._id } : "skip",
  );
  const archivedSessions = useQuery(
    api.sessions.listArchived,
    listMode === "archived" ? { repoId: repo._id } : "skip",
  );
  // Parallel chats beyond Main, grouped under their session row. One query
  // per repo group (not per session), plus one for which chats are running.
  const extraChats = useQuery(
    api.sessionChats.listExtraForRepo,
    listMode === "active" ? { repoId: repo._id } : "skip",
  );
  const runningChatIds = useQuery(
    api.turns.listRunningChatIdsForRepo,
    listMode === "active" ? { repoId: repo._id } : "skip",
  );
  const [chatParam] = useQueryState("chat", chatParser);
  const activeChatNumber = selectedChatNumber(chatParam);
  const chatsBySessionId = new Map<string, typeof extraChats>();
  for (const chat of extraChats ?? []) {
    const list = chatsBySessionId.get(chat.sessionId) ?? [];
    list.push(chat);
    chatsBySessionId.set(chat.sessionId, list);
  }
  const runningChatIdSet = new Set<string>(runningChatIds ?? []);
  const createSession = useMutation(api.sessions.create);
  const unarchiveSession = useMutation(api.sessions.unarchive);
  const label = repoDisplayLabel(repo);
  const baseUrl = `${repoBasePaths(repo)[0]}/sessions`;

  const sourceSessions =
    listMode === "archived" ? archivedSessions : activeSessions;
  const isLoading = sourceSessions === undefined;
  const sortedSessions = sortSessionsForSidebar(
    sourceSessions ?? [],
    sessionSortOrder,
  );
  const selectedSessionId =
    sortedSessions.find((session) =>
      sessionMatchesPath(repo, entityPathSegment(session), pathname),
    )?._id ?? null;
  const {
    visible: visibleSessions,
    hasOverflow,
    hiddenCount,
  } = previewSessions(sortedSessions, {
    expanded: isListExpanded,
    selectedId: selectedSessionId,
    limit: sessionPreviewCount,
  });
  const runningCount =
    activeSessions?.filter(
      (s) => s.status === "active" && isSessionSidebarActive(s),
    ).length ?? 0;
  const hasNoResults = !isLoading && sortedSessions.length === 0;

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className="flex items-center gap-0.5">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="motion-press flex min-w-0 flex-1 items-center gap-2 rounded-menu-item px-4 py-1.5 text-left hover:bg-sidebar-accent/50 active:scale-[0.99]"
          >
            <RepoLogo
              logoUrl={repo.logoUrl}
              size={18}
              fallback={
                <span className="flex size-[18px] items-center justify-center rounded-sm bg-muted text-[10px] font-semibold text-muted-foreground">
                  {label.charAt(0).toUpperCase()}
                </span>
              }
            />
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-xs font-medium text-muted-foreground">
                {label}
              </span>
              {/* This count is the sidebar's live read on "how many agents are
                  working right now", so it mounts, climbs and clears while the
                  user is reading something else — the same job as the rail's
                  unread dots, and now the same entrance. `children` rather than
                  a bare label because the badge is a dot plus a number. */}
              <CountPop
                label={listMode === "active" ? countLabel(runningCount) : null}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0"
              >
                <span className="size-1.5 rounded-full bg-emerald-500" />
                <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                  {runningCount}
                </span>
              </CountPop>
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
        {listMode === "active" ? (
          <button
            type="button"
            aria-label={`New session in ${label}`}
            title={`New session in ${label}`}
            className="motion-press flex size-7 max-sm:size-10 shrink-0 items-center justify-center rounded-menu-item text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground active:scale-[0.92]"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navigate({ to: repoSessionsIndexPath(repo) });
              onNavigate?.();
            }}
          >
            <IconPlus size={14} />
          </button>
        ) : null}
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
                {listMode === "archived"
                  ? "No archived sessions"
                  : "No sessions yet"}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {listMode === "archived"
                  ? "Archive a thread from its menu."
                  : "Press + to start one."}
              </p>
            </div>
          ) : (
            <SharedLayoutNav
              layoutId={`global-sessions-${repo._id}-${listMode}`}
              className="space-y-1"
            >
              <AnimatePresence initial={false}>
                {visibleSessions.map((session) => {
                  const pathSegment = entityPathSegment(session);
                  const isSessionOpen = sessionMatchesPath(
                    repo,
                    pathSegment,
                    pathname,
                  );
                  const sessionChats =
                    chatsBySessionId.get(session._id) ?? [];
                  // The session row is Main; a chat row takes the highlight
                  // while its tab is the one open.
                  const isSelected = isSessionOpen && activeChatNumber === 1;
                  if (listMode === "archived") {
                    return (
                      <SidebarSessionRow
                        key={session._id}
                        session={session}
                        isSelected={isSelected}
                        baseUrl={baseUrl}
                        onNavigate={onNavigate}
                        onUnarchive={async (s) => {
                          try {
                            await unarchiveSession({ id: s._id });
                            mutationSuccess(
                              "Session restored",
                              "session-unarchive",
                            );
                          } catch {
                            mutationError(
                              "Couldn't restore session",
                              "session-unarchive",
                            );
                          }
                        }}
                      />
                    );
                  }
                  return (
                    <div key={session._id}>
                    <SidebarSessionRow
                      session={session}
                      isSelected={isSelected}
                      baseUrl={baseUrl}
                      onNavigate={onNavigate}
                      onRename={async () => {}}
                      onDuplicate={async (s) => {
                        const { numId } = await catchMutationError(
                          createSession({
                            repoId: repo._id,
                            title: `${s.title} (copy)`,
                          }),
                          "Couldn't duplicate session",
                          "session-duplicate",
                        );
                        return String(numId);
                      }}
                      onRenameRequest={(s) => onRenameRequest(s, repo)}
                      onArchiveRequest={(s) => onArchiveRequest(s, repo)}
                      onDuplicateNavigate={(segment) => {
                        navigate({ to: `${baseUrl}/${segment}` });
                        onNavigate?.();
                      }}
                    />
                    {sessionChats.length > 0 && pathSegment ? (
                      <div className="mt-1 space-y-1">
                        {sessionChats.map((chat) => (
                          <SidebarChatRow
                            key={chat._id}
                            chat={chat}
                            sessionHref={`${baseUrl}/${pathSegment}`}
                            isSelected={
                              isSessionOpen && activeChatNumber === chat.number
                            }
                            isRunning={runningChatIdSet.has(chat._id)}
                            onNavigate={onNavigate}
                          />
                        ))}
                      </div>
                    ) : null}
                    </div>
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
