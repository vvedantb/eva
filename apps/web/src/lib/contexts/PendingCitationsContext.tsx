"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { AssistantCitation } from "@/lib/components/chat/assistantCitation";

interface PendingCitationsValue {
  readonly items: ReadonlyArray<AssistantCitation>;
  readonly highlightedMessageId: string | null;
  add: (citation: AssistantCitation) => void;
  remove: (citationId: string) => void;
  updateComment: (citationId: string, comment: string) => void;
  clear: () => void;
  reveal: (messageId: string) => void;
}

const PendingCitationsContext = createContext<PendingCitationsValue | null>(
  null,
);

export function PendingCitationsProvider({
  children,
  initialItems = [],
}: {
  children: ReactNode;
  initialItems?: ReadonlyArray<AssistantCitation>;
}) {
  const [items, setItems] = useState<AssistantCitation[]>(() => [
    ...initialItems,
  ]);
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);

  const value: PendingCitationsValue = {
    items,
    highlightedMessageId,
    add: (citation) => {
      setItems((current) => [...current, citation]);
    },
    remove: (citationId) => {
      setItems((current) =>
        current.filter((citation) => citation.id !== citationId),
      );
    },
    updateComment: (citationId, comment) => {
      setItems((current) =>
        current.map((citation) =>
          citation.id === citationId
            ? { ...citation, comment: comment.trim() }
            : citation,
        ),
      );
    },
    clear: () => {
      setItems([]);
    },
    reveal: (messageId) => {
      const target = document.querySelector(
        `[data-message-id="${CSS.escape(messageId)}"]`,
      );
      if (target instanceof HTMLElement) {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      setHighlightedMessageId(messageId);
      window.setTimeout(() => {
        setHighlightedMessageId((current) =>
          current === messageId ? null : current,
        );
      }, 1600);
    },
  };

  return (
    <PendingCitationsContext value={value}>{children}</PendingCitationsContext>
  );
}

export function usePendingCitations(): PendingCitationsValue | undefined {
  return useContext(PendingCitationsContext) ?? undefined;
}
