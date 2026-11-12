"use client";

import type { Id } from "@eva/backend";
import { api } from "@eva/backend";
import { isTitleRegenerating } from "@eva/shared";
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  toast,
  ConfirmSkipHint,
  skipConfirmTitle,
  convexErrorMessage,
} from "@vvedantb/ui";
import {
  IconArchive,
  IconArchiveOff,
  IconClipboard,
  IconCopy,
  IconExternalLink,
  IconEye,
  IconGitBranch,
  IconGitFork,
  IconLink,
  IconLinkOff,
  IconPencil,
  IconSparkles,
} from "@tabler/icons-react";
import { useAction } from "convex/react";
import { useQuantizedNow } from "@/lib/hooks/useQuantizedNow";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { withMutationToast } from "@/lib/utils/mutationToast";
import { PrActionsSubmenus } from "@/lib/components/pr-menu/PrActionsSubmenus";
import { useOwnerPullRequests } from "@/lib/components/pr-menu/useOwnerPullRequests";

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
  /** Right-click menu (sidebar row, session tab) or the chat header "…" menu. */
  variant: "context" | "dropdown";
  session: SessionMenuSession;
  href: string;
  isRegeneratingTitle: boolean;
  /** Rows and tabs that link elsewhere; the chat header is already the session. */
  showOpenInNewTab?: boolean;
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
  /** Rows in a linked-session group: take the session out of the group. */
  onRemoveFromGroup?: () => void;
  /** Chat header only: the summary runs in the open chat's sandbox. */
  summary?: { hasSummary: boolean; disabled: boolean; onRequest: () => void };
}

/**
 * Session menu body shared by the sidebar session row, the Chrome-style
 * session tab and the chat header "…" menu. Callers decide which actions
 * apply by passing or omitting the handlers; the items themselves are
 * identical in every place.
 */
export function SessionMenuItems({
  variant,
  session,
  href,
  isRegeneratingTitle,
  showOpenInNewTab = false,
  onRenameRequest,
  onForkNavigate,
  onSendForReview,
  onArchiveRequest,
  onUnarchive,
  onRemoveFromGroup,
  summary,
}: SessionMenuItemsProps) {
  const Item = variant === "context" ? ContextMenuItem : DropdownMenuItem;
  const Separator =
    variant === "context" ? ContextMenuSeparator : DropdownMenuSeparator;
  const Sub = variant === "context" ? ContextMenuSub : DropdownMenuSub;
  const SubTrigger =
    variant === "context" ? ContextMenuSubTrigger : DropdownMenuSubTrigger;
  const SubContent =
    variant === "context" ? ContextMenuSubContent : DropdownMenuSubContent;
  const iconSize = variant === "context" ? 16 : 14;
  const regenerateTitle = useAction(api.textGen.regenerateSessionTitle);
  const forkSession = useAction(api.sandbox.forkSession);
  // Simple view hides branch/PR actions, matching the hidden PR chip on the
  // row: dropping the values here drops Copy branch name, Open PR and Review.
  const simpleView = useSimpleView();
  const branchName = simpleView ? undefined : session.branchName;
  const prUrl = simpleView ? undefined : session.prUrl;
  const prs = useOwnerPullRequests({ kind: "session", sessionId: session._id });
  const forkBlockedReason =
    session.sandboxId === undefined
      ? "No sandbox"
      : session.isExecuting === true
        ? "Agent working"
        : null;

  // Groups: session actions (Copy is a submenu there), PR actions, then
  // Archive. A divider opens a group only when the group has items.
  const showOpenPr = prs.length === 0 && prUrl !== undefined;
  const showSendForReview = onSendForReview !== undefined && !simpleView;
  const hasPrGroup = prs.length > 0 || showOpenPr || showSendForReview;

  const summaryLabel = summary?.hasSummary
    ? "Regenerate Summary"
    : "Summarise Session";

  return (
    <>
      {summary ? (
        <>
          <Item
            onSelect={summary.onRequest}
            disabled={summary.disabled}
            title={skipConfirmTitle(summaryLabel)}
          >
            <IconSparkles size={iconSize} />
            {summaryLabel}
            <ConfirmSkipHint />
          </Item>
          <Separator />
        </>
      ) : null}
      {showOpenInNewTab ? (
        <Item
          onSelect={() => {
            window.open(href, "_blank", "noopener,noreferrer");
          }}
        >
          <IconExternalLink size={iconSize} />
          Open in new tab
        </Item>
      ) : null}
      {onRenameRequest ? (
        <>
          <Item onSelect={onRenameRequest}>
            <IconPencil size={iconSize} />
            Rename
          </Item>
          <Item
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
            <IconSparkles size={iconSize} />
            Regenerate title
          </Item>
        </>
      ) : null}
      {onForkNavigate ? (
        <Item
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
          <IconGitFork size={iconSize} />
          Fork session
          {/* Disabled items drop pointer events, so a title tooltip never shows. */}
          {forkBlockedReason === null ? null : (
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {forkBlockedReason}
            </span>
          )}
        </Item>
      ) : null}
      <Sub>
        <SubTrigger>
          <IconCopy size={iconSize} />
          Copy
        </SubTrigger>
        <SubContent>
          <Item
            onSelect={() => {
              void navigator.clipboard.writeText(session.title);
            }}
          >
            <IconClipboard size={iconSize} />
            Title
          </Item>
          <Item
            onSelect={() => {
              void navigator.clipboard.writeText(window.location.origin + href);
            }}
          >
            <IconLink size={iconSize} />
            Link
          </Item>
          {branchName ? (
            <Item
              onSelect={() => {
                void navigator.clipboard.writeText(branchName).then(() => {
                  toast.success("Branch name copied");
                });
              }}
            >
              <IconGitBranch size={iconSize} />
              Branch name
            </Item>
          ) : null}
        </SubContent>
      </Sub>
      {hasPrGroup ? <Separator /> : null}
      <PrActionsSubmenus variant={variant} prs={prs} />
      {/* A session whose PR predates the `pullRequests` rows has only a URL. */}
      {showOpenPr ? (
        <Item
          onSelect={() => {
            window.open(prUrl, "_blank", "noopener,noreferrer");
          }}
        >
          <IconExternalLink size={iconSize} />
          Open PR
        </Item>
      ) : null}
      {showSendForReview ? (
        <Item
          onSelect={onSendForReview}
          title={skipConfirmTitle("Send for Review")}
        >
          <IconEye size={iconSize} className="text-status-code-review" />
          Send for Review
          <ConfirmSkipHint />
        </Item>
      ) : null}
      {onRemoveFromGroup ? (
        <>
          <Separator />
          <Item onSelect={onRemoveFromGroup}>
            <IconLinkOff size={iconSize} />
            Remove from group
          </Item>
        </>
      ) : null}
      {onUnarchive ? (
        <>
          <Separator />
          <Item
            onSelect={() => {
              void onUnarchive();
            }}
          >
            <IconArchiveOff size={iconSize} />
            Unarchive
          </Item>
        </>
      ) : null}
      {onArchiveRequest ? (
        <>
          <Separator />
          <Item
            className="text-warning"
            onSelect={onArchiveRequest}
            title={skipConfirmTitle("Archive")}
          >
            <IconArchive size={iconSize} />
            Archive
            <ConfirmSkipHint />
          </Item>
        </>
      ) : null}
    </>
  );
}
