"use client";

import type { Id } from "@eva/backend";
import { api } from "@eva/backend";
import { isTitleRegenerating } from "@eva/shared";
import { ContextMenuItem, ContextMenuSeparator, toast } from "@eva/ui";
import {
  IconArchive,
  IconArchiveOff,
  IconClipboard,
  IconExternalLink,
  IconEye,
  IconGitBranch,
  IconGitFork,
  IconLink,
  IconPencil,
  IconSparkles,
} from "@tabler/icons-react";
import { useAction } from "convex/react";
import { useQuantizedNow } from "@/lib/hooks/useQuantizedNow";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { convexErrorMessage } from "@/lib/utils/convexErrorMessage";
import { withMutationToast } from "@/lib/utils/mutationToast";
import { ConfirmSkipHint, skipConfirmTitle } from "@/lib/confirm";

export interface SessionMenuSession {
  _id: Id<"sessions">;
  title: string;
  branchName?: string;
  prUrl?: string;
  titleRegeneration?: { startedAt: number };
  /** Unset before the first boot and after an archived sandbox is deleted — nothing to fork. */
  sandboxId?: string;
  /** Mid-turn sessions cannot fork: the fork stops the source sandbox. */
  isExecuting?: boolean;
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
  /** Shows Fork session; called with the fork's path segment once it exists. */
  onForkNavigate?: (pathSegment: string) => void;
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
  onForkNavigate,
  onSendForReview,
  onArchiveRequest,
  onUnarchive,
}: SessionMenuItemsProps) {
  const regenerateTitle = useAction(api.textGen.regenerateSessionTitle);
  const forkSession = useAction(api.sandbox.forkSession);
  // Simple view hides branch/PR actions, matching the hidden PR chip on the
  // row: dropping the values here drops Copy branch name, Open PR and Review.
  const simpleView = useSimpleView();
  const branchName = simpleView ? undefined : session.branchName;
  const prUrl = simpleView ? undefined : session.prUrl;
  const forkBlockedReason =
    session.sandboxId === undefined
      ? "No sandbox"
      : session.isExecuting === true
        ? "Agent working"
        : null;

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
      {onForkNavigate ? (
        <ContextMenuItem
          disabled={forkBlockedReason !== null}
          onSelect={() => {
            // Can take a minute: a running source sandbox is stopped first so
            // its disk (DBs included) is snapshotted for the fork to boot from.
            const toastId = "session-fork";
            toast.loading("Forking session…", { id: toastId });
            forkSession({ sessionId: session._id }).then(
              ({ numId }) => {
                toast.success("Session forked", { id: toastId });
                onForkNavigate(String(numId));
              },
              (error) => {
                toast.error(
                  convexErrorMessage(error, "Couldn't fork session"),
                  { id: toastId },
                );
              },
            );
          }}
        >
          <IconGitFork size={16} />
          Fork session
          {/* Disabled items drop pointer events, so a title tooltip never shows. */}
          {forkBlockedReason === null ? null : (
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {forkBlockedReason}
            </span>
          )}
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
