"use client";

import { useState, useRef } from "react";
import { cn } from "@eva/ui";
import { Button } from "@vvedantb/ui";
import { IconPencil } from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { patchLoadedQuery } from "@vvedantb/server";
import { useRepo } from "@/lib/contexts/RepoContext";
import { MarkdownMentionText } from "@/lib/components/chat/MarkdownMentionText";
import {
  DescriptionMentionEditor,
  type DescriptionMentionEditorHandle,
} from "./DescriptionMentionEditor";
import { ReactionBar } from "./ReactionBar";
import { EmojiReactionPicker } from "./EmojiReactionPicker";
import { useReactions } from "./TaskReactionsProvider";
import { taskTextLockReason } from "@eva/shared/taskDetail";

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
  inline: boolean;
}) {
  const { repo, basePath } = useRepo();
  const { groups, toggle } = useReactions("description", taskId);
  const [isEditing, setIsEditing] = useState(false);
  const mentionRef = useRef<DescriptionMentionEditorHandle>(null);

  const updateTask = useMutation(api.agentTasks.update).withOptimisticUpdate(
    (localStore, args) => {
      const {
        id: _id,
        priority,
        projectId,
        assignedTo,
        providerAccountId,
        ...safeFields
      } = args;
      patchLoadedQuery(
        localStore,
        api.agentTasks.get,
        { id: taskId },
        (cached) =>
          cached && {
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
    },
  );

  const desc = stripHtml(description ?? "");
  const [editValue, setEditValue] = useState(desc);

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
