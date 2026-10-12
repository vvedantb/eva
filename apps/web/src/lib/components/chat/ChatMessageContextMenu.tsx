"use client";

import type { ReactElement } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@eva/ui";
import { IconCopy, IconMarkdown } from "@tabler/icons-react";
import { tokenizedToDisplayText } from "@/lib/components/mentions";
import type { ChatMessageActionItem } from "./ChatMessageActions";

interface ChatMessageContextMenuProps {
  /** Stored message body (may include mention/skill tokens + markdown). */
  content: string;
  /** Row-specific actions (turn diff / restore) listed after the copy items. */
  extraItems?: ChatMessageActionItem[];
  children: ReactElement;
}

async function copyText(value: string): Promise<void> {
  if (!value) return;
  await navigator.clipboard.writeText(value);
}

/**
 * Right-click menu for chat bubbles: copy readable text or raw markdown.
 * Wrap the message row; no-ops when content is empty.
 */
export function ChatMessageContextMenu({
  content,
  extraItems = [],
  children,
}: ChatMessageContextMenuProps) {
  const trimmed = content.trim();
  if (!trimmed && extraItems.length === 0) return children;

  const plain = tokenizedToDisplayText(content);

  return (
    <ContextMenu>
      <ContextMenuTrigger
        asChild
        onContextMenuCapture={(event) => {
          // Images keep the native menu (Copy image, Save image as…).
          // Stop propagation, not default, so Radix never sees the event.
          if (event.target instanceof HTMLImageElement) event.stopPropagation();
        }}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {trimmed ? (
          <>
            <ContextMenuItem
              onSelect={() => {
                void copyText(plain);
              }}
            >
              <IconCopy size={16} />
              Copy message
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => {
                void copyText(content);
              }}
            >
              <IconMarkdown size={16} />
              Copy as markdown
            </ContextMenuItem>
          </>
        ) : null}
        {trimmed && extraItems.length > 0 ? <ContextMenuSeparator /> : null}
        {extraItems.map((item) => (
          <ContextMenuItem
            key={item.key}
            disabled={item.disabled}
            onSelect={item.onClick}
          >
            <span className="[&>svg]:size-4">{item.icon}</span>
            {item.label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
