"use client";

import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { SidebarSessionRow } from "@/lib/components/sidebar/SidebarSessionRow";
import { sessionRowMatchesPath } from "@/lib/components/sidebar/_utils/repoSessionPaths";
import type { SessionListMode } from "@/lib/components/sidebar/_utils/sessionsSidebarSettings";
import { mutationError, mutationSuccess } from "@/lib/utils/mutationToast";
import type { RepoWithLogo } from "@/lib/utils/repoGrouping";

type SessionListItem = FunctionReturnType<typeof api.sessions.list>[number];

interface SidebarSessionListRowProps {
  session: SessionListItem;
  repo: RepoWithLogo;
  pathname: string;
  listMode: SessionListMode;
  onNavigate?: () => void;
  onForkNavigate: (pathSegment: string) => void;
  onRenameRequest: (session: SessionListItem, repo: RepoWithLogo) => void;
  onArchiveRequest: (session: SessionListItem, repo: RepoWithLogo) => void;
  /** Linked-session group rows: show the app mark, offer "Remove from group". */
  inGroup?: boolean;
}

/**
 * One session in a global Sessions sidebar list. Shared by repo groups and
 * linked-session groups so both list a session the same way. Parallel chats
 * live only as tabs inside the session, never as sidebar rows.
 */
export function SidebarSessionListRow({
  session,
  repo,
  pathname,
  listMode,
  onNavigate,
  onForkNavigate,
  onRenameRequest,
  onArchiveRequest,
  inGroup = false,
}: SidebarSessionListRowProps) {
  const unarchiveSession = useMutation(api.sessions.unarchive);
  const removeFromGroup = useMutation(api.sessions.removeFromGroup);
  const isSessionOpen = sessionRowMatchesPath(repo, session, pathname);
  const groupProps = inGroup
    ? {
        app: repo,
        onRemoveFromGroup: async (s: SessionListItem) => {
          try {
            await removeFromGroup({ sessionId: s._id });
            mutationSuccess("Removed from group", "session-group-remove");
          } catch {
            mutationError("Couldn't remove from group", "session-group-remove");
          }
        },
      }
    : {};

  if (listMode === "archived") {
    return (
      <SidebarSessionRow
        session={session}
        isSelected={isSessionOpen}
        repo={repo}
        onNavigate={onNavigate}
        onForkNavigate={onForkNavigate}
        {...groupProps}
        onUnarchive={async (s) => {
          try {
            await unarchiveSession({ id: s._id });
            mutationSuccess("Session restored", "session-unarchive");
          } catch {
            mutationError("Couldn't restore session", "session-unarchive");
          }
        }}
      />
    );
  }

  return (
    <SidebarSessionRow
      session={session}
      isSelected={isSessionOpen}
      repo={repo}
      onNavigate={onNavigate}
      onRename={async () => {}}
      onRenameRequest={(s) => onRenameRequest(s, repo)}
      onArchiveRequest={(s) => onArchiveRequest(s, repo)}
      onForkNavigate={onForkNavigate}
      {...groupProps}
    />
  );
}
