"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CrossfadeIcon, MessageActions, MessageAction, cn } from "@eva/ui";
import { IconCheck, IconCopy } from "@tabler/icons-react";

export interface ChatMessageActionItem {
  // Stable identity for the action button.
  key: string;
  // Accessible label + tooltip text.
  label: string;
  icon: ReactNode;
  onClick: () => void;
  // Toggled/selected styling (e.g. an active rating or share state).
  active?: boolean;
  disabled?: boolean;
}

interface ChatMessageActionsProps {
  // When set, a built-in copy-to-clipboard action is prepended. Pass the raw
  // message text (not tokenized markup) so the clipboard holds readable copy.
  copyText?: string;
  // Extra actions rendered after copy (retry, rating, share, custom).
  actions?: ChatMessageActionItem[];
  className?: string;
  /** When false, parent handles hover/focus reveal (e.g. shared row with timestamp). */
  revealOnHover?: boolean;
}

/**
 * Inline hover action row for chat messages (copy, retry, rating, share, ...).
 *
 * Built on the shared MessageActions/MessageAction primitives so it inherits
 * the ghost-button + tooltip styling. The parent Message wrapper carries the
 * `group` class, so the row stays hidden until the message is hovered or an
 * action receives focus (keyboard-accessible). Renders nothing when it would
 * be empty.
 */
export function ChatMessageActions({
  copyText,
  actions = [],
  className,
  revealOnHover = true,
}: ChatMessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = async () => {
    if (copyText === undefined) return;
    await navigator.clipboard.writeText(copyText);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (copyText === undefined && actions.length === 0) return null;

  return (
    <MessageActions
      className={cn(
        "gap-0.5",
        // `reveal-on-hover transition-opacity` keeps the quiet hover reveal on pointer devices but
        // ships copy / retry / branch visible below `sm`, where there is no
        // hover to reveal them with.
        revealOnHover && "reveal-on-hover transition-opacity",
        className,
      )}
    >
      {copyText !== undefined ? (
        <MessageAction
          tooltip={copied ? "Copied" : "Copy"}
          label="Copy message"
          size="icon-xs"
          onClick={handleCopy}
          className="hit-target text-muted-foreground hover:text-foreground"
        >
          <CrossfadeIcon
            show={copied}
            trueKey="copied"
            falseKey="copy"
            className="relative flex size-4 items-center justify-center"
            whenTrue={<IconCheck className="text-success" />}
            whenFalse={<IconCopy />}
          />
        </MessageAction>
      ) : null}
      {actions.map((action) => (
        <MessageAction
          key={action.key}
          tooltip={action.label}
          label={action.label}
          size="icon-xs"
          onClick={action.onClick}
          disabled={action.disabled}
          aria-pressed={action.active}
          className={cn(
            "hit-target text-muted-foreground hover:text-foreground",
            action.active && "text-foreground",
          )}
        >
          {action.icon}
        </MessageAction>
      ))}
    </MessageActions>
  );
}
