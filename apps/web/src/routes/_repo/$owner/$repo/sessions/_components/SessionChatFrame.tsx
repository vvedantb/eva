import type { Doc, Id } from "@eva/backend";
import { useState, type ReactNode } from "react";
import { toast, useRequestConfirm } from "@vvedantb/ui";
import { useRepo } from "@/lib/contexts/RepoContext";
import { ChatPageWrapper } from "@/lib/components/ChatPageWrapper";
import type { SandboxChatState } from "@/lib/components/chat/SandboxChatPanel";
import type { SandboxChatBinding } from "@/lib/components/chat/sandboxChatBinding";
import { getSessionReadOnlyMessage } from "../_utils/sessionReadOnly";
import { useSessionChatHeader } from "./SessionChatHeader";
import {
  SessionReviewModal,
  useSendSessionForReview,
} from "./SessionReviewModal";

/**
 * The session page around its chat (`SandboxChatPanel` `frame`): header
 * (switcher, usage, commit & push, wake / sleep, menu) and the read-only
 * banner. A component, not a helper, because its header hook reads
 * the session's start error.
 */
export function SessionChatFrame({
  binding,
  session,
  chatId,
  state,
  isSandboxActive,
  isSandboxToggling,
  onSandboxToggle,
  isArchived,
  children,
}: {
  binding: SandboxChatBinding;
  session: Doc<"sessions">;
  chatId: Id<"sessionChats">;
  state: SandboxChatState;
  isSandboxActive: boolean;
  isSandboxToggling: boolean;
  onSandboxToggle: (action: "start" | "stop") => void;
  isArchived: boolean;
  children: ReactNode;
}) {
  const { repo } = useRepo();
  const sessionId = session._id;
  const [showReviewModal, setShowReviewModal] = useState(false);
  const { request: requestConfirm } = useRequestConfirm();
  const { sendForReview } = useSendSessionForReview(sessionId);
  const { headerLeft, headerRight } = useSessionChatHeader({
    repoId: repo._id,
    session,
    chatId,
    isExecuting: state.isExecuting,
    messageCount: state.messages?.length ?? 0,
    isSandboxActive,
    isSandboxToggling,
    sandboxGitSync: session.sandboxGitSync,
    isAssistantResponding: state.isExecuting,
    model: binding.model,
    providerAccountId: binding.providerAccountId,
    usageAccountLabel: state.usageAccountLabel,
    onSandboxToggle,
    onOpenReviewModal: () =>
      requestConfirm(
        () => setShowReviewModal(true),
        () => {
          void sendForReview().then((ok) => {
            if (ok) toast.success("Sent to the team for review.");
          });
        },
      ),
  });

  return (
    <ChatPageWrapper
      title={session.title}
      readOnlyMessage={getSessionReadOnlyMessage({
        isArchived,
        prState: session.prState,
      })}
      headerLeft={headerLeft}
      headerRight={headerRight}
    >
      {children}
      <SessionReviewModal
        sessionId={sessionId}
        open={showReviewModal}
        onClose={() => setShowReviewModal(false)}
      />
    </ChatPageWrapper>
  );
}
