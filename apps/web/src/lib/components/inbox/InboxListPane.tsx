"use client";

import { Skeleton } from "@eva/ui";
import { IconInbox } from "@tabler/icons-react";
import type { Id } from "@eva/backend";
import { EmptyState } from "@/lib/components/ui/EmptyState";
import { NotificationList } from "@/lib/components/inbox/NotificationList";
import { type Notification } from "@/lib/components/notifications/notification-config";
import type { RepoWithLogo } from "@/lib/utils/repoGrouping";
import type { InboxFilter, InboxGroup } from "@/lib/search-params";

const EMPTY_COPY: Record<InboxFilter, { title: string; description: string }> =
  {
    all: { title: "No notifications yet", description: "You're all caught up" },
    unread: {
      title: "No unread notifications",
      description: "You're all caught up",
    },
    archived: {
      title: "Nothing archived",
      description: "Archived notifications will appear here.",
    },
  };

interface InboxListPaneProps {
  /** `undefined` while the query is in flight. */
  notifications: Notification[] | undefined;
  filter: InboxFilter;
  group: InboxGroup;
  repoById: Map<Id<"githubRepos">, RepoWithLogo>;
  selectedId: string | null;
  onSelect: (notification: Notification) => void;
  onMarkRead: (notification: Notification) => void;
  onToggleRead: (notification: Notification) => void;
  onToggleArchive: (notification: Notification) => void;
  isSelecting: boolean;
  checkedIds: ReadonlySet<string>;
  onToggleCheck: (notification: Notification, extend: boolean) => void;
}

/**
 * The scrolling body of the inbox's left pane: loading skeleton, per-filter
 * empty state, or the grouped list. Split out so `InboxClient` stays queries,
 * state and layout.
 */
export function InboxListPane({
  notifications,
  filter,
  group,
  repoById,
  selectedId,
  onSelect,
  onMarkRead,
  onToggleRead,
  onToggleArchive,
  isSelecting,
  checkedIds,
  onToggleCheck,
}: InboxListPaneProps) {
  if (notifications === undefined) {
    return (
      <div
        className="space-y-2 p-4"
        aria-busy="true"
        aria-label="Loading inbox"
      >
        <Skeleton className="h-4 w-24" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }

  if (notifications.length === 0) {
    const copy = EMPTY_COPY[filter];
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <EmptyState
          icon={<IconInbox size={24} className="text-muted-foreground" />}
          title={copy.title}
          description={copy.description}
          // The celebratory animation belongs to "you cleared the inbox", not
          // to a filter that happens to be empty.
          animate={filter === "all"}
        />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar">
      <NotificationList
        notifications={notifications}
        repoById={repoById}
        group={group}
        selectedId={selectedId}
        onSelect={onSelect}
        onMarkRead={onMarkRead}
        onToggleRead={onToggleRead}
        onToggleArchive={onToggleArchive}
        isSelecting={isSelecting}
        checkedIds={checkedIds}
        onToggleCheck={onToggleCheck}
      />
    </div>
  );
}
