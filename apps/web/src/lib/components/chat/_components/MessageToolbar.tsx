"use client";

import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import { cn } from "@eva/ui";
import { CHAT_QUICK_REACTIONS } from "@eva/shared/taskDetail";
import type { FeedbackSentiment } from "@eva/shared/chatFeedback";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toast,
} from "@vvedantb/ui";
import {
  IconCopy,
  IconDots,
  IconMessages,
  IconThumbDown,
  IconThumbUp,
} from "@tabler/icons-react";
import { EmojiReactionPicker } from "@/lib/components/tasks/_components/EmojiReactionPicker";
import type { ChatMessageActionItem } from "@/lib/components/chat/ChatMessageActions";

const BUTTON_CLASS =
  "flex size-7 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-accent-soft hover:text-foreground";

/**
 * The coordinator chat's message toolbar (Teams / Amp style): a small card on
 * the bubble's top-right corner, shown on hover or focus only and laid over
 * the bubble, so it takes no space. Quick reactions, the full emoji picker,
 * Reply, Copy, and a ⋯ menu with the rest (link, fork, rating, checkpoints).
 * Stays up while its picker or menu is open.
 */
export function MessageToolbar({
  onReact,
  onReply,
  copyText,
  menuItems,
  rating,
}: {
  onReact?: (emoji: string) => void;
  onReply?: () => void;
  copyText?: string;
  menuItems: ChatMessageActionItem[];
  /** Eva's finished turns: thumbs up / down in the ⋯ menu (`feedback.rateTurn`). */
  rating?: { messageId: string; sentiment: FeedbackSentiment | undefined };
}) {
  const rateTurn = useMutation(api.feedback.rateTurn);
  const rate = (sentiment: FeedbackSentiment | null) => {
    if (!rating) return;
    void rateTurn({ messageId: rating.messageId, sentiment }).catch(() =>
      toast.error("Could not save feedback"),
    );
  };
  const hasMenu = menuItems.length > 0 || rating !== undefined;
  if (!onReact && !onReply && !copyText && !hasMenu) return null;
  return (
    <div
      className={cn(
        "absolute -top-4 right-2 z-10 flex items-center gap-0.5 rounded-control bg-popover p-0.5 smooth-shadow-ring-md",
        // Hover or keyboard focus on the message shows it; an open picker or
        // menu keeps it up while the pointer is inside the popup.
        "pointer-events-none opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 has-[[data-state=open]]:pointer-events-auto has-[[data-state=open]]:opacity-100",
      )}
    >
      {onReact ? (
        <>
          {CHAT_QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`React with ${emoji}`}
              onClick={() => onReact(emoji)}
              className={cn(BUTTON_CLASS, "text-base")}
            >
              {emoji}
            </button>
          ))}
          <EmojiReactionPicker onSelect={onReact} variant="ghost" alwaysVisible />
          <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
        </>
      ) : null}
      {onReply ? (
        <button
          type="button"
          aria-label="Reply in thread"
          title="Reply in thread"
          onClick={onReply}
          className={BUTTON_CLASS}
        >
          <IconMessages className="size-4" />
        </button>
      ) : null}
      {copyText ? (
        <button
          type="button"
          aria-label="Copy message"
          title="Copy"
          onClick={() =>
            void navigator.clipboard.writeText(copyText).then(
              () => toast.success("Copied"),
              () => toast.error("Could not copy"),
            )
          }
          className={BUTTON_CLASS}
        >
          <IconCopy className="size-4" />
        </button>
      ) : null}
      {hasMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More actions"
              className={cn(BUTTON_CLASS, "data-[state=open]:bg-accent-soft")}
            >
              <IconDots className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {menuItems.map((item) => (
              <DropdownMenuItem
                key={item.key}
                disabled={item.disabled}
                onSelect={item.onClick}
              >
                {item.icon}
                {item.label}
              </DropdownMenuItem>
            ))}
            {rating ? (
              <>
                {menuItems.length > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem
                  onSelect={() =>
                    rate(
                      rating.sentiment === "positive" ? null : "positive",
                    )
                  }
                >
                  <IconThumbUp className="size-4" />
                  {rating.sentiment === "positive"
                    ? "Remove good rating"
                    : "Good response"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    rate(
                      rating.sentiment === "negative" ? null : "negative",
                    )
                  }
                >
                  <IconThumbDown className="size-4" />
                  {rating.sentiment === "negative"
                    ? "Remove bad rating"
                    : "Bad response"}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
