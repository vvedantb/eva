"use client";

import { useRef, useState } from "react";
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
import { isOtherUserChatMessage, type MentionItem } from "@eva/shared";
import { ChatMessage } from "@/lib/components/chat/ChatMessage";
import type {
  ChatParentId,
  ChatRepo,
} from "@/lib/components/chat/chatBodyUtils";
import {
  CommentMentionInput,
  type CommentMentionInputHandle,
} from "@/lib/components/tasks/_components/CommentMentionInput";
import { CommentSendButton } from "@/lib/components/tasks/_components/CommentSendButton";

/**
 * The mention id the coordinator chat's picker gives Eva. A reply wakes her
 * only when it @mentions her (projects v2, decision 2).
 * TODO(v2 PR A): use `EVA_MENTION_ITEM` from `@eva/shared` once it lands.
 */
const EVA_MENTION_ITEMS: MentionItem[] = [
  { id: "eva_coordinator_mention", label: "Eva", badge: "Coordinator" },
];

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
  onOpen,
  onClose,
}: {
  rootId: string;
  /** The chat the thread belongs to: its other threads for ↑ and ↓. */
  chatParentId: ChatParentId;
  repo: ChatRepo;
  /** The chat's composer model: a reply that wakes Eva runs on it. */
  model: AIModel;
  onOpen: (rootId: string) => void;
  onClose: () => void;
}) {
  const thread = useQuery(api.messages.listReplies, { rootId });
  const currentUserId = useQuery(api.auth.me);
  const roots = useQuery(api.messages.listThreadRoots, {
    parentId: chatParentId,
  });
  const index = roots ? roots.findIndex((id) => id === rootId) : -1;
  const previousRootId = index > 0 && roots ? roots[index - 1] : undefined;
  const nextRootId =
    index !== -1 && roots ? roots[index + 1] : undefined;

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
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
          <div className="flex flex-col gap-3 p-3">
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
                    />
                  </div>
                ))
              : null}
          </div>
        </div>
      )}
      <div className="shrink-0 p-3 pt-0">
        <ReplyComposer key={rootId} rootId={rootId} model={model} />
      </div>
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
        extraPeopleItems={EVA_MENTION_ITEMS}
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
