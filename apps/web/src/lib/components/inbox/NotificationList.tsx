"use client";

import { m, AnimatePresence } from "motion/react";
import { motionFast, motionStagger } from "@eva/ui";
import { type Notification } from "@/lib/components/notifications/notification-config";
import { NotificationRow } from "@/lib/components/inbox/NotificationRow";
import { groupNotifications } from "@/lib/components/inbox/groupNotifications";
import type { RepoWithLogo } from "@/lib/utils/repoGrouping";
import type { InboxGroup } from "@/lib/search-params";
import type { Id } from "@eva/backend";

interface NotificationListProps {
  notifications: Notification[];
  repoById: Map<Id<"githubRepos">, RepoWithLogo>;
  /** How the list is sectioned: by day, repo or notification type. */
  group: InboxGroup;
  selectedId: string | null;
  onSelect: (notification: Notification) => void;
  onMarkRead: (notification: Notification) => void;
  /** Right-click menu action: flips the row between read and unread. */
  onToggleRead: (notification: Notification) => void;
  /** Right-click menu action: archives the row, or puts it back. */
  onToggleArchive: (notification: Notification) => void;
  isSelecting: boolean;
  checkedIds: ReadonlySet<string>;
  onToggleCheck: (notification: Notification, extend: boolean) => void;
}

/**
 * The left column of the two-pane inbox: notifications in sticky-headed
 * sections, scrolling as one list. Grouping and selection are both owned by the
 * parent, so the detail pane, the keyboard and the bulk bar share them.
 */
export function NotificationList({
  notifications,
  repoById,
  group,
  selectedId,
  onSelect,
  onMarkRead,
  onToggleRead,
  onToggleArchive,
  isSelecting,
  checkedIds,
  onToggleCheck,
}: NotificationListProps) {
  const groups = groupNotifications(notifications, group, repoById);

  return (
    <AnimatePresence initial={false}>
      {groups.map((section) => (
        <m.div
          key={section.label}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={motionFast}
        >
          {/* Sticky so the section label stays readable while its rows scroll by. */}
          <div className="sticky top-0 z-10 border-b border-border bg-background px-4 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {section.label}
            </span>
          </div>
          <div className="divide-y divide-border">
            {section.items.map((n, index) => (
              <m.div
                key={n._id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  ...motionFast,
                  delay: motionStagger(index, 0.02, 0.1),
                }}
              >
                <NotificationRow
                  notification={n}
                  repo={n.repoId ? repoById.get(n.repoId) : undefined}
                  selected={n._id === selectedId}
                  onSelect={() => onSelect(n)}
                  onMarkRead={() => onMarkRead(n)}
                  onToggleRead={() => onToggleRead(n)}
                  onToggleArchive={() => onToggleArchive(n)}
                  isSelecting={isSelecting}
                  isChecked={checkedIds.has(n._id)}
                  onToggleCheck={(extend) => onToggleCheck(n, extend)}
                />
              </m.div>
            ))}
          </div>
        </m.div>
      ))}
    </AnimatePresence>
  );
}
