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
  chatId: Id<"sessionChats">;
  isExecuting: boolean;
  messageCount: number;
  isSandboxActive: boolean;
  isSandboxToggling: boolean;
  sandboxGitSync: Doc<"sessions">["sandboxGitSync"];
  isAssistantResponding: boolean;
  model: string | null | undefined;
  providerAccountId: Id<"userProviderAccounts"> | null | undefined;
  usageAccountLabel: string;
  onSandboxToggle: (action: "start" | "stop") => void;
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
  isExecuting,
  messageCount,
  isSandboxActive,
  isSandboxToggling,
  sandboxGitSync,
  isAssistantResponding,
  model,
  providerAccountId,
  usageAccountLabel,
  onSandboxToggle,
  onOpenReviewModal,
}: SessionChatHeaderArgs) {
  const sessionId = session._id;
  const canSendForReview =
    session.archive === undefined && canSendSessionForReview(session);
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
        isExecuting={isExecuting}
        chatId={chatId}
        canRecap={messageCount > 0}
        onOpenReviewModal={canSendForReview ? onOpenReviewModal : undefined}
      />
    </>
  );

  return { headerLeft, headerRight };
}
