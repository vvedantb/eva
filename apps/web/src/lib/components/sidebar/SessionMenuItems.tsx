"use client";

import type { Id } from "@eva/backend";
import { api } from "@eva/backend";
import { isTitleRegenerating } from "@eva/shared";
import { ContextMenuItem, ContextMenuSeparator, toast } from "@eva/ui";
import {
  IconArchive,
  IconArchiveOff,
  IconClipboard,
  IconCopy,
  IconExternalLink,
  IconEye,
  IconGitBranch,
  IconLink,
  IconPencil,
  IconSparkles,
} from "@tabler/icons-react";
import { useAction } from "convex/react";
import { useQuantizedNow } from "@/lib/hooks/useQuantizedNow";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { withMutationToast } from "@/lib/utils/mutationToast";
import { ConfirmSkipHint, skipConfirmTitle } from "@/lib/confirm";

export interface SessionMenuSession {
  _id: Id<"sessions">;
  title: string;
  branchName?: string;
  prUrl?: string;
  titleRegeneration?: { startedAt: number };
}

/**
 * Whether a session's title is being regenerated right now. The flag alone is
 * not enough: a run that died before clearing it would pin the hint forever, so
 * it expires after a couple of minutes. Polled on a coarse clock so a sidebar
 * full of rows does not re-render every second.
 */
export function useIsRegeneratingTitle(session: SessionMenuSession): boolean {
  const now = useQuantizedNow(15_000);
  return isTitleRegenerating(session.titleRegeneration, now);
}

interface SessionMenuItemsProps {
  session: SessionMenuSession;
  href: string;
  isRegeneratingTitle: boolean;
  /** Active list only — omitting hides Rename and Regenerate title. */
  onRenameRequest?: () => void;
  /** Active list only — both are needed for Duplicate to show. */
  onDuplicate?: () => Promise<string>;
  onDuplicateNavigate?: (pathSegment: string) => void;
  /** Sessions with a branch and no open PR yet — opens the review dialog. */
  onSendForReview?: () => void;
  /** Active list: archive. Omit in archived list. */
  onArchiveRequest?: () => void;
  /** Archived list: unarchive. */
  onUnarchive?: () => Promise<void>;
}

/**
 * Context-menu body shared by the sidebar session row and the Chrome-style
 * session tab. Callers decide which actions apply by passing or omitting the
 * handlers; the items themselves are identical in both places.
 */
export function SessionMenuItems({
  session,
  href,
  isRegeneratingTitle,
  onRenameRequest,
  onDuplicate,
  onDuplicateNavigate,
  onSendForReview,
  onArchiveRequest,
  onUnarchive,
}: SessionMenuItemsProps) {
  const regenerateTitle = useAction(api.textGen.regenerateSessionTitle);
  // Simple view hides branch/PR actions, matching the hidden PR chip on the
  // row: dropping the values here drops Copy branch name, Open PR and Review.
  const simpleView = useSimpleView();
  const branchName = simpleView ? undefined : session.branchName;
  const prUrl = simpleView ? undefined : session.prUrl;

  return (
    <>
      {onRenameRequest ? (
        <>
          <ContextMenuItem onSelect={onRenameRequest}>
            <IconPencil size={16} />
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            disabled={isRegeneratingTitle}
            onSelect={() => {
              void withMutationToast(
                regenerateTitle({ sessionId: session._id }),
                "Title updated",
                "Couldn't regenerate title",
                "session-regenerate-title",
              );
            }}
          >
            <IconSparkles size={16} />
            Regenerate title
          </ContextMenuItem>
        </>
      ) : null}
      {onDuplicate && onDuplicateNavigate ? (
        <ContextMenuItem
          onSelect={() => {
            void onDuplicate().then((newPathSegment) => {
              onDuplicateNavigate(newPathSegment);
            });
          }}
        >
          <IconCopy size={16} />
          Duplicate
        </ContextMenuItem>
      ) : null}
      <ContextMenuItem
        onSelect={() => {
          void navigator.clipboard.writeText(session.title);
        }}
      >
        <IconClipboard size={16} />
        Copy title
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() => {
          void navigator.clipboard.writeText(window.location.origin + href);
        }}
      >
        <IconLink size={16} />
        Copy link
      </ContextMenuItem>
      {branchName ? (
        <ContextMenuItem
          onSelect={() => {
            void navigator.clipboard.writeText(branchName).then(() => {
              toast.success("Branch name copied");
            });
          }}
        >
          <IconGitBranch size={16} />
          Copy branch name
        </ContextMenuItem>
      ) : null}
      {prUrl ? (
        <ContextMenuItem
          onSelect={() => {
            window.open(prUrl, "_blank", "noopener,noreferrer");
          }}
        >
          <IconExternalLink size={16} />
          Open PR
        </ContextMenuItem>
      ) : null}
      {onSendForReview && !simpleView ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={onSendForReview}
            title={skipConfirmTitle("Send for Review")}
          >
            <IconEye size={16} className="text-status-code-review" />
            Send for Review
            <ConfirmSkipHint />
          </ContextMenuItem>
        </>
      ) : null}
      {onUnarchive ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => {
              void onUnarchive();
            }}
          >
            <IconArchiveOff size={16} />
            Unarchive
          </ContextMenuItem>
        </>
      ) : null}
      {onArchiveRequest ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-warning"
            onSelect={onArchiveRequest}
            title={skipConfirmTitle("Archive")}
          >
            <IconArchive size={16} />
            Archive
            <ConfirmSkipHint />
          </ContextMenuItem>
        </>
      ) : null}
    </>
  );
}
