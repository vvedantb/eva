import { api } from "@eva/backend";
import type { ModelAccount } from "@vvedantb/ui";
import { useMutation } from "convex/react";
import {
  withSessionChat,
  type SandboxTurnPorts,
  type SessionChatSource,
} from "@/lib/components/chat/sandboxChatTurn";
import { insertSentTurnOptimistically } from "@/lib/components/chat/useChatSend";
import { openChatTurnOptimistically } from "@/lib/components/chat/useChatTurnOpen";

/**
 * One session chat tab's turn mutations, bound to the tab. `startExecute`
 * itself decides whether the message runs now or waits for a free
 * parallel-chat slot, so the composer never has to know the session-wide cap.
 * `accounts` labels the optimistic user bubble's credential. A quick task's
 * chat passes a resolver until its session exists (`useTaskSession`).
 */
export function useSessionTurnPorts(
  chat: SessionChatSource,
  accounts: ReadonlyArray<ModelAccount>,
): SandboxTurnPorts {
  const addMessage = useMutation(api.sessions.addMessage).withOptimisticUpdate(
    (localStore, args) =>
      insertSentTurnOptimistically(localStore, args.chatId, args, accounts),
  );
  const startExecution = useMutation(
    api.sessionWorkflow.startExecute,
  ).withOptimisticUpdate((localStore, args) =>
    openChatTurnOptimistically(localStore, args.chatId),
  );
  const enqueueMessage = useMutation(api.sessionWorkflow.enqueueMessage);
  return {
    add: (args) =>
      withSessionChat(chat, (chatId) =>
        addMessage({ chatId, ...args, role: args.role ?? "user" }),
      ),
    start: (args, { attachmentStorageIds, sourceProposedPlanId }) =>
      withSessionChat(chat, (chatId) =>
        startExecution({
          chatId,
          ...args,
          attachmentStorageIds,
          ...(sourceProposedPlanId !== undefined
            ? { sourceProposedPlanId }
            : {}),
        }),
      ),
    enqueue: (args) =>
      withSessionChat(chat, (chatId) => enqueueMessage({ chatId, ...args })),
  };
}
