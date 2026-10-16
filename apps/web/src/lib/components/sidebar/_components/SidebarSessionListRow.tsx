"use client";

import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useQueryState } from "nuqs";
import { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { SidebarSessionRow } from "@/lib/components/sidebar/SidebarSessionRow";
import { SidebarChatRow } from "@/lib/components/sidebar/SidebarChatRow";
import {
  selectedChatNumber,
  sessionHrefForRow,
  sessionRowMatchesPath,
} from "@/lib/components/sidebar/_utils/repoSessionPaths";
import type { SessionListMode } from "@/lib/components/sidebar/_utils/sessionsSidebarSettings";
import { chatParser } from "@/lib/search-params";
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
 * One session in a global Sessions sidebar list: the row (Main) and, in the
 * active list, its parallel chats under it. Shared by repo groups and
 * linked-session groups so both list a session the same way.
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
  const [chatParam] = useQueryState("chat", chatParser);
  const activeChatNumber = selectedChatNumber(chatParam);
  const unarchiveSession = useMutation(api.sessions.unarchive);
  const removeFromGroup = useMutation(api.sessions.removeFromGroup);
  const isSessionOpen = sessionRowMatchesPath(repo, session, pathname);
  // Parallel chats beyond Main. Per-repo queries, keyed by the session's own
  // repo: rows of one repo share a single cached subscription.
  const chatArgs = listMode === "active" ? { repoId: session.repoId } : "skip";
  const repoChats = useQuery(api.sessionChats.listExtraForRepo, chatArgs);
  const runningChatIds = useQuery(
    api.turns.listRunningChatIdsForRepo,
    chatArgs,
  );
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

  const sessionChats = (repoChats ?? []).filter(
    (chat) => chat.sessionId === session._id,
  );
  return (
    <div>
      <SidebarSessionRow
        session={session}
        // The session row is Main; a chat row takes the highlight while its
        // tab is the one open.
        isSelected={isSessionOpen && activeChatNumber === 1}
        repo={repo}
        onNavigate={onNavigate}
        onRename={async () => {}}
        onRenameRequest={(s) => onRenameRequest(s, repo)}
        onArchiveRequest={(s) => onArchiveRequest(s, repo)}
        onForkNavigate={onForkNavigate}
        {...groupProps}
      />
      {sessionChats.length > 0 ? (
        <div className="mt-1 space-y-1">
          {sessionChats.map((chat) => (
            <SidebarChatRow
              key={chat._id}
              chat={chat}
              sessionHref={sessionHrefForRow(repo, session)}
              isSelected={isSessionOpen && activeChatNumber === chat.number}
              isRunning={runningChatIds?.includes(chat._id) === true}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
