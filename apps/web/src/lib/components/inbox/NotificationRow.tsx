"use client";

import { useEffect, useRef } from "react";
import { cn } from "@eva/ui";
import {
  Badge,
  Button,
  Checkbox,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  LIST_ROW_CONTROL_CLASS,
  RelativeDateTime,
} from "@vvedantb/ui";
import {
  IconArchive,
  IconArchiveOff,
  IconCheck,
  IconMail,
  IconMailOpened,
} from "@tabler/icons-react";
import { RepoLogo } from "@/lib/components/RepoLogo";
import {
  NotificationIcon,
  NotificationStatusIcon,
  type Notification,
} from "@/lib/components/notifications/notification-config";
import { splitNotificationTitle } from "@eva/shared/notificationTitle";
import { repoDisplayLabel, type RepoWithLogo } from "@/lib/utils/repoGrouping";

function NotificationSourceAvatar({
  notification,
  repo,
}: {
  notification: Notification;
  repo: RepoWithLogo | undefined;
}) {
  if (!repo) {
    return <NotificationIcon notification={notification} size="sm" />;
  }

  const label = repoDisplayLabel(repo);

  return (
    <div className="size-7 shrink-0">
      <RepoLogo
        logoUrl={repo.logoUrl}
        size={28}
        fallback={
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
            {label.charAt(0).toUpperCase()}
          </span>
        }
      />
    </div>
  );
}

interface NotificationRowProps {
  notification: Notification;
  repo: RepoWithLogo | undefined;
  selected: boolean;
  onSelect: () => void;
  onMarkRead: () => void;
  onToggleRead: () => void;
  onToggleArchive: () => void;
  isSelecting: boolean;
  isChecked: boolean;
  onToggleCheck: (extend: boolean) => void;
}

/** One inbox row. The parent list owns the border, so the row is padding only. */
export function NotificationRow({
  notification,
  repo,
  selected,
  onSelect,
  onMarkRead,
  onToggleRead,
  onToggleArchive,
  isSelecting,
  isChecked,
  onToggleCheck,
}: NotificationRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const sourceLabel = repo ? repoDisplayLabel(repo) : undefined;
  const unread = !notification.read;
  const archived = notification.archivedAt !== undefined;
  const { subject, event } = splitNotificationTitle(notification);
  const detail = event ?? sourceLabel;

  /* eslint-disable no-effect/no-event-handler --
     Scrolls the DOM row into view; selection can also move from a keyboard
     handler that lives on the list, so the row has no event of its own. */
  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  /* eslint-enable no-effect/no-event-handler */

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={rowRef}
          className={cn(
            "group relative flex items-center gap-3 px-4 transition-colors",
            selected ? "bg-muted" : "hover:bg-muted/40",
          )}
        >
          {isSelecting ? (
            <Checkbox
              checked={isChecked}
              onCheckedChange={() => onToggleCheck(false)}
              onClick={(click) => click.stopPropagation()}
              aria-label={`Select ${subject}`}
              className={cn("shrink-0", LIST_ROW_CONTROL_CLASS)}
            />
          ) : null}
          <button
            onClick={(click) => {
              if (isSelecting) {
                onToggleCheck(click.shiftKey);
                return;
              }
              onSelect();
            }}
            aria-current={selected ? "true" : undefined}
            className="motion-press flex min-w-0 flex-1 items-center gap-3 py-3 text-left active:scale-[0.99] focus-visible:outline-hidden"
          >
            <span className="flex w-1.5 shrink-0 justify-center" aria-hidden>
              {unread ? (
                <span className="size-1.5 rounded-full bg-primary" />
              ) : null}
            </span>
            <NotificationSourceAvatar notification={notification} repo={repo} />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  className={cn(
                    "truncate text-sm",
                    unread && notification.urgency !== "low"
                      ? "font-medium text-foreground"
                      : "font-normal text-muted-foreground",
                  )}
                >
                  {subject}
                </span>
                {notification.urgency === "high" ? (
                  <Badge
                    variant="warning"
                    className="h-4 shrink-0 px-1.5 text-3xs"
                  >
                    Needs reply
                  </Badge>
                ) : null}
              </div>
              {detail ? (
                <span className="truncate text-xs leading-relaxed text-muted-foreground">
                  {detail}
                </span>
              ) : null}
            </div>
          </button>
          {/* At `sm` and up the timestamp and Dismiss share one slot, and hovering
          an unread row swaps one for the other. Dismiss is anchored at `right-11`
          rather than the row edge so that swap happens beside the status icon
          (16px icon + 16px row padding + the 12px row gap) instead of over it.
          Below `sm` the swap is unusable — touch has no hover, so Dismiss was
          unreachable — so there the button leaves the overlay, sits in flow after
          the status icon as a 40px icon-only target, and the timestamp keeps its
          place. Both halves are `max-sm:`-scoped so the desktop row is untouched. */}
          <RelativeDateTime
            at={notification.createdAt}
            className={cn(
              "shrink-0 text-xs tabular-nums text-muted-foreground",
              unread && "sm:group-hover:invisible",
            )}
          />
          {/* Trailing status column, outside the Dismiss overlay's reach: the
          type colour is what the eye runs down the list, so it stays put while
          hovering swaps the timestamp beside it for Dismiss. */}
          <NotificationStatusIcon notification={notification} />
          {/* Hidden while selecting: the row is a selection target then, and a
          hover action that quietly changes read state is a trap. */}
          {unread && !isSelecting ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onMarkRead}
              title="Mark as read"
              aria-label="Mark as read"
              className="absolute right-11 h-6 gap-1 px-2 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 max-sm:static max-sm:size-10 max-sm:shrink-0 max-sm:gap-0 max-sm:p-0 max-sm:opacity-100"
            >
              <IconCheck size={14} />
              <span className="max-sm:hidden">Dismiss</span>
            </Button>
          ) : null}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onSelect={onToggleRead}>
          {unread ? <IconMailOpened size={16} /> : <IconMail size={16} />}
          {unread ? "Mark as read" : "Mark as unread"}
        </ContextMenuItem>
        <ContextMenuItem onSelect={onToggleArchive}>
          {archived ? <IconArchiveOff size={16} /> : <IconArchive size={16} />}
          {archived ? "Unarchive" : "Archive"}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
