"use client";

import { useNavigate } from "@tanstack/react-router";
import type { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@eva/ui";
import { IconChevronDown, IconLink } from "@tabler/icons-react";
import { AnimatePresence } from "motion/react";
import { SidebarSessionRow } from "@/lib/components/sidebar/SidebarSessionRow";
import { SharedLayoutNav } from "@/lib/components/sidebar/SharedLayoutNav";
import {
  repoBasePaths,
  sessionRowMatchesPath,
} from "@/lib/components/sidebar/_utils/repoSessionPaths";
import type { LinkedSessionGroup } from "@/lib/components/sidebar/_utils/linkedSessionGroups";
import type { RepoWithLogo } from "@/lib/utils/repoGrouping";

type SessionListItem = FunctionReturnType<typeof api.sessions.list>[number];

interface LinkedSessionGroupSectionProps {
  group: LinkedSessionGroup<SessionListItem, RepoWithLogo>;
  pathname: string;
  onNavigate?: () => void;
  onRenameRequest: (session: SessionListItem, repo: RepoWithLogo) => void;
  onArchiveRequest: (session: SessionListItem, repo: RepoWithLogo) => void;
}

/**
 * One linked-session group in the global Sessions sidebar: sessions one agent
 * spun up from another, across repos. Each row names its own repo.
 */
export function LinkedSessionGroupSection({
  group,
  pathname,
  onNavigate,
  onRenameRequest,
  onArchiveRequest,
}: LinkedSessionGroupSectionProps) {
  const navigate = useNavigate();

  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          title={`${group.members.length} linked sessions`}
          className="motion-press group/trigger flex w-full min-w-0 items-center gap-2 rounded-menu-item px-4 py-1.5 text-left hover:bg-sidebar-accent/50 active:scale-[0.99]"
        >
          <span className="flex size-[18px] shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground">
            <IconLink size={12} />
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-xs font-medium text-muted-foreground">
              {group.title}
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
      <CollapsibleContent>
        <SharedLayoutNav
          layoutId={`linked-sessions-${group.rootId}`}
          className="space-y-1 pb-1"
        >
          <AnimatePresence initial={false}>
            {group.members.map(({ session, repo }) => (
              <SidebarSessionRow
                key={session._id}
                session={session}
                isSelected={sessionRowMatchesPath(repo, session, pathname)}
                repo={repo}
                showRepo
                onNavigate={onNavigate}
                onRename={async () => {}}
                onRenameRequest={(s) => onRenameRequest(s, repo)}
                onArchiveRequest={(s) => onArchiveRequest(s, repo)}
                onForkNavigate={(segment) => {
                  navigate({
                    to: `${repoBasePaths(session.linkedFrom ?? repo)[0]}/sessions/${segment}`,
                  });
                  onNavigate?.();
                }}
              />
            ))}
          </AnimatePresence>
        </SharedLayoutNav>
      </CollapsibleContent>
    </Collapsible>
  );
}
