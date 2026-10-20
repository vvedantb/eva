"use client";

import { useState } from "react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from "@eva/ui";
import {
  IconBookmark,
  IconBookmarkFilled,
  IconPencil,
  IconQuote,
  IconX,
} from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import {
  citationPreview,
  type AssistantCitation,
} from "@/lib/components/chat/assistantCitation";
import type { ChatParentId } from "@/lib/components/chat/chatBodyUtils";
import { messageLinkUrl } from "@/lib/components/chat/messageLink";
import { usePendingCitations } from "@/lib/contexts/PendingCitationsContext";

/** Quote + comment: editing the comment after a save makes it savable again. */
function savedKey(citation: AssistantCitation): string {
  return `${citation.id}\n${citation.comment}`;
}

/**
 * `chatParentId` enables the bookmark, which saves the quote and its comment
 * as a note in the chat's Log (Documents tab). Chats without one (Manager
 * Ave) have no Log, so the button is hidden.
 */
export function PendingCitationChips({
  chatParentId,
}: {
  chatParentId?: ChatParentId;
}) {
  const citations = usePendingCitations();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  // Per chip, not on the citation: a save never changes what gets sent.
  const [savedKeys, setSavedKeys] = useState<ReadonlySet<string>>(new Set());
  const saveQuote = useMutation(api.chatLog.saveQuote);

  if (!citations || citations.items.length === 0) return null;

  function save(citation: AssistantCitation, parentId: ChatParentId) {
    const key = savedKey(citation);
    void saveQuote({
      chatParentId: parentId,
      quote: citation.text,
      comment: citation.comment,
      messageUrl: messageLinkUrl(citation.messageId),
    }).then(
      () => {
        setSavedKeys((current) => new Set(current).add(key));
        toast.success("Saved to Documents");
      },
      () => toast.error("Couldn't save that quote"),
    );
  }

  return (
    <div className="mb-2 flex flex-wrap gap-1.5" data-testid="citation-chips">
      {citations.items.map((citation) => {
        const label = citationPreview(citation);
        return (
          <span
            key={citation.id}
            className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-card py-0.5 pl-2 pr-1 text-xs text-foreground"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex min-w-0 flex-1 items-center gap-1 hover:text-foreground"
                  onClick={() => citations.reveal(citation.messageId)}
                >
                  <IconQuote className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="max-w-[calc(100vw-2rem)] whitespace-pre-wrap sm:max-w-96"
              >
                {citation.comment.trim()
                  ? `${citation.text}\n\n${citation.comment}`
                  : citation.text}
              </TooltipContent>
            </Tooltip>
            <Popover
              open={editingId === citation.id}
              onOpenChange={(open) => {
                if (open) {
                  setEditingId(citation.id);
                  setDraft(citation.comment);
                  return;
                }
                setEditingId(null);
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="hit-target inline-flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted"
                  aria-label={
                    citation.comment
                      ? "Edit citation comment"
                      : "Add comment to citation"
                  }
                >
                  <IconPencil className="size-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-72 space-y-2 p-3"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <Textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Add a note about this quote"
                  rows={3}
                  className="text-xs"
                />
                <div className="flex justify-end gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      citations.updateComment(citation.id, draft);
                      setEditingId(null);
                    }}
                  >
                    Save
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            {chatParentId ? (
              savedKeys.has(savedKey(citation)) ? (
                <span
                  className="inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground"
                  aria-label="Saved to Documents"
                >
                  <IconBookmarkFilled className="size-3" />
                </span>
              ) : (
                <button
                  type="button"
                  className="hit-target inline-flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted"
                  aria-label="Save to Documents"
                  onClick={() => save(citation, chatParentId)}
                >
                  <IconBookmark className="size-3" />
                </button>
              )
            ) : null}
            <button
              type="button"
              className="hit-target inline-flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted"
              aria-label={`Remove citation: ${label}`}
              onClick={() => citations.remove(citation.id)}
            >
              <IconX className="size-3" />
            </button>
          </span>
        );
      })}
    </div>
  );
}
