"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import {
  IconChevronDown,
  IconChevronUp,
  IconMessages,
  IconX,
} from "@tabler/icons-react";
import { Button, ConversationEmptyState, toast } from "@vvedantb/ui";
import { api, type AIModel } from "@eva/backend";
import {
  chatStreamingEntityId,
  EVA_MENTION_ITEM,
  findStreamingTargetMessage,
  isOtherUserChatMessage,
  threadAnswerContent,
  threadPendingQuestion,
} from "@eva/shared";
import {
  parsePendingQuestion,
  type ParsedQuestion,
} from "@eva/shared/pendingQuestion";
import { ChatMessage } from "@/lib/components/chat/ChatMessage";
import { ChatQuestionDock } from "@/lib/components/chat/ChatQuestionDock";
import type {
  ChatParentId,
  ChatRepo,
} from "@/lib/components/chat/chatBodyUtils";
import {
  CommentMentionInput,
  type CommentMentionInputHandle,
} from "@/lib/components/tasks/_components/CommentMentionInput";
import { CommentSendButton } from "@/lib/components/tasks/_components/CommentSendButton";

/** Rows in a thread never expand a changed-files card; one shared no-op. */
function ignoreExpand(): void {}

/**
 * A reply thread in the side panel beside the coordinator chat, Slack style:
 * the message on top, its replies below in the chat's own bubbles, and a
 * composer pinned at the bottom. ↑ and ↓ step to the previous and next thread
 * in the chat; ✕ or Escape closes.
 */
export function ReplyThreadView({
  rootId,
  chatParentId,
  repo,
  model,
  isOpen,
  onOpen,
  onClose,
}: {
  rootId: string;
  /** The chat the thread belongs to: its other threads for ↑ and ↓. */
  chatParentId: ChatParentId;
  repo: ChatRepo;
  /** The chat's composer model: a reply that wakes Eva runs on it. */
  model: AIModel;
  /** The panel is on screen: Escape anywhere on the page closes it. */
  isOpen: boolean;
  onOpen: (rootId: string) => void;
  onClose: () => void;
}) {
  const thread = useQuery(api.messages.listReplies, { rootId });
  // Eva's turn in this thread streams on the chat's row: her open bubble here
  // shows it, as the chat shows a turn of its own.
  const streaming = useQuery(api.streaming.get, {
    entityId: chatStreamingEntityId(chatParentId),
  });
  const streamingTargetId = thread
    ? findStreamingTargetMessage(thread.replies)?._id
    : undefined;
  // Eva's question from a turn in this thread is answered here, not in the
  // chat: a blocking one resumes her turn, a saved one goes as an @Eva reply.
  const threadTurn = useQuery(api.messages.openThreadTurn, {
    parentId: chatParentId,
  });
  const isTurnThread = threadTurn?.rootId === rootId;
  const blocking = useQuery(
    api.pendingQuestions.getActive,
    isTurnThread ? { entityId: chatParentId } : "skip",
  );
  const savedQuestionRaw = thread
    ? threadPendingQuestion({
        isTurnThread,
        streamingQuestion: streaming?.pendingQuestion,
        replies: thread.replies,
      })
    : undefined;
  // Escape from anywhere (focus often stays on the "N replies" link in the
  // chat), unless something on top already took it (a menu, a dialog).
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);
  const currentUserId = useQuery(api.auth.me);
  const roots = useQuery(api.messages.listThreadRoots, {
    parentId: chatParentId,
  });
  const index = roots ? roots.findIndex((id) => id === rootId) : -1;
  const previousRootId = index > 0 && roots ? roots[index - 1] : undefined;
  const nextRootId =
    index !== -1 && roots ? roots[index + 1] : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 px-3">
        <IconMessages className="size-4 text-muted-foreground" />
        <span className="flex-1 text-sm font-medium">Replies</span>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Previous thread"
          disabled={previousRootId === undefined}
          onClick={() => {
            if (previousRootId) onOpen(previousRootId);
          }}
        >
          <IconChevronUp className="size-4" />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Next thread"
          disabled={nextRootId === undefined}
          onClick={() => {
            if (nextRootId) onOpen(nextRootId);
          }}
        >
          <IconChevronDown className="size-4" />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Close thread"
          onClick={onClose}
        >
          <IconX className="size-4" />
        </Button>
      </div>
      {thread === null ? (
        <ConversationEmptyState
          icon={<IconMessages className="size-10 text-muted-foreground/60" />}
          title="This message is gone."
        />
      ) : (
        // A plain scroll area: a thread is short, and the chat's stick-to-
        // bottom container showed "Scroll to end" over three replies.
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-3 p-3 pt-6">
            {thread
              ? [thread.root, ...thread.replies].map((message, index) => (
                  <div
                    key={message._id}
                    className={index === 0 ? "pb-2" : undefined}
                  >
                    <ChatMessage
                      message={message}
                      animateIn={false}
                      repo={repo}
                      isLatestAssistantTurn={false}
                      showChangedFiles={false}
                      onChangedFilesExpandedChange={ignoreExpand}
                      isOtherUser={isOtherUserChatMessage(
                        message,
                        currentUserId ?? undefined,
                      )}
                      assistantBubble
                      streamingActivity={
                        message._id === streamingTargetId
                          ? streaming?.currentActivity
                          : undefined
                      }
                      streamingContent={
                        message._id === streamingTargetId
                          ? streaming?.currentContent
                          : undefined
                      }
                    />
                  </div>
                ))
              : null}
          </div>
        </div>
      )}
      <ThreadDock
        key={rootId}
        rootId={rootId}
        chatParentId={chatParentId}
        model={model}
        blocking={blocking ?? null}
        savedQuestionRaw={savedQuestionRaw}
      />
    </div>
  );
}

