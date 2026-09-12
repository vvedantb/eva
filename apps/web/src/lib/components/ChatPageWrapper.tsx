"use client";

import { IconArchive } from "@tabler/icons-react";
import { motionBase } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";

interface ChatPageWrapperProps {
  title: string;
  headerLeft?: React.ReactNode;
  headerRight?: React.ReactNode;
  /**
   * When set, replaces the header with a read-only banner (archived session,
   * or session whose PR is merged/closed).
   */
  readOnlyMessage?: string;
  /** Design sessions still pass this; prefer `readOnlyMessage` for custom copy. */
  isArchived?: boolean;
  children: React.ReactNode;
}

const ARCHIVED_MESSAGE = "This session is archived and read-only";

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
            transition={motionBase}
          >
            <IconArchive size={16} className="text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {bannerMessage}
            </span>
          </m.div>
        ) : (
          <m.div
            key="session-header"
            className="w-full flex items-center justify-between gap-1 p-2 sm:gap-2 sm:p-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionBase}
          >
            {headerLeft ? (
              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden sm:gap-2">
                {headerLeft}
              </div>
            ) : (
              <div />
            )}
            {headerRight && (
              <div className="flex shrink-0 items-center gap-1 sm:gap-2 flex-wrap justify-end">
                {headerRight}
              </div>
            )}
          </m.div>
        )}
      </AnimatePresence>
      {children}
    </div>
  );
}
