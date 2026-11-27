"use client";

import type { PrState } from "@eva/shared";
import { m } from "motion/react";
import { api, type Id } from "@eva/backend";
import { useQuery } from "convex-helpers/react/cache/hooks";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  toast,
  useRequestConfirm,
} from "@vvedantb/ui";
import { useState } from "react";
import { SidebarSessionItem } from "@/lib/components/sidebar/SidebarSessionItem";
import type { RepoAppMarkRepo } from "@/lib/components/RepoLogo";
import type { SandboxStatus } from "@/lib/components/sandbox/sandboxStatusStyles";
import {
  sessionHrefForRow,
  type RepoPathParts,
} from "@/lib/components/sidebar/_utils/repoSessionPaths";
import {
  SessionMenuItems,
  useIsRegeneratingTitle,
} from "@/lib/components/sidebar/SessionMenuItems";
import { SharedLayoutNavSurface } from "@/lib/components/sidebar/SharedLayoutNav";
import {
  SessionReviewModal,
  useSendSessionForReview,
} from "@/routes/_repo/$owner/$repo/sessions/_components/SessionReviewModal";
import { canSendSessionForReview } from "@/routes/_repo/$owner/$repo/sessions/_utils/sessionReadOnly";
import { sidebarRowPresence } from "@/lib/components/sidebar/_utils/sidebarRowPresence";

interface SessionItem {
  _id: Id<"sessions">;
  repoId: Id<"githubRepos">;
  numId?: number;
  _creationTime: number;
  userId: Id<"users">;
  title: string;
  titleRegeneration?: { startedAt: number };
  status: SandboxStatus;
  sandboxError?: string;
  isExecuting?: boolean;
  isAwaitingAnswer?: boolean;
  hasUnread?: boolean;
  updatedAt?: number;
  sandboxId?: string;
  branchName?: string;
  baseBranch?: string;
  prUrl?: string;
  prState?: PrState;
  linkedFrom?: RepoPathParts;
  linkedRepoCount?: number;
  forkedFromSessionId?: Id<"sessions">;
}

interface SidebarSessionRowProps<T extends SessionItem> {
  session: T;
  isSelected: boolean;
  repo: RepoPathParts;
  onNavigate?: () => void;
  onRename?: (session: T, newTitle: string) => Promise<void>;
  onArchiveRequest?: (session: T) => void;
  onUnarchive?: (session: T) => Promise<void>;
  onForkNavigate?: (pathSegment: string) => void;
  onRenameRequest?: (session: T) => void;
  app?: RepoAppMarkRepo;
  onRemoveFromGroup?: (session: T) => void;
}

/**
 * One session row plus context menu. Active list gets rename/archive; archived
 * list gets unarchive. Both can fork.
 */
export function SidebarSessionRow<T extends SessionItem>({
  session,
  isSelected,
  repo,
  onNavigate,
  onRename,
  onArchiveRequest,
  onUnarchive,
  onForkNavigate,
  onRenameRequest,
  app,
  onRemoveFromGroup,
}: SidebarSessionRowProps<T>) {
  const href = sessionHrefForRow(repo, session);
  const isArchivedList = onUnarchive !== undefined;
  const isRegeneratingTitle = useIsRegeneratingTitle(session);
  const canSendForReview = !isArchivedList && canSendSessionForReview(session);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const { request: requestConfirm } = useRequestConfirm();
  const { sendForReview } = useSendSessionForReview(session._id);
  const draftMarks = useQuery(api.drafts.listMarks, { repoId: session.repoId });
  const hasDraft = draftMarks?.sessionIds.includes(session._id) ?? false;

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <m.div
            {...sidebarRowPresence}
          >
            <SharedLayoutNavSurface
              itemId={session._id}
              isActive={isSelected}
              className="group rounded-menu-item"
            >
              <SidebarSessionItem
                href={href}
                title={session.title}
                isRegeneratingTitle={isRegeneratingTitle}
                sessionId={session._id}
                userId={session.userId}
                createdAt={session._creationTime}
                updatedAt={session.updatedAt}
                status={session.status}
                sandboxError={session.sandboxError}
                isExecuting={session.isExecuting === true}
                isAwaitingAnswer={session.isAwaitingAnswer === true}
                hasUnread={session.hasUnread === true}
                hasDraft={hasDraft}
                isSelected={isSelected}
                onNavigate={onNavigate}
                prUrl={session.prUrl}
                prState={session.prState}
                baseBranch={session.baseBranch}
                linkedFrom={session.linkedFrom}
                linkedRepoCount={session.linkedRepoCount}
                forkedFromSessionId={session.forkedFromSessionId}
                app={app}
              />
            </SharedLayoutNavSurface>
          </m.div>
        </ContextMenuTrigger>
        <ContextMenuContent onClick={(e) => e.stopPropagation()}>
          <SessionMenuItems
            variant="context"
            showOpenInNewTab
            session={session}
            href={href}
            isRegeneratingTitle={isRegeneratingTitle}
            onRenameRequest={
              !isArchivedList && onRename && onRenameRequest
                ? () => onRenameRequest(session)
                : undefined
            }
            onForkNavigate={onForkNavigate}
            onSendForReview={
              canSendForReview
                ? () =>
                    requestConfirm(
                      () => setIsReviewOpen(true),
                      () => {
                        void sendForReview().then((ok) => {
                          if (ok) toast.success("Sent to the team for review.");
                        });
                      },
                    )
                : undefined
            }
            onUnarchive={
              isArchivedList && onUnarchive
                ? () => onUnarchive(session)
                : undefined
            }
            onRemoveFromGroup={
              onRemoveFromGroup ? () => onRemoveFromGroup(session) : undefined
            }
            onArchiveRequest={
              !isArchivedList && onArchiveRequest
                ? () => onArchiveRequest(session)
                : undefined
            }
          />
        </ContextMenuContent>
      </ContextMenu>
      {canSendForReview ? (
        <SessionReviewModal
          sessionId={session._id}
          open={isReviewOpen}
          onClose={() => setIsReviewOpen(false)}
        />
      ) : null}
    </>
  );
}
