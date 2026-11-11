"use client";

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@vvedantb/ui";
import { IconChevronDown, IconLink, IconPencil } from "@tabler/icons-react";
import { AnimatePresence } from "motion/react";
import { cn } from "@eva/ui";
import { SharedLayoutNav } from "@/lib/components/sidebar/SharedLayoutNav";
import { SESSIONS_ROW_X } from "@/lib/components/sidebar/_utils/sessionsSidebarLayout";
import { SessionGroupRenameDialog } from "@/lib/components/sidebar/_components/SessionGroupRenameDialog";
import { SidebarSessionListRow } from "@/lib/components/sidebar/_components/SidebarSessionListRow";
import { SessionListShowMore } from "@/lib/components/sidebar/_components/SessionListShowMore";
import {
  repoBasePaths,
  sessionRowMatchesPath,
} from "@/lib/components/sidebar/_utils/repoSessionPaths";
import type { LinkedSessionGroup } from "@/lib/components/sidebar/_utils/linkedSessionGroups";
import { previewSessions } from "@/lib/components/sidebar/_utils/sessionListPreview";
import {
  sortSessionsForSidebar,
  type SessionListMode,
  type SessionSortOrder,
} from "@/lib/components/sidebar/_utils/sessionsSidebarSettings";
import type { RepoWithLogo } from "@/lib/utils/repoGrouping";

type SessionListItem = FunctionReturnType<typeof api.sessions.list>[number];

interface LinkedSessionGroupSectionProps {
  group: LinkedSessionGroup<SessionListItem, RepoWithLogo>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathname: string;
  listMode: SessionListMode;
  onNavigate?: () => void;
  sessionSortOrder: SessionSortOrder;
  sessionPreviewCount: number;
  onRenameRequest: (session: SessionListItem, repo: RepoWithLogo) => void;
  onArchiveRequest: (session: SessionListItem, repo: RepoWithLogo) => void;
}

/**
 * One linked-session group in the global Sessions sidebar: sessions one agent
 * spun up from another, across repos. Each row names its own repo and keeps
 * its parallel chats; right-click the header to rename the group.
 */
export function LinkedSessionGroupSection({
  group,
  open,
  onOpenChange,
  pathname,
  listMode,
  onNavigate,
  sessionSortOrder,
  sessionPreviewCount,
  onRenameRequest,
  onArchiveRequest,
}: LinkedSessionGroupSectionProps) {
  const navigate = useNavigate();
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isListExpanded, setIsListExpanded] = useState(false);
  // `members` stays oldest first: the oldest names the group and owns rename.
  const [first] = group.members;
  const sortedSessions = sortSessionsForSidebar(
    group.members.map(({ session }) => session),
    sessionSortOrder,
  );
  const repoBySessionId = new Map(
    group.members.map(({ session, repo }) => [session._id, repo]),
  );
  const selectedSessionId =
    group.members.find(({ session, repo }) =>
      sessionRowMatchesPath(repo, session, pathname),
    )?.session._id ?? null;
  const { visible, hasOverflow, hiddenCount } = previewSessions(
    sortedSessions,
    {
      expanded: isListExpanded,
      selectedId: selectedSessionId,
      limit: sessionPreviewCount,
    },
  );

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <ContextMenu>
        {/* The menu trigger wraps the collapsible trigger: both set
            `data-state`, and the chevron must read the collapsible's. */}
        <ContextMenuTrigger asChild>
          <div>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                title={`${group.members.length} linked sessions`}
                className={cn(
                  "motion-press group/trigger flex w-full min-w-0 items-center gap-2 rounded-menu-item py-1.5 text-left hover:bg-sidebar-accent/50 active:scale-[0.99]",
                  SESSIONS_ROW_X,
                )}
              >
                <span className="flex size-[18px] shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground">
                  <IconLink size={12} />
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-xs font-medium text-muted-foreground">
                    {group.label}
                  </span>
                  <span className="shrink-0 text-2xs tabular-nums text-muted-foreground/70">
                    {group.members.length}
                  </span>
                  <IconChevronDown
                    size={14}
                    className="shrink-0 text-muted-foreground transition-transform duration-[var(--motion-base)] group-data-[state=closed]/trigger:-rotate-90"
                  />
                </span>
              </button>
            </CollapsibleTrigger>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => setIsRenameOpen(true)}>
            <IconPencil size={16} />
            Rename group
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <CollapsibleContent>
        <SharedLayoutNav
          layoutId={`linked-sessions-${group.groupId}-${listMode}`}
          className="space-y-0.5 pb-1"
        >
          <AnimatePresence initial={false}>
            {visible.map((session) => {
              const repo = repoBySessionId.get(session._id);
              if (!repo) return null;
              return (
                <SidebarSessionListRow
                  key={session._id}
                  session={session}
                  repo={repo}
                  pathname={pathname}
                  listMode={listMode}
                  inGroup
                  onNavigate={onNavigate}
                  onRenameRequest={onRenameRequest}
                  onArchiveRequest={onArchiveRequest}
                  onForkNavigate={(segment) => {
                    navigate({
                      to: `${repoBasePaths(session.linkedFrom ?? repo)[0]}/sessions/${segment}`,
                    });
                    onNavigate?.();
                  }}
                />
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
      </CollapsibleContent>
      {first ? (
        <SessionGroupRenameDialog
          open={isRenameOpen}
          onOpenChange={setIsRenameOpen}
          sessionId={first.session._id}
          name={group.name}
        />
      ) : null}
    </Collapsible>
  );
}
