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
} from "@eva/ui";
import { IconPencil, IconQuote, IconX } from "@tabler/icons-react";
import { citationPreview } from "@/lib/components/chat/assistantCitation";
import { usePendingCitations } from "@/lib/contexts/PendingCitationsContext";

export function PendingCitationChips() {
  const citations = usePendingCitations();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (!citations || citations.items.length === 0) return null;

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
