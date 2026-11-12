"use client";

import type { Doc, Id } from "@eva/backend";
import { EntityContextUsage } from "@/lib/components/context-usage";
import { UsageLimitsIndicator } from "@/lib/components/usage-limits";
import { SandboxCommitPushButton } from "@/lib/components/sandbox/SandboxCommitPushButton";
import { SandboxStartStopButton } from "@/lib/components/sandbox/SandboxStartStopButton";
import {
  SandboxErrorNotice,
  useSessionSandboxError,
} from "@/lib/components/sandbox/SandboxErrorNotice";
import { SessionSwitcher } from "./SessionSwitcher";
import { SessionGroupBadge } from "./SessionGroupBadge";
import { SessionRepoBadges } from "./SessionRepoBadges";
import { SessionHeaderMenu } from "./SessionHeaderMenu";
import { canSendSessionForReview } from "../_utils/sessionReadOnly";
import { PrMergeConfetti } from "@/lib/components/celebration/PrMergeConfetti";

interface SessionChatHeaderArgs {
  repoId: Id<"githubRepos">;
  session: Doc<"sessions">;
  /** The chat tab shown — context usage is per chat, like its transcript. */
  chatId: Id<"sessionChats">;
  /** Any chat of the session holds a turn — blocks Fork session. */
  isAnyChatExecuting: boolean;
  hasSummary: boolean;
  messageCount: number;
  isSandboxActive: boolean;
  isSandboxToggling: boolean;
  /** Work on the sandbox branch not on GitHub yet; drives Commit & push. */
  sandboxGitSync: Doc<"sessions">["sandboxGitSync"];
  /** True while the assistant holds the turn — hides the sleep button. */
  isAssistantResponding: boolean;
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
 * which then skips the call on a cache hit and drops `useSessionSandboxError`.
 */
export function useSessionChatHeader({
  repoId,
  session,
  chatId,
  isAnyChatExecuting,
  hasSummary,
  messageCount,
  isSandboxActive,
  isSandboxToggling,
  sandboxGitSync,
  isAssistantResponding,
  model,
  providerAccountId,
  usageAccountLabel,
  onSandboxToggle,
  onOpenSummaryModal,
  onOpenReviewModal,
}: SessionChatHeaderArgs) {
  const sessionId = session._id;
  // Same gate as the sidebar row: an archived session is read-only.
  const canSendForReview =
    session.archive === undefined && canSendSessionForReview(session);
  // A start that failed leaves the session `closed`, which the header would
  // otherwise render as an ordinary sleeping sandbox. The hook reads the row
  // itself because nothing upstream hands this header the failure.
  const sandboxError = useSessionSandboxError(sessionId);

  const headerLeft = (
    <>
      <SessionSwitcher sessionId={sessionId} title={session.title} />
      <SessionRepoBadges sessionId={sessionId} />
      <SessionGroupBadge sessionId={sessionId} />
    </>
  );

  const headerRight = (
    <>
      <PrMergeConfetti owner={{ kind: "session", sessionId }} />
      {sandboxError !== undefined ? (
        <SandboxErrorNotice
          sandboxError={sandboxError}
          onRetry={() => onSandboxToggle("start")}
        />
      ) : null}
      <EntityContextUsage repoId={repoId} entityId={chatId} />
      <UsageLimitsIndicator
        repoId={repoId}
        model={model}
        providerAccountId={providerAccountId}
        accountLabel={usageAccountLabel}
      />
      <SandboxCommitPushButton
        gitSync={sandboxGitSync}
        isSandboxActive={isSandboxActive}
        target={{ kind: "session", sessionId }}
      />
      <SandboxStartStopButton
        isActive={isSandboxActive}
        isToggling={isSandboxToggling}
        onToggle={onSandboxToggle}
        isAssistantResponding={isAssistantResponding}
        hasStartError={sandboxError !== undefined}
      />
      <SessionHeaderMenu
        session={session}
        isExecuting={isAnyChatExecuting}
        hasSummary={hasSummary}
        canSummarise={isSandboxActive && messageCount > 0}
        onOpenSummaryModal={onOpenSummaryModal}
        onOpenReviewModal={canSendForReview ? onOpenReviewModal : undefined}
      />
    </>
  );

  return { headerLeft, headerRight };
}
