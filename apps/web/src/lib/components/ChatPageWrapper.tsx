"use client";

import { IconArchive } from "@tabler/icons-react";

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
  /** A tab strip rendered under the header row (session chat tabs). */
  tabs?: React.ReactNode;
  children: React.ReactNode;
}

const ARCHIVED_MESSAGE = "This session is archived and read-only";

export function ChatPageWrapper({
  title: _title,
  headerLeft,
  headerRight,
  readOnlyMessage,
  isArchived,
  tabs,
  children,
}: ChatPageWrapperProps) {
  const bannerMessage =
    readOnlyMessage ?? (isArchived ? ARCHIVED_MESSAGE : undefined);

  return (
    <div className="flex h-full min-h-0 flex-col w-full">
      {bannerMessage ? (
        <div className="w-full flex items-center gap-2 px-3 py-3 bg-muted/50 animate-in fade-in duration-300 sm:px-4 sm:py-5">
          <IconArchive size={16} className="text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{bannerMessage}</span>
        </div>
      ) : (
        <div className="w-full flex items-center justify-between gap-1 p-2 animate-in fade-in duration-300 sm:gap-2 sm:p-3">
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
        </div>
      )}
      {tabs}
      {children}
    </div>
  );
}
