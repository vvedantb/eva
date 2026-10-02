"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "@eva/ui";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { tokenizedToEditable } from "@/lib/components/mentions";
import {
  CommentMentionInput,
  type CommentMentionInputHandle,
} from "./CommentMentionInput";
import { CommentSendButton } from "./CommentSendButton";
import { useDraftAutosave } from "@/lib/hooks/useDraftAutosave";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useTypingPresence } from "@/lib/hooks/useTypingPresence";
import { TypingIndicator } from "@/lib/components/chat/TypingIndicator";

export interface TaskActivityComposerFormProps {
  taskId: Id<"agentTasks">;
  initialContent: string | null;
}

const COMMENT_EDITOR_CLASS =
  "min-h-14 max-h-44 rounded-none border-0 bg-transparent px-3.5 py-3 shadow-none focus-visible:ring-0 transition-[background-color]";

// Inner form — mounts only once the draft has resolved. Seeds text and maps
// from the draft initializer so there is no hydration useEffect.
export function TaskActivityComposerForm({
  taskId,
  initialContent,
}: TaskActivityComposerFormProps) {
  // Seed text + maps from draft once, via useState initializer.
  const [
    {
      displayText: initialText,
      mentionMap: initialMentionMap,
      skillMap: initialSkillMap,
    },
  ] = useState(() => tokenizedToEditable(initialContent ?? ""));

  const [commentText, setCommentText] = useState(initialText);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const mentionRef = useRef<CommentMentionInputHandle>(null);

  const createComment = useMutation(api.taskComments.create);
  const currentUserId = useQuery(api.auth.me);
  const { typingUsers, onActivity, stopTyping } = useTypingPresence(
    `typing:task:${taskId}`,
    currentUserId,
  );

  const { save: saveDraft, clear: clearDraft } = useDraftAutosave(
    { kind: "taskComment", taskId },
    mentionRef,
  );

  const handleValueChange = (next: string) => {
    setCommentText(next);
    saveDraft(next);
    onActivity();
  };

  const tokenizeAndReset = (raw: string): string => {
    const tokenized = mentionRef.current?.tokenize(raw) ?? raw;
    mentionRef.current?.reset();
    return tokenized;
  };

  const handleAddComment = async () => {
    const text = commentText.trim();
    if (!text || isSubmitting) return;
    const content = tokenizeAndReset(text);
    setCommentText("");
    clearDraft();
    stopTyping();
    setIsSubmitting(true);
    try {
      await createComment({ taskId, content });
    } catch (err) {
      console.error("Failed to add comment:", err);
      toast.error("Could not post the comment. Try again.");
    }
    setIsSubmitting(false);
  };

  return (
    <div className="relative space-y-3">
      <TypingIndicator
        users={typingUsers}
        className="absolute bottom-full left-0 mb-1"
      />
      {/* Focus is a single hairline, not a halo: the ring stays at width 1 and
          the border darkens, so the active box weighs the same as the resting
          one. A 2px ring read as a heavy blue slab around the card. */}
      <div className="overflow-hidden rounded-surface border border-input bg-card transition-[border-color,box-shadow] hover:border-ring/25 focus-within:border-ring/45 focus-within:ring-1 focus-within:ring-ring/20">
        <CommentMentionInput
          ref={mentionRef}
          value={commentText}
          onValueChange={handleValueChange}
          placeholder="Add a comment..."
          initialMentionMap={initialMentionMap}
          initialSkillMap={initialSkillMap}
          className={COMMENT_EDITOR_CLASS}
        />
        <div className="flex items-center justify-end gap-2 px-2.5 pb-2.5">
          <CommentSendButton
            size="icon-sm"
            disabled={!commentText.trim() || isSubmitting}
            isSubmitting={isSubmitting}
            onClick={handleAddComment}
            ariaLabel="Add comment"
            quietWhenDisabled
          />
        </div>
      </div>
    </div>
  );
}
