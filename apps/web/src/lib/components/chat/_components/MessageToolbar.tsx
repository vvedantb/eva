"use client";

import { cn } from "@eva/ui";
import type { FeedbackSentiment } from "@eva/shared/chatFeedback";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  MessageAction,
  toast,
} from "@vvedantb/ui";
import { IconCopy, IconDots, IconMessages } from "@tabler/icons-react";
import { TurnFeedbackActions } from "@/lib/components/chat/feedback/TurnFeedbackActions";
import type { ChatMessageActionItem } from "@/lib/components/chat/ChatMessageActions";

const BUTTON_CLASS = "hit-target text-muted-foreground hover:text-foreground";

/**
 * The coordinator chat's message toolbar (Teams / Amp style): a small card on
 * the bubble's top-right corner, shown on hover or focus only and laid over
 * the bubble, so it takes no space. On Eva's finished replies: 👍 👎 (the
 * footer's `TurnFeedbackActions`, with its comment box), then Reply, Copy, and
 * the rest (Copy link; a ⋯ menu once there are two or more, as fork and
 * checkpoints elsewhere), then the time (and how long Eva took). Stays up while its comment
 * box or menu is open.
 */
export function MessageToolbar({
  onReply,
  copyText,
  menuItems,
  time,
  rating,
}: {
  onReply?: () => void;
  copyText?: string;
  menuItems: ChatMessageActionItem[];
  time: string;
  rating?: {
    messageId: string;
    sentiment: FeedbackSentiment | undefined;
    comment: string | undefined;
  };
}) {
  const hasMenu = menuItems.length > 1;
  const directItems = hasMenu ? [] : menuItems;
  return (
    <div
      className={cn(
        "absolute -top-6 right-2 z-10 flex items-center gap-0.5 rounded-control bg-popover p-0.5 smooth-shadow-ring-md",
        "pointer-events-none opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 has-[[data-state=open]]:pointer-events-auto has-[[data-state=open]]:opacity-100",
      )}
    >
      {rating ? (
        <>
          <TurnFeedbackActions
            messageId={rating.messageId}
            sentiment={rating.sentiment}
            comment={rating.comment}
          />
          <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
        </>
      ) : null}
      {onReply ? (
        <MessageAction
          tooltip="Reply in thread"
          size="icon-xs"
          onClick={onReply}
          className={BUTTON_CLASS}
        >
          <IconMessages className="size-4" />
        </MessageAction>
      ) : null}
      {copyText ? (
        <MessageAction
          tooltip="Copy"
          label="Copy message"
          size="icon-xs"
          onClick={() =>
            void navigator.clipboard.writeText(copyText).then(
              () => toast.success("Copied"),
              () => toast.error("Could not copy"),
            )
          }
          className={BUTTON_CLASS}
        >
          <IconCopy className="size-4" />
        </MessageAction>
      ) : null}
      {directItems.map((item) => (
        <MessageAction
          key={item.key}
          tooltip={item.label}
          size="icon-xs"
          disabled={item.disabled}
          onClick={item.onClick}
          className={BUTTON_CLASS}
        >
          {item.icon}
        </MessageAction>
      ))}
      {hasMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="More actions"
              className={cn(BUTTON_CLASS, "data-[state=open]:bg-accent-soft")}
            >
              <IconDots className="size-4" />
            </Button>
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
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <span className="whitespace-nowrap px-1.5 text-2xs tabular-nums text-muted-foreground">
        {time}
      </span>
    </div>
  );
}
