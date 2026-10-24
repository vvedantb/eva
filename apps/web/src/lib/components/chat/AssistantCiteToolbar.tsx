"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import { Button, toast } from "@vvedantb/ui";
import { IconBookmark, IconQuote } from "@tabler/icons-react";
import {
  createCitation,
  ASSISTANT_CITATION_MAX_CHARS,
} from "@/lib/components/chat/assistantCitation";
import type { ChatParentId } from "@/lib/components/chat/chatBodyUtils";
import { messageLinkUrl } from "@/lib/components/chat/messageLink";
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

/** Room for Cite + Save, so the pair never runs off the right edge. */
const TOOLBAR_WIDTH = 150;

export function AssistantCiteToolbar({
  forcedTarget,
  chatParentId,
}: {
  /** Demo / screenshot seed — skips live selection. */
  forcedTarget?: CiteTarget;
  /**
   * Enables Save, which keeps the selection as a note in the chat's Log
   * (Documents tab). Chats without one (Manager Ave) have no Log.
   */
  chatParentId?: ChatParentId;
}) {
  const citations = usePendingCitations();
  const [target, setTarget] = useState<CiteTarget | null>(forcedTarget ?? null);
  const saveQuote = useMutation(api.chatLog.saveQuote);

  if (!citations) return null;

  /**
   * `selectionchange` only fires on the document, so the listener stays global.
   * It is registered from a ref callback on a mounted node (cleanup returned)
   * instead of an effect — useEffect is banned in this repo.
   */
  const watchSelection = (node: HTMLSpanElement | null) => {
    if (!node) return;
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
  };

  /** Same whitespace clean-up and length cap for Cite and Save. */
  const takeCitation = (verb: string) => {
    if (!target) return null;
    const citation = createCitation({
      messageId: target.messageId,
      text: target.text,
    });
    if (!citation) {
      toast.error(
        target.text.trim().length > ASSISTANT_CITATION_MAX_CHARS
          ? `Selection is too long to ${verb}`
          : `Couldn't ${verb} that selection`,
      );
      return null;
    }
    window.getSelection()?.removeAllRanges();
    setTarget(null);
    return citation;
  };

  const cite = () => {
    const citation = takeCitation("cite");
    if (citation) citations.add(citation);
  };

  const save = (parentId: ChatParentId) => {
    const citation = takeCitation("save");
    if (!citation) return;
    void saveQuote({
      chatParentId: parentId,
      quote: citation.text,
      messageUrl: messageLinkUrl(citation.messageId),
    }).then(
      () => toast.success("Saved to Documents"),
      () => toast.error("Couldn't save that selection"),
    );
  };

  const buttonClass = "pointer-events-auto h-7 gap-1 px-2 text-xs shadow-sm";
  const keepSelection = (event: { preventDefault: () => void }) => {
    event.preventDefault();
  };

  return (
    <>
      {/* Anchor for the document listener: the toolbar itself only renders
          once there is a selection, so it cannot own the subscription. */}
      {forcedTarget ? null : <span hidden ref={watchSelection} />}
      {target ? (
        <div
          className="pointer-events-none fixed z-50 flex gap-1"
          style={{
            left: Math.max(
              8,
              Math.min(target.x, window.innerWidth - TOOLBAR_WIDTH),
            ),
            top: Math.max(8, target.y - 40),
          }}
        >
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className={buttonClass}
            data-testid="cite-selection-toolbar"
            onMouseDown={keepSelection}
            onClick={cite}
          >
            <IconQuote className="size-3.5" />
            Cite
          </Button>
          {chatParentId ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className={buttonClass}
              onMouseDown={keepSelection}
              onClick={() => save(chatParentId)}
            >
              <IconBookmark className="size-3.5" />
              Save
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
