"use client";

import {
  IconArchive,
  IconArchiveOff,
  IconMail,
  IconMailOpened,
} from "@tabler/icons-react";
import { BulkActionBar } from "@/lib/components/ui/BulkActionBar";

interface InboxBulkBarProps {
  isSelecting: boolean;
  selectedCount: number;
  totalCount: number;
  /** Viewing the archived list, so the archive action runs the other way. */
  viewingArchived: boolean;
  onExitSelect: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
}

/**
 * The inbox's selection bar. Archive sits in the bar's trailing slot for its
 * position only — it is reversible (the toast offers Undo, and the archived
 * view puts anything back), so it is deliberately not styled as destructive.
 */
export function InboxBulkBar({
  isSelecting,
  selectedCount,
  totalCount,
  viewingArchived,
  onExitSelect,
  onSelectAll,
  onClearSelection,
  onMarkRead,
  onMarkUnread,
  onArchive,
  onUnarchive,
}: InboxBulkBarProps) {
  return (
    <BulkActionBar
      barKey="inbox-bulk-bar"
      isSelecting={isSelecting}
      selectedCount={selectedCount}
      totalCount={totalCount}
      onExitSelect={onExitSelect}
      onSelectAll={onSelectAll}
      onClearSelection={onClearSelection}
      primaryActions={[
        {
          key: "mark-read",
          label: "Mark read",
          icon: IconMailOpened,
          onClick: onMarkRead,
        },
        {
          key: "mark-unread",
          label: "Mark unread",
          icon: IconMail,
          onClick: onMarkUnread,
        },
      ]}
      destructiveAction={
        viewingArchived
          ? {
              key: "unarchive",
              label: "Unarchive",
              icon: IconArchiveOff,
              destructive: false,
              onClick: onUnarchive,
            }
          : {
              key: "archive",
              label: "Archive",
              icon: IconArchive,
              destructive: false,
              onClick: onArchive,
            }
      }
    />
  );
}
