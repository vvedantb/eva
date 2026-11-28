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
 * One session chat's send, bound to the chat. Sends go through `chats.send`,
 * as on the phone: the server decides whether the message runs now or waits
 * (a running turn, a free parallel-chat slot, a usage limit, Eva asleep), so
 * the composer never has to know the session-wide cap. A send the client
 * expects to start paints the user bubble and opens the turn at once; the
 * server's rows replace that paint when the mutation lands. `accounts` labels
 * the optimistic user bubble's credential. A quick task's chat passes a
 * resolver until its session exists (`useTaskSession`).
 */
export function useSessionTurnPorts(
  chat: SessionChatSource,
  accounts: ReadonlyArray<ModelAccount>,
): SandboxTurnPorts {
  const send = useMutation(api.chats.send);
  const postSendError = useMutation(api.sessions.postSendError);
  return {
    send: (args, expected) =>
      withSessionChat(chat, (chatId) => {
        const sendToChat =
          expected === "start"
            ? send.withOptimisticUpdate((localStore) => {
                insertSentTurnOptimistically(localStore, chatId, args, accounts);
                openChatTurnOptimistically(localStore, chatId);
              })
            : send;
        return sendToChat({ target: chatId, ...args });
      }),
    postError: (content) =>
      withSessionChat(chat, (chatId) =>
        postSendError({ chatId, content }),
      ),
  };
}
