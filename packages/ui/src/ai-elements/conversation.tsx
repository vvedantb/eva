"use client";

import type { ComponentProps } from "react";
import { AnimatePresence, m } from "motion/react";

import { Button } from "../ui/button";
import { cn } from "../utils/cn";
import { IconChevronDown, IconDownload } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { motionSpring } from "../utils/motion";

/** Delay before showing the scroll pill so brief layout settles don't flash it. */
const SHOW_SCROLL_TO_END_DEBOUNCE_MS = 150;

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export const Conversation = ({ className, ...props }: ConversationProps) => (
  <StickToBottom
    className={cn("relative flex-1 overflow-y-hidden", className)}
    initial="instant"
    resize="smooth"
    role="log"
    {...props}
  />
);

export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
>;

export const ConversationContent = ({
  className,
  scrollClassName,
  ...props
}: ConversationContentProps) => (
  <StickToBottom.Content
    className={cn("flex flex-col gap-8 p-4", className)}
    scrollClassName={cn("scrollbar scroll-fade", scrollClassName)}
    {...props}
  />
);

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
};

export const ConversationEmptyState = ({
  className,
  title = "No messages yet",
  description = "Start a conversation to see messages here",
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) => (
  <div
    className={cn(
      "flex size-full flex-col items-center justify-center gap-3 p-8 text-center",
      className,
    )}
    {...props}
  >
    {children ?? (
      <>
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <div className="space-y-1">
          <h3 className="font-medium text-sm">{title}</h3>
          {description && (
            <p className="text-muted-foreground text-sm">{description}</p>
          )}
        </div>
      </>
    )}
  </div>
);

export type ConversationScrollButtonProps = ComponentProps<typeof Button> & {
  /**
   * When this changes (e.g. conversation/thread id), hide the pill immediately
   * and cancel any pending show — same idea as t3code's thread-switch debounce.
   */
  resetKey?: string;
};

/**
 * Floating "Scroll to end" pill. Showing is debounced (hide is immediate) so
 * stick-to-bottom settle / conversation switches don't flash the control.
 */
export const ConversationScrollButton = ({
  className,
  resetKey,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  const [showScrollToEnd, setShowScrollToEnd] = useState(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearShowTimer();
    setShowScrollToEnd(false);
  }, [resetKey, clearShowTimer]);

  useEffect(() => {
    if (isAtBottom) {
      clearShowTimer();
      setShowScrollToEnd(false);
      return;
    }

    showTimerRef.current = setTimeout(() => {
      setShowScrollToEnd(true);
      showTimerRef.current = null;
    }, SHOW_SCROLL_TO_END_DEBOUNCE_MS);

    return clearShowTimer;
  }, [isAtBottom, clearShowTimer]);

  const handleScrollToEnd = useCallback(() => {
    clearShowTimer();
    setShowScrollToEnd(false);
    void scrollToBottom();
  }, [clearShowTimer, scrollToBottom]);

  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 justify-center">
      <AnimatePresence>
        {showScrollToEnd ? (
          <m.div
            // Rises from, and sinks back toward, the bottom edge it points at —
            // the same path in both directions. Unmounting outright made the
            // most-seen control in the app pop in and out on a hard cut.
            initial={{ opacity: 0, y: 8, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.94 }}
            transition={motionSpring}
          >
            <Button
              className={cn(
                "pointer-events-auto h-7 gap-1.5 rounded-full border border-border/60 bg-card px-3 text-xs font-normal text-muted-foreground hover:border-border hover:bg-card hover:text-foreground",
                className,
              )}
              onClick={handleScrollToEnd}
              size="sm"
              type="button"
              variant="outline"
              aria-label="Scroll to end"
              title="Scroll to end"
              {...props}
            >
              <IconChevronDown className="size-3.5" />
              Scroll to end
            </Button>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export interface ConversationMessage {
  role: "user" | "assistant" | "system" | "data" | "tool";
  content: string;
}

export type ConversationDownloadProps = Omit<
  ComponentProps<typeof Button>,
  "onClick"
> & {
  messages: ConversationMessage[];
  filename?: string;
  formatMessage?: (message: ConversationMessage, index: number) => string;
};

const defaultFormatMessage = (message: ConversationMessage): string => {
  const roleLabel =
    message.role.charAt(0).toUpperCase() + message.role.slice(1);
  return `**${roleLabel}:** ${message.content}`;
};

export const messagesToMarkdown = (
  messages: ConversationMessage[],
  formatMessage: (
    message: ConversationMessage,
    index: number,
  ) => string = defaultFormatMessage,
): string => messages.map((msg, i) => formatMessage(msg, i)).join("\n\n");

export const ConversationDownload = ({
  messages,
  filename = "conversation.md",
  formatMessage = defaultFormatMessage,
  className,
  children,
  ...props
}: ConversationDownloadProps) => {
  const handleDownload = useCallback(() => {
    const markdown = messagesToMarkdown(messages, formatMessage);
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [messages, filename, formatMessage]);

  return (
    <Button
      className={cn(
        "absolute top-4 right-4 rounded-full bg-background hover:bg-muted",
        className,
      )}
      onClick={handleDownload}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      {children ?? <IconDownload className="size-4" />}
    </Button>
  );
};