/**
 * The thread's bottom slot, as the chat's: Eva's open question takes the
 * composer's place until it is answered. A blocking one wins, as in the chat.
 */
function ThreadDock({
  rootId,
  chatParentId,
  model,
  blocking,
  savedQuestionRaw,
}: {
  rootId: string;
  chatParentId: ChatParentId;
  model: AIModel;
  blocking: { toolUseId: string; payload: string } | null;
  savedQuestionRaw: string | undefined;
}) {
  // The saved question just answered: hidden until Eva's reply moves on.
  const [answeredKey, setAnsweredKey] = useState<string | null>(null);
  const [isAnswering, setIsAnswering] = useState(false);
  const addReply = useMutation(api.sessionWorkflow.addReply);
  const answerBlocking = useMutation(api.pendingQuestions.answer);
  const blockingQuestions = blocking
    ? parsePendingQuestion(blocking.payload)
    : null;
  const savedQuestions =
    savedQuestionRaw !== undefined && savedQuestionRaw !== answeredKey
      ? parsePendingQuestion(savedQuestionRaw)
      : null;
  const questions: ParsedQuestion[] | null = blockingQuestions ?? savedQuestions;

  const answerAsReply = async (answer: string) => {
    if (savedQuestionRaw !== undefined) setAnsweredKey(savedQuestionRaw);
    setIsAnswering(true);
    try {
      await addReply({ rootId, content: threadAnswerContent(answer), model });
    } catch (error) {
      setAnsweredKey(null);
      setIsAnswering(false);
      throw error;
    }
    setIsAnswering(false);
  };

  const answerStructured = async (answers: Record<string, string>) => {
    if (!blocking) return;
    setIsAnswering(true);
    try {
      await answerBlocking({
        entityId: chatParentId,
        toolUseId: blocking.toolUseId,
        answer: JSON.stringify(answers),
      });
    } catch (error) {
      setIsAnswering(false);
      throw error;
    }
    setIsAnswering(false);
  };

  if (questions) {
    return (
      <ChatQuestionDock
        questions={questions}
        onAnswer={answerAsReply}
        {...(blockingQuestions ? { onAnswerStructured: answerStructured } : {})}
        isLoading={isAnswering}
      />
    );
  }
  return (
    <div className="shrink-0 p-3 pt-0">
      <ReplyComposer rootId={rootId} model={model} />
    </div>
  );
}

/** The reply field: people and data mentions, plus @Eva to bring her in. */
function ReplyComposer({
  rootId,
  model,
}: {
  rootId: string;
  model: AIModel;
}) {
  const mentionRef = useRef<CommentMentionInputHandle>(null);
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const addReply = useMutation(api.sessionWorkflow.addReply);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSubmitting) return;
    const mention = mentionRef.current;
    const content = mention ? mention.tokenize(trimmed) : trimmed;
    setIsSubmitting(true);
    try {
      await addReply({ rootId, content, model });
      if (mention) mention.reset();
      setText("");
      if (mention) mention.focus();
    } catch (err) {
      console.error("Failed to post reply:", err);
      toast.error("Could not post the reply. Your text has been kept.");
    }
    setIsSubmitting(false);
  };

  return (
    <div className="flex items-end gap-2 rounded-surface bg-card px-3 py-2">
      <CommentMentionInput
        ref={mentionRef}
        value={text}
        onValueChange={setText}
        onEnterSubmit={handleSubmit}
        placeholder="Reply…"
        // A reply wakes Eva only when it @mentions her (projects v2, decision 2).
        extraPeopleItems={[EVA_MENTION_ITEM]}
        className="min-h-8 max-h-36 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 py-1.5 shadow-none focus-visible:ring-0"
      />
      <CommentSendButton
        className="mb-0.5 shrink-0"
        disabled={text.trim().length === 0 || isSubmitting}
        isSubmitting={isSubmitting}
        onClick={handleSubmit}
        ariaLabel="Send reply"
      />
    </div>
  );
}
