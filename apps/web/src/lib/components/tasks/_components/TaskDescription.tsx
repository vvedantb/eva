"use client";

import { useState, useRef } from "react";
import { cn } from "@eva/ui";
import { Button } from "@vvedantb/ui";
import { IconPencil } from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { useRepo } from "@/lib/contexts/RepoContext";
import { MarkdownMentionText } from "@/lib/components/chat/MarkdownMentionText";
import {
  DescriptionMentionEditor,
  type DescriptionMentionEditorHandle,
} from "./DescriptionMentionEditor";
import { ReactionBar } from "./ReactionBar";
import { EmojiReactionPicker } from "./EmojiReactionPicker";
import { useReactions } from "./TaskReactionsProvider";
import { taskTextLockReason } from "./task-detail-constants";

/**
 * Descriptions are authored and stored as Markdown. Legacy/imported content can
 * carry stray HTML (e.g. `<p>` wrappers from Linear) which Markdown should not
 * contain — strip those tags so they don't render literally, turning block tags
 * into line breaks. Non-tag angle brackets (e.g. `<3`) are preserved.
 */
function stripHtml(raw: string): string {
  return raw
    .replace(/<\/(p|div|li)>\s*/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function TaskDescription({
  description,
  canEditTaskText,
  hasActiveRun,
  taskId,
  inline: _inline,
}: {
  description: string | undefined;
  canEditTaskText: boolean;
  hasActiveRun: boolean;
  taskId: Id<"agentTasks">;
  /** Kept for call-site compatibility; description no longer uses a nested max-height scroll. */
  inline: boolean;
}) {
  const { repo, basePath } = useRepo();
  const { groups, toggle } = useReactions("description", taskId);
  const [isEditing, setIsEditing] = useState(false);
  const mentionRef = useRef<DescriptionMentionEditorHandle>(null);

  const updateTask = useMutation(api.agentTasks.update).withOptimisticUpdate(
    (localStore, args) => {
      const cached = localStore.getQuery(api.agentTasks.get, { id: taskId });
      if (cached) {
        const {
          id: _id,
          priority,
          projectId,
          assignedTo,
          providerAccountId,
          ...safeFields
        } = args;
        localStore.setQuery(
          api.agentTasks.get,
          { id: taskId },
          {
            ...cached,
            ...safeFields,
            ...(priority !== undefined
              ? { priority: priority ?? undefined }
              : {}),
            ...(projectId !== undefined
              ? { projectId: projectId ?? undefined }
              : {}),
            ...(assignedTo !== undefined
              ? { assignedTo: assignedTo ?? undefined }
              : {}),
            ...(providerAccountId !== undefined
              ? { providerAccountId: providerAccountId ?? undefined }
              : {}),
          },
        );
      }
    },
  );

  const desc = stripHtml(description ?? "");
  const [editValue, setEditValue] = useState(desc);

  // Keep the draft synced to the server text while not editing.
  if (!isEditing && editValue !== desc) {
    setEditValue(desc);
  }

  const handleSave = () => {
    const tokenized = mentionRef.current?.tokenize(editValue) ?? editValue;
    const trimmed = tokenized.trim();
    if (canEditTaskText && trimmed !== desc) {
      updateTask({ id: taskId, description: trimmed });
    }
    setIsEditing(false);
  };

  const handleClick = () => {
    if (!isEditing && canEditTaskText) {
      setEditValue(desc);
      setIsEditing(true);
    }
  };

  const isEmptyPlaceholder = !isEditing && !desc;

  return (
    <div className="group">
      {/* The rendered description can contain links and mentions, so the
          click-to-edit target cannot be a stretched `<button>` overlay the way
          `<ListRow>` does it — the overlay would swallow every link. The div
          click stays as a pointer convenience; the keyboard path is the
          placeholder button below (empty description) or the explicit Edit
          button in the reaction row (non-empty). */}
      <div
        onClick={isEmptyPlaceholder ? undefined : handleClick}
        title={
          !isEditing && !canEditTaskText
            ? taskTextLockReason(hasActiveRun, "Description")
            : undefined
        }
        className={cn(
          "min-h-6 overflow-x-hidden rounded px-2 py-1 -mx-2 -my-1",
          !isEditing &&
            canEditTaskText &&
            !isEmptyPlaceholder &&
            "cursor-pointer hover:bg-muted/50",
        )}
      >
        {isEditing ? (
          <div>
            <DescriptionMentionEditor
              ref={mentionRef}
              value={editValue}
              onValueChange={setEditValue}
              onBlur={handleSave}
              placeholder="Add description..."
              minHeight="min-h-[160px]"
              className="rounded-none border-0 px-0 py-0 shadow-none focus-visible:ring-0"
            />
          </div>
        ) : desc ? (
          <MarkdownMentionText
            text={desc}
            repoBasePath={basePath}
            repoId={repo._id}
            className="text-sm text-muted-foreground wrap-break-word [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
          />
        ) : canEditTaskText ? (
          // Nothing to click through to yet, so the placeholder itself is the
          // control — a real button, reachable by keyboard and touch.
          <button
            type="button"
            onClick={handleClick}
            className="rounded text-sm text-muted-foreground/60 max-sm:flex max-sm:min-h-10 max-sm:w-full max-sm:items-center max-sm:text-left max-sm:hover:bg-muted/50"
          >
            Add description...
          </button>
        ) : (
          <p className="text-sm text-muted-foreground/60">No description</p>
        )}
      </div>

      {/* Reactions live outside the click-to-edit area so toggling a reaction
          never enters edit mode. Only shown when there's description content. */}
      {!isEditing && desc ? (
        <div className="mt-1.5 max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-1">
          {groups.length > 0 ? (
            <ReactionBar groups={groups} toggle={toggle} />
          ) : (
            <EmojiReactionPicker
              onSelect={toggle}
              variant="ghost"
              alwaysVisible
            />
          )}
          {canEditTaskText ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={handleClick}
              aria-label="Edit description"
              // Touch-only: desktop still edits by clicking the description text,
              // exactly as before, and a hover-revealed pencil there would be new
              // chrome on a surface this work was not meant to touch.
              className="text-muted-foreground sm:hidden"
            >
              <IconPencil size={14} />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
