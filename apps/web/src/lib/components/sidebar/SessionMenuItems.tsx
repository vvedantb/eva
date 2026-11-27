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
  sandboxId?: string;
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
  variant: "context" | "dropdown";
  session: SessionMenuSession;
  href: string;
  isRegeneratingTitle: boolean;
  showOpenInNewTab?: boolean;
  onRenameRequest?: () => void;
  onForkNavigate?: (pathSegment: string) => void;
  onSendForReview?: () => void;
  onArchiveRequest?: () => void;
  onUnarchive?: () => Promise<void>;
  onRemoveFromGroup?: () => void;
  onRecapRequest?: () => void;
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
  onRecapRequest,
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

  const showOpenPr = prs.length === 0 && prUrl !== undefined;
  const showSendForReview = onSendForReview !== undefined && !simpleView;
  const hasPrGroup = prs.length > 0 || showOpenPr || showSendForReview;

  return (
    <>
      {onRecapRequest ? (
        <>
          <Item onSelect={onRecapRequest}>
            <IconSparkles size={iconSize} />
            Recap chat
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
