import { api, type Doc, type Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { useState, type ReactNode } from "react";
import { toast, useRequestConfirm } from "@vvedantb/ui";
import { useRepo } from "@/lib/contexts/RepoContext";
import { ChatPageWrapper } from "@/lib/components/ChatPageWrapper";
import type { SandboxChatState } from "@/lib/components/chat/SandboxChatPanel";
import type { SandboxChatBinding } from "@/lib/components/chat/sandboxChatBinding";
import { getSessionReadOnlyMessage } from "../_utils/sessionReadOnly";
import { ChatTabsBar } from "./ChatTabsBar";
import { useSessionChatHeader } from "./SessionChatHeader";
import {
  SessionReviewModal,
  useSendSessionForReview,
} from "./SessionReviewModal";

export type ChatTurnStatus = FunctionReturnType<
  typeof api.turns.listSessionChatStatuses
>[number];

/**
 * The session page around its chat (`SandboxChatPanel` `frame`): header
 * (switcher, usage, commit & push, wake / sleep, menu), the read-only banner
 * and the chat tabs. A component, not a helper, because its header hook reads
 * the session's start error.
 */
export function SessionChatFrame({
  binding,
  session,
  chatId,
  state,
  chats,
  chatStatuses,
  onSelectChat,
  onCreateChat,
  isCreatingChat,
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
  chats: Doc<"sessionChats">[];
  /** Open turns across the session's chats (tab dots, Fork session gate). */
  chatStatuses: ChatTurnStatus[];
  onSelectChat: (chat: Doc<"sessionChats">) => void;
  onCreateChat: () => void;
  isCreatingChat: boolean;
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
  const runningChatIds = new Set<string>(
    chatStatuses.map((status) => status.chatId),
  );
  const { headerLeft, headerRight } = useSessionChatHeader({
    repoId: repo._id,
    session,
    chatId,
    isAnyChatExecuting: runningChatIds.size > 0,
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
      tabs={
        <ChatTabsBar
          chats={chats}
          activeChatId={chatId}
          runningChatIds={runningChatIds}
          onSelect={onSelectChat}
          onCreate={onCreateChat}
          isReadOnly={isArchived}
          isCreating={isCreatingChat}
        />
      }
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
