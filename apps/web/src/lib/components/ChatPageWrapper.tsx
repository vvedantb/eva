"use client";

import { IconArchive } from "@tabler/icons-react";
import { cn } from "@eva/ui";
import { buttonTrackClass, tokenTransition } from "@vvedantb/ui";
import { AnimatePresence, m } from "motion/react";

interface ChatPageWrapperProps {
  title: string;
  headerLeft?: React.ReactNode;
  headerRight?: React.ReactNode;
  readOnlyMessage?: string;
  isArchived?: boolean;
  children: React.ReactNode;
}

const ARCHIVED_MESSAGE = "This session is archived and read-only";

/**
 * Chat header actions on one shared trough: the package `buttonTrackClass`.
 * Session, task and project chats all use it.
 */
export const CHAT_HEADER_ACTIONS_CLASS = cn(
  buttonTrackClass,
  "flex-wrap justify-end",
);

export function ChatPageWrapper({
  title: _title,
  headerLeft,
  headerRight,
  readOnlyMessage,
  isArchived,
  children,
}: ChatPageWrapperProps) {
  const bannerMessage =
    readOnlyMessage ?? (isArchived ? ARCHIVED_MESSAGE : undefined);

  return (
    <div className="flex h-full min-h-0 flex-col w-full">
      <AnimatePresence mode="wait" initial={false}>
        {bannerMessage ? (
          <m.div
            key="banner"
            className="w-full flex items-center gap-2 px-3 py-3 bg-muted/50 sm:px-4 sm:py-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={tokenTransition.base}
          >
            <IconArchive size={16} className="text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {bannerMessage}
            </span>
          </m.div>
        ) : (
          <m.div
            key="session-header"
            className="w-full flex items-center justify-between gap-1 p-2 sm:gap-2 sm:px-3 sm:py-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={tokenTransition.base}
          >
            {headerLeft ? (
              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden sm:gap-2">
                {headerLeft}
              </div>
            ) : (
              <div />
            )}
            {headerRight && (
              <div className={CHAT_HEADER_ACTIONS_CLASS}>{headerRight}</div>
            )}
          </m.div>
        )}
      </AnimatePresence>
      {children}
    </div>
  );
}
