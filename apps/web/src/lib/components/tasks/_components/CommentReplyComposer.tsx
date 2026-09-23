"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { UserInitials } from "@eva/shared/user-initials";
import { toast } from "@eva/ui";
import { tokenizedToEditable } from "@/lib/components/mentions";
import {
  CommentMentionInput,
  type CommentMentionInputHandle,
} from "./CommentMentionInput";
import { CommentSendButton } from "./CommentSendButton";
import { useDraftAutosave } from "@/lib/hooks/useDraftAutosave";
import { useTypingPresence } from "@/lib/hooks/useTypingPresence";
import { TypingIndicator } from "@/lib/components/chat/TypingIndicator";

interface CommentReplyComposerProps {
  taskId: Id<"agentTasks">;
  parentId: Id<"taskComments">;
}

/**
 * The reply field carries no box of its own: it is the last row of the thread
 * card, so the card's divider and padding already frame it. A bordered control
 * here read as a second, competing surface stacked inside the first.
 */
const REPLY_INPUT_CLASS =
  "min-h-8 max-h-36 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 py-1.5 shadow-none focus-visible:ring-0";

// ---------------------------------------------------------------------------
// Inner form — mounts only once the draft has resolved.
// ---------------------------------------------------------------------------

interface CommentReplyComposerFormProps extends CommentReplyComposerProps {
  initialContent: string | null;
}

function CommentReplyComposerForm({
  taskId,
  parentId,
  initialContent,
}: CommentReplyComposerFormProps) {
  const currentUserId = useQuery(api.auth.me);
  const mentionRef = useRef<CommentMentionInputHandle>(null);

  // Seed text + maps from draft via useState initializer (no hydration useEffect).
  const [
    {
      displayText: initialText,
      mentionMap: initialMentionMap,
      skillMap: initialSkillMap,
    },
  ] = useState(() => tokenizedToEditable(initialContent ?? ""));

  const [replyText, setReplyText] = useState(initialText);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createComment = useMutation(api.taskComments.create);

  const { save: saveDraft, clear: clearDraft } = useDraftAutosave(
    { kind: "taskComment", taskId, parentCommentId: parentId },
    mentionRef,
  );

  const { typingUsers, onActivity, stopTyping } = useTypingPresence(
    `typing:task-comment:${parentId}`,
    currentUserId,
  );

  const handleValueChange = (next: string) => {
    setReplyText(next);
    saveDraft(next);
    onActivity();
  };

  const canSubmit = replyText.trim().length > 0 && !isSubmitting;

  const handleSubmit = async () => {
    const trimmed = replyText.trim();
    if (!trimmed || isSubmitting) return;
    stopTyping();
    const content = mentionRef.current?.tokenize(trimmed) ?? trimmed;
    setIsSubmitting(true);
    try {
      await createComment({ taskId, content, parentId });
      // Read into a local and guarded with ifs rather than `?.`: React Compiler
      // bails on the whole file when an optional-chaining call sits inside a
      // try/catch.
      const mention = mentionRef.current;
      if (mention) mention.reset();
      setReplyText("");
      clearDraft();
      // Keep focus so a follow-up reply can be typed without re-clicking.
      if (mention) mention.focus();
    } catch (err) {
      console.error("Failed to post reply:", err);
      toast.error("Could not post the reply. Your text has been kept.");
    }
    setIsSubmitting(false);
  };

  return (
    <div className="relative flex items-start gap-2">
      <TypingIndicator
        users={typingUsers}
        className="absolute bottom-full left-0 mb-1"
      />
      {/* Fixed slot keeps the avatar from shifting the input once it loads;
          h-8 aligns it with the input's first line when multi-line. */}
      <span className="flex h-8 w-4 shrink-0 items-center justify-center">
        {currentUserId ? (
          <UserInitials userId={currentUserId} size="sm" hideLastSeen />
        ) : null}
      </span>
      <div className="flex min-h-8 min-w-0 flex-1 items-start gap-1">
        <CommentMentionInput
          ref={mentionRef}
          value={replyText}
          onValueChange={handleValueChange}
          onEnterSubmit={handleSubmit}
          placeholder="Leave a reply..."
          initialMentionMap={initialMentionMap}
          initialSkillMap={initialSkillMap}
          className={REPLY_INPUT_CLASS}
        />
        <CommentSendButton
          className="mt-0.5 shrink-0 text-muted-foreground"
          variant="outline"
          disabled={!canSubmit}
          isSubmitting={isSubmitting}
          onClick={handleSubmit}
          ariaLabel="Post reply"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outer shell — loads the draft, shows a disabled editor while loading.
// ---------------------------------------------------------------------------

/**
 * Persistent thread reply input, Linear-style: the current user's avatar, a
 * single-line "Leave a reply" field that grows as you type, and an always-
 * visible send button on the same row at the trailing end. Enter submits;
 * Shift+Enter inserts a newline.
 */
export function CommentReplyComposer({
  taskId,
  parentId,
}: CommentReplyComposerProps) {
  const draft = useQuery(api.drafts.getForTarget, {
    target: { kind: "taskComment", taskId, parentCommentId: parentId },
  });

  // While the draft query is pending, render a disabled placeholder with the
  // same layout so there is no shift when the form mounts.
  if (draft === undefined) {
    return (
      <div className="flex items-start gap-2">
        <span className="flex h-8 w-4 shrink-0 items-center justify-center" />
        <div className="flex min-h-8 min-w-0 flex-1 items-start">
          <CommentMentionInput
            value=""
            onValueChange={() => undefined}
            placeholder="Leave a reply..."
            disabled
            className={REPLY_INPUT_CLASS}
          />
        </div>
      </div>
    );
  }

  return (
    <CommentReplyComposerForm
      key="ready"
      taskId={taskId}
      parentId={parentId}
      initialContent={draft}
    />
  );
}
