"use client";

import { CommandItem } from "@eva/ui";
import { IconFile, IconFileText, IconX } from "@tabler/icons-react";
import { relativeTime } from "@/lib/components/artifacts/_format";
import { isImageContentType } from "@/lib/components/attachments/attachmentMeta";
import { tokenizedToEditable } from "@/lib/components/mentions";
import type { PromptStashEntry } from "@/lib/components/chat/_components/useComposerStash";

function previewSnippet(tokenized: string, maxLength = 90): string {
  const { displayText } = tokenizedToEditable(tokenized);
  const singleLine = displayText.replace(/\s+/g, " ").trim();
  if (singleLine.length === 0) return "(attachments only)";
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength - 1)}…`;
}

/** One stash row in the drawer: file mark, snippet, attachments, age, delete. */
export function ComposerStashItem({
  entry,
  onSelect,
  onDelete,
}: {
  entry: PromptStashEntry;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <CommandItem
      value={entry._id}
      onSelect={onSelect}
      className="group flex cursor-pointer items-center gap-2 text-xs aria-selected:bg-muted"
    >
      <IconFileText
        aria-hidden
        className="size-3.5 shrink-0 text-muted-foreground"
      />
      <span className="min-w-0 flex-1 truncate text-foreground">
        {previewSnippet(entry.content)}
      </span>
      {entry.attachments.length > 0 ? (
        <span className="flex shrink-0 items-center gap-1">
          {entry.attachments.slice(0, 3).map((attachment) =>
            isImageContentType(attachment.contentType) ? (
              <img
                key={attachment.url}
                src={attachment.url}
                alt=""
                aria-hidden
                className="size-4 rounded object-cover"
              />
            ) : (
              <IconFile
                key={attachment.url}
                aria-hidden
                className="size-3.5 text-muted-foreground"
              />
            ),
          )}
        </span>
      ) : null}
      <span className="shrink-0 text-muted-foreground tabular-nums">
        {relativeTime(entry._creationTime)}
      </span>
      <button
        type="button"
        aria-label="Delete stash"
        className="reveal-on-hover max-sm:hit-target shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <IconX className="size-3.5" />
      </button>
    </CommandItem>
  );
}
