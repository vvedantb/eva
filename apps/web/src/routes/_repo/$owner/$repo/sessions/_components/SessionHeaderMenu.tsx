"use client";

import { useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api, type Doc } from "@eva/backend";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  useRequestConfirm,
} from "@vvedantb/ui";
import { IconDots } from "@tabler/icons-react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { entityPathSegment } from "@/lib/numId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { mutationError, mutationSuccess } from "@/lib/utils/mutationToast";
import { sessionHrefForRow } from "@/lib/components/sidebar/_utils/repoSessionPaths";
import {
  SessionMenuItems,
  useIsRegeneratingTitle,
} from "@/lib/components/sidebar/SessionMenuItems";
import {
  SessionDialogs,
  type SessionArchiveTarget,
  type SessionRenameTarget,
} from "@/lib/components/sidebar/SessionDialogs";
import { useArchiveSession } from "@/lib/components/sidebar/useArchiveSession";

interface SessionHeaderMenuProps {
  session: Doc<"sessions">;
  /** Any chat of the session holds a turn — blocks Fork session. */
  isExecuting: boolean;
  hasSummary: boolean;
  canSummarise: boolean;
  onOpenSummaryModal: () => void;
  /** Set when the session can go to review; opens the review dialog. */
  onOpenReviewModal?: () => void;
}

/**
 * The chat header "…" menu. Same items as the sidebar row's right-click menu
 * (`SessionMenuItems`), plus Summarise Session, which needs the open chat.
 */
export function SessionHeaderMenu({
  session,
  isExecuting,
  hasSummary,
  canSummarise,
  onOpenSummaryModal,
  onOpenReviewModal,
}: SessionHeaderMenuProps) {
  const { repo, basePath } = useRepo();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { request: requestConfirm } = useRequestConfirm();
  const { archive } = useArchiveSession();
  const unarchiveSession = useMutation(api.sessions.unarchive);
  const isRegeneratingTitle = useIsRegeneratingTitle(session);
  const [renameTarget, setRenameTarget] = useState<SessionRenameTarget | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState("");
  const [archiveTarget, setArchiveTarget] =
    useState<SessionArchiveTarget | null>(null);
  const isArchived = session.archive !== undefined;
  const pathSegment = entityPathSegment(session);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="secondary" aria-label="More">
            <IconDots size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <SessionMenuItems
            variant="dropdown"
            session={{ ...session, isExecuting }}
            href={sessionHrefForRow(repo, session)}
            isRegeneratingTitle={isRegeneratingTitle}
            summary={{
              hasSummary,
              disabled: !canSummarise,
              onRequest: onOpenSummaryModal,
            }}
            onRenameRequest={
              isArchived
                ? undefined
                : () => {
                    setRenameTarget({ session });
                    setRenameValue(session.title);
                  }
            }
            onForkNavigate={(segment) => {
              void navigate({
                to: toInternalRepoHref(`${basePath}/sessions/${segment}`),
              });
            }}
            onSendForReview={onOpenReviewModal}
            onArchiveRequest={
              isArchived || pathSegment === null
                ? undefined
                : () => {
                    const target = { session, repo, pathSegment };
                    requestConfirm(
                      () => setArchiveTarget(target),
                      () => {
                        void archive(target, pathname);
                      },
                    );
                  }
            }
            onUnarchive={
              isArchived
                ? async () => {
                    try {
                      await unarchiveSession({ id: session._id });
                      mutationSuccess("Session restored", "session-unarchive");
                    } catch {
                      mutationError(
                        "Couldn't restore session",
                        "session-unarchive",
                      );
                    }
                  }
                : undefined
            }
          />
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Siblings of the menu: Radix unmounts menu content on close. */}
      <SessionDialogs
        pathname={pathname}
        renameTarget={renameTarget}
        renameValue={renameValue}
        onRenameValueChange={setRenameValue}
        onCloseRename={() => setRenameTarget(null)}
        archiveTarget={archiveTarget}
        onCloseArchive={() => setArchiveTarget(null)}
      />
    </>
  );
}
