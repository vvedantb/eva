"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@eva/ui";
import {
  IconDots,
  IconEye,
  IconMessagePlus,
  IconSparkles,
} from "@tabler/icons-react";
import type { Id } from "@eva/backend";
import { EntityContextUsage } from "@/lib/components/context-usage";
import { UsageLimitsIndicator } from "@/lib/components/usage-limits";
import { CopyLinkMenuItem } from "@/lib/components/CopyLinkButton";
import { usePrLinkMenuItems } from "@/lib/components/PrLinkMenuItems";
import { SandboxStartStopButton } from "@/lib/components/sandbox/SandboxStartStopButton";
import { SessionSwitcher } from "./SessionSwitcher";
import { canSendSessionForReview } from "../_utils/sessionReadOnly";
import { ConfirmSkipHint, skipConfirmTitle } from "@/lib/confirm";

interface SessionChatHeaderProps {
  repoId: Id<"githubRepos">;
  sessionId: Id<"sessions">;
  title: string;
  branchName?: string;
  prUrl?: string;
  prState?: "draft" | "open" | "merged" | "closed";
  hasSummary: boolean;
  messageCount: number;
  isSandboxActive: boolean;
  isSandboxToggling: boolean;
  /** True while the assistant holds the turn — hides the sleep button. */
  isAssistantResponding: boolean;
  deploymentStatus?: "queued" | "building" | "deployed" | "error";
  /** Canonical link to this session; omitted when the URL already is one. */
  permalinkPath?: string;
  /**
   * Chat-only surface (Manager Ave). It supervises other agents instead of
   * building on its own branch, so "Send for Review" would open a PR with no
   * commits against base — a guaranteed failure, hidden rather than offered.
   */
  chatOnly?: boolean;
  /** Popover already titles the surface — omit the duplicate "Manager Ave". */
  hideTitle?: boolean;
  /**
   * Hides Send for Review — git/PR plumbing simple view does not surface. The
   * PR links hide themselves (see `usePrLinkMenuItems`).
   */
  simpleView: boolean;
  /** Active model + sticky credential — only the chip bar cares. */
  model: string | null | undefined;
  providerAccountId: Id<"userProviderAccounts"> | null | undefined;
  usageAccountLabel: string;
  onSandboxToggle: (action: "start" | "stop") => void;
  onOpenSummaryModal: () => void;
  onOpenReviewModal: () => void;
  /** Manager Ave only: offers "Start new chat". Absent on ordinary sessions. */
  onOpenResetChatDialog?: () => void;
}

export function SessionChatHeader({
  repoId,
  sessionId,
  title,
  branchName,
  prUrl,
  prState,
  hasSummary,
  messageCount,
  isSandboxActive,
  isSandboxToggling,
  isAssistantResponding,
  deploymentStatus,
  permalinkPath,
  chatOnly = false,
  hideTitle = false,
  simpleView,
  model,
  providerAccountId,
  usageAccountLabel,
  onSandboxToggle,
  onOpenSummaryModal,
  onOpenReviewModal,
  onOpenResetChatDialog,
}: SessionChatHeaderProps) {
  // `chatOnly` is Manager Ave, i.e. `session.isOrchestrator`.
  const showSendForReview =
    !simpleView &&
    canSendSessionForReview({
      branchName,
      prState,
      isOrchestrator: chatOnly,
    });
  const prLinks = usePrLinkMenuItems({
    prUrl,
    prState,
    hasDeployment: Boolean(deploymentStatus),
  });

  // Manager Ave is one fixed session at its own URL, so there is nothing to
  // switch to and no repo to navigate up into — the switcher's dropdown would
  // list other repos' sessions and its crumb would imply this chat belongs to
  // the home repo, which is only where its sandbox happens to live. The
  // popover already paints that title in its own chrome, so hide it there.
  const headerLeft = chatOnly ? (
    hideTitle ? undefined : (
      <span className="truncate text-sm font-medium text-foreground">
        {title}
      </span>
    )
  ) : (
    <SessionSwitcher sessionId={sessionId} title={title} />
  );

  const headerRight = (
    <>
      <EntityContextUsage repoId={repoId} entityId={sessionId} />
      <UsageLimitsIndicator
        repoId={repoId}
        model={model}
        providerAccountId={providerAccountId}
        accountLabel={usageAccountLabel}
      />
      <SandboxStartStopButton
        isActive={isSandboxActive}
        isToggling={isSandboxToggling}
        onToggle={onSandboxToggle}
        isAssistantResponding={isAssistantResponding}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="secondary" aria-label="More">
            <IconDots size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onOpenResetChatDialog && (
            <>
              {/* Disabled mid-turn: the reset retires this session, and the
                  in-flight turn would finish writing into a chat the user can
                  no longer reach. */}
              <DropdownMenuItem
                onClick={onOpenResetChatDialog}
                disabled={isAssistantResponding}
                title={skipConfirmTitle("Start new chat")}
              >
                <IconMessagePlus size={14} />
                Start new chat
                <ConfirmSkipHint />
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem
            onClick={onOpenSummaryModal}
            disabled={!isSandboxActive || messageCount === 0}
            title={skipConfirmTitle(
              hasSummary ? "Regenerate Summary" : "Summarise Session",
            )}
          >
            <IconSparkles size={14} />
            {hasSummary ? "Regenerate Summary" : "Summarise Session"}
            <ConfirmSkipHint />
          </DropdownMenuItem>
          {(showSendForReview || prLinks.hasItems) && <DropdownMenuSeparator />}
          {showSendForReview && (
            <DropdownMenuItem
              onClick={onOpenReviewModal}
              title={skipConfirmTitle("Send for Review")}
            >
              <IconEye size={14} className="text-status-code-review" />
              Send for Review
              <ConfirmSkipHint />
            </DropdownMenuItem>
          )}
          {prLinks.items}
          <DropdownMenuSeparator />
          <CopyLinkMenuItem path={permalinkPath} />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  return { headerLeft, headerRight };
}
