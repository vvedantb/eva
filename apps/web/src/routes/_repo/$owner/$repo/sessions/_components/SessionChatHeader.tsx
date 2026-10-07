"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@eva/ui";
import { IconDots, IconEye, IconSparkles } from "@tabler/icons-react";
import type { Id } from "@eva/backend";
import { EntityContextUsage } from "@/lib/components/context-usage";
import { UsageLimitsIndicator } from "@/lib/components/usage-limits";
import { CopyLinkMenuItem } from "@/lib/components/CopyLinkButton";
import { usePrLinkMenuItems } from "@/lib/components/PrLinkMenuItems";
import { SandboxStartStopButton } from "@/lib/components/sandbox/SandboxStartStopButton";
import {
  SandboxErrorNotice,
  useSessionSandboxError,
} from "@/lib/components/sandbox/SandboxErrorNotice";
import { SessionSwitcher } from "./SessionSwitcher";
import { SessionRepoBadges } from "./SessionRepoBadges";
import { canSendSessionForReview } from "../_utils/sessionReadOnly";
import { ConfirmSkipHint, skipConfirmTitle } from "@/lib/confirm";

interface SessionChatHeaderArgs {
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
}

/**
 * Builds the session chat header slots. Named `use*` because ChatPanel invokes
 * it during render: a PascalCase helper would look pure to React Compiler,
 * which then skips the call on a cache hit and drops `usePrLinkMenuItems`.
 */
export function useSessionChatHeader({
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
  simpleView,
  model,
  providerAccountId,
  usageAccountLabel,
  onSandboxToggle,
  onOpenSummaryModal,
  onOpenReviewModal,
}: SessionChatHeaderArgs) {
  const showSendForReview =
    !simpleView && canSendSessionForReview({ branchName, prState });
  // A start that failed leaves the session `closed`, which the header would
  // otherwise render as an ordinary sleeping sandbox. The hook reads the row
  // itself because nothing upstream hands this header the failure.
  const sandboxError = useSessionSandboxError(sessionId);
  const prLinks = usePrLinkMenuItems({
    prUrl,
    prState,
    owner: { kind: "session", sessionId },
    hasDeployment: Boolean(deploymentStatus),
  });

  const headerLeft = (
    <>
      <SessionSwitcher sessionId={sessionId} title={title} />
      <SessionRepoBadges sessionId={sessionId} />
    </>
  );

  const headerRight = (
    <>
      {sandboxError !== undefined ? (
        <SandboxErrorNotice
          sandboxError={sandboxError}
          onRetry={() => onSandboxToggle("start")}
        />
      ) : null}
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
        hasStartError={sandboxError !== undefined}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="secondary" aria-label="More">
            <IconDots size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
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
          <CopyLinkMenuItem />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  return { headerLeft, headerRight };
}
