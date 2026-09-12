"use client";

import { useEffect, useState } from "react";
import { Button, toast } from "@eva/ui";
import { IconQuote } from "@tabler/icons-react";
import {
  createCitation,
  ASSISTANT_CITATION_MAX_CHARS,
} from "@/lib/components/chat/assistantCitation";
import {
  captureAssistantCitationSelection,
  citationSelectionPosition,
} from "@/lib/components/chat/assistantTextSelection";
import { usePendingCitations } from "@/lib/contexts/PendingCitationsContext";

interface CiteTarget {
  messageId: string;
  text: string;
  x: number;
  y: number;
}

export function AssistantCiteToolbar({
  forcedTarget,
}: {
  /** Demo / screenshot seed — skips live selection. */
  forcedTarget?: CiteTarget;
}) {
  const citations = usePendingCitations();
  const [target, setTarget] = useState<CiteTarget | null>(forcedTarget ?? null);

  useEffect(() => {
    if (forcedTarget || !citations) return;
    const onSelectionChange = () => {
      const selection = window.getSelection();
      const captured = captureAssistantCitationSelection(selection);
      const position = citationSelectionPosition(selection);
      if (!captured || !position) {
        setTarget(null);
        return;
      }
      setTarget({
        messageId: captured.messageId,
        text: captured.text,
        x: position.x,
        y: position.y,
      });
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [citations, forcedTarget]);

  if (!citations || !target) return null;

  const cite = () => {
    const citation = createCitation({
      messageId: target.messageId,
      text: target.text,
    });
    if (!citation) {
      toast.error(
        target.text.trim().length > ASSISTANT_CITATION_MAX_CHARS
          ? "Selection is too long to cite"
          : "Couldn't cite that selection",
      );
      return;
    }
    citations.add(citation);
    window.getSelection()?.removeAllRanges();
    setTarget(null);
  };

  return (
    <div
      className="pointer-events-none fixed z-50"
      style={{
        left: Math.max(8, Math.min(target.x, window.innerWidth - 88)),
        top: Math.max(8, target.y - 40),
      }}
    >
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="pointer-events-auto h-7 gap-1 px-2 text-xs shadow-sm"
        data-testid="cite-selection-toolbar"
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={cite}
      >
        <IconQuote className="size-3.5" />
        Cite
      </Button>
    </div>
  );
}
