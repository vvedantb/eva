"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useLocalStorage } from "usehooks-ts";
import { api, type Id } from "@eva/backend";
import { toast } from "@eva/ui";
import {
  findStreamingTargetMessage,
  type ChatBodyMessage,
} from "@/lib/components/chat/chatBodyUtils";
import type { LocalChatDraft } from "@/lib/components/chat/ChatComposer";
import { tokenizedToEditable } from "@/lib/components/mentions";
import { splitAveFollowUps } from "@/lib/components/ave/aveFollowUps";
import { catchMutationError } from "@/lib/utils/mutationToast";

/** One Manager Ave per user, so one draft per browser. */
const DRAFT_STORAGE_KEY = "eva:ave-draft";

/**
 * Manager Ave's live thread: transcript, streaming turn, send and cancel.
 *
 * A sent message shows at once as a local row keyed by its `clientId`. The
 * server row carries the same `clientId`, so the local copy drops out the
 * moment the real one lands — and on failure, so the composer keeps the text
 * (a rejected `onSend` leaves PromptInput's draft in place).
 */
export function useAveChat() {
  const thread = useQuery(api.ave.getThread, {});
  const serverMessages = useQuery(api.ave.listMessages, {});
  const streaming = useQuery(api.ave.getStreaming, {});
  const sendMessage = useMutation(api.ave.send);
  const cancelRun = useMutation(api.ave.cancel);
  // Client-owned until the server echoes it back; nothing else can hold it.
  const [pendingSends, setPendingSends] = useState<ChatBodyMessage[]>([]);
  const [draft, setDraft] = useLocalStorage(DRAFT_STORAGE_KEY, "");

  const isExecuting = thread?.status === "running";

  const settled: ChatBodyMessage[] = serverMessages ?? [];
  const echoedClientIds = new Set(
    settled.flatMap((message) =>
      message.clientId === undefined ? [] : [message.clientId],
    ),
  );
  const withPending = [
    ...settled,
    ...pendingSends.filter(
      (message) =>
        message.clientId === undefined ||
        !echoedClientIds.has(message.clientId),
    ),
  ];

  const { transcript, followUps } = splitAveFollowUps(withPending, isExecuting);

  // The run streams into `getStreaming`, which ChatBody paints onto the oldest
  // unfinished assistant row. If the run has not written one yet, a local
  // "Working" row stands in so the live activity has somewhere to render.
  const lastMessage = transcript[transcript.length - 1];
  const workingPlaceholder: ChatBodyMessage = {
    _id: "ave-working",
    _creationTime: (lastMessage?._creationTime ?? 0) + 1,
    role: "assistant",
    content: "",
    timestamp: (lastMessage?.timestamp ?? 0) + 1,
  };
  const messages =
    isExecuting && findStreamingTargetMessage(transcript) === undefined
      ? [...transcript, workingPlaceholder]
      : transcript;

  const dropPending = (clientId: string) => {
    setPendingSends((current) =>
      current.filter((message) => message.clientId !== clientId),
    );
  };

  const send = async (
    content: string,
    attachmentStorageIds?: Id<"_storage">[],
  ) => {
    if (attachmentStorageIds !== undefined && attachmentStorageIds.length > 0) {
      toast.error("Manager Ave can't read attachments", {
        id: "ave-attachments",
        description: "Remove them and send the message as text.",
      });
      // Rejecting keeps the text and the files in the composer.
      throw new Error("Manager Ave does not accept attachments");
    }
    const clientId = crypto.randomUUID();
    const now = Date.now();
    setPendingSends((current) => [
      ...current,
      {
        _id: `ave-pending-${clientId}`,
        _creationTime: now,
        role: "user",
        content,
        timestamp: now,
        clientId,
      },
    ]);
    // No `finally`: React Compiler bails on the whole file when it meets one.
    try {
      await catchMutationError(
        sendMessage({ content, clientId }),
        "Couldn't send to Manager Ave",
        "ave-send",
      );
    } catch (error) {
      dropPending(clientId);
      throw error;
    }
    dropPending(clientId);
  };

  const cancel = async () => {
    await catchMutationError(
      cancelRun({}),
      "Couldn't stop Manager Ave",
      "ave-cancel",
    );
  };

  const {
    displayText: draftDisplay,
    mentionMap: draftMentionMap,
    skillMap: draftSkillMap,
  } = tokenizedToEditable(draft);
  const localDraft: LocalChatDraft = {
    initialDisplay: draftDisplay,
    mentionMap: draftMentionMap,
    skillMap: draftSkillMap,
    onSave: setDraft,
  };

  return {
    /** Scopes typing presence and scroll state; stable before the first send. */
    conversationId: thread?._id ?? "ave",
    messages,
    /** Sent mid-run; the next run reads them. */
    followUps,
    isLoadingMessages: serverMessages === undefined,
    streamingActivity: streaming?.currentActivity,
    streamingContent: streaming?.currentContent,
    isExecuting,
    send,
    cancel,
    localDraft,
  };
}
