"use client";

import { useEffect } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api, type Id } from "@eva/backend";
import { useNavigate } from "@tanstack/react-router";
import { useQueryState } from "nuqs";
import { PageHeader } from "@/lib/components/PageHeader";
import { usePageTitleSync } from "@/lib/contexts/PageTitleContext";
import { EmptyState } from "@/lib/components/ui/EmptyState";
import { Button, Skeleton, motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { IconChecks, IconInbox } from "@tabler/icons-react";
import { inboxFilterParser, inboxSelectedParser } from "@/lib/search-params";
import { type Notification } from "@/lib/components/notifications/notification-config";
import { InboxFilterMenu } from "@/lib/components/inbox/InboxFilterMenu";
import { NotificationList } from "@/lib/components/inbox/NotificationList";
import { NotificationDetailPane } from "@/lib/components/inbox/NotificationDetailPane";
import { ResizablePanelLayout } from "@/lib/components/ResizablePanelLayout";
import { hrefToNavigateOptions } from "@/lib/utils/repoUrl";
import { catchMutationError } from "@/lib/utils/mutationToast";
import type { RepoWithLogo } from "@/lib/utils/repoGrouping";

/**
 * Two-pane inbox (Linear-style): the notification list on the left, the
 * selected notification's full content on the right. Clicking a row selects
 * it (and marks it read) instead of navigating away; the detail pane owns
 * the jump to the linked entity.
 */
export function InboxClient() {
  const navigate = useNavigate();
  usePageTitleSync("Inbox");
  const notifications = useQuery(api.notifications.list);
  const repos = useQuery(api.githubRepos.list, {});
  const unreadCount = useQuery(api.notifications.countUnread) ?? 0;
  const repoById = new Map<Id<"githubRepos">, RepoWithLogo>(
    (repos ?? []).map((repo) => [repo._id, repo]),
  );
  const markAsRead = useMutation(
    api.notifications.markAsRead,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.notifications.list, {});
    if (current !== undefined) {
      localStore.setQuery(
        api.notifications.list,
        {},
        current.map((n) => (n._id === args.id ? { ...n, read: true } : n)),
      );
    }
    const count = localStore.getQuery(api.notifications.countUnread, {});
    if (count !== undefined) {
      localStore.setQuery(
        api.notifications.countUnread,
        {},
        Math.max(0, count - 1),
      );
    }
  });
  const markAsUnread = useMutation(
    api.notifications.markAsUnread,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.notifications.list, {});
    if (current !== undefined) {
      localStore.setQuery(
        api.notifications.list,
        {},
        current.map((n) => (n._id === args.id ? { ...n, read: false } : n)),
      );
    }
    const count = localStore.getQuery(api.notifications.countUnread, {});
    if (count !== undefined) {
      localStore.setQuery(api.notifications.countUnread, {}, count + 1);
    }
  });
  const markAllAsRead = useMutation(
    api.notifications.markAllAsRead,
  ).withOptimisticUpdate((localStore) => {
    const current = localStore.getQuery(api.notifications.list, {});
    if (current !== undefined) {
      localStore.setQuery(
        api.notifications.list,
        {},
        current.map((n) => ({ ...n, read: true })),
      );
    }
    localStore.setQuery(api.notifications.countUnread, {}, 0);
  });
  const [filter, setFilter] = useQueryState("filter", inboxFilterParser);
  const [selectedId, setSelectedId] = useQueryState(
    "notification",
    inboxSelectedParser,
  );

  const filtered =
    notifications === undefined
      ? undefined
      : filter === "unread"
        ? notifications.filter((n) => !n.read)
        : notifications;

  // Resolved against the full list, not `filtered`: selecting an unread row on
  // the Unread tab marks it read (removing it from the tab), and the detail
  // pane must keep showing it rather than blanking out.
  const selected = notifications?.find((n) => n._id === selectedId);
  const selectedRepo =
    selected?.repoId !== undefined ? repoById.get(selected.repoId) : undefined;

  const handleMarkRead = (n: Notification) => {
    void catchMutationError(
      markAsRead({ id: n._id }),
      "Couldn't mark as read",
      "inbox-mark-read",
    );
  };

  const handleSelect = (n: Notification) => {
    if (!n.read) handleMarkRead(n);
    setSelectedId(n._id);
  };

  // Right-click toggle. Deliberately leaves selection alone: marking the open
  // notification unread should not close the detail pane, and re-reading it
  // only happens when the row is clicked again.
  const handleToggleRead = (n: Notification) => {
    if (n.read) {
      void catchMutationError(
        markAsUnread({ id: n._id }),
        "Couldn't mark as unread",
        "inbox-mark-unread",
      );
      return;
    }
    handleMarkRead(n);
  };

  const handleOpen = (n: Notification) => {
    // Split rather than passed whole: a comment notification's href carries
    // `?comment=<id>`, and the router resolves `to` as a pathname only.
    if (n.href) navigate(hrefToNavigateOptions(n.href));
  };

  // Linear-style keys: arrows step the list, Enter opens the linked entity,
  // Escape clears the selection. Skipped while typing in a field.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target;
      if (target instanceof HTMLElement) {
        if (target.isContentEditable) return;
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (filtered === undefined || filtered.length === 0) return;
        e.preventDefault();
        const index = filtered.findIndex((n) => n._id === selectedId);
        const next =
          index < 0
            ? filtered[0]
            : e.key === "ArrowDown"
              ? filtered[Math.min(index + 1, filtered.length - 1)]
              : filtered[Math.max(index - 1, 0)];
        if (next) handleSelect(next);
      } else if (e.key === "Enter") {
        if (selected) handleOpen(selected);
      } else if (e.key === "Escape") {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // The header sits inside the left pane rather than above both panes, so the
  // detail pane (and the divider between them) runs the full viewport height.
  return (
    <div className="flex-1 h-full min-h-0 overflow-hidden animate-in fade-in duration-300">
      <ResizablePanelLayout
        storageKey="inbox-split"
        leftDefaultSize="40%"
        leftMinWidthPx={300}
        rightMinWidthPx={360}
        // The detail pane is the point of this view, so it starts open.
        defaultRightCollapsed={false}
        leftPanel={() => (
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <PageHeader
              title="Inbox"
              headerRight={
                <>
                  <AnimatePresence>
                    {unreadCount > 0 ? (
                      <m.div
                        key="mark-all-read"
                        className="inline-flex"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={motionFast}
                      >
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            void catchMutationError(
                              markAllAsRead(),
                              "Couldn't mark all as read",
                              "inbox-mark-all-read",
                            );
                          }}
                          title="Mark all as read"
                          aria-label="Mark all as read"
                          className="h-7 text-xs text-muted-foreground"
                        >
                          <IconChecks size={14} />
                          {/* The label is noise on narrow screens; the icon carries it. */}
                          <span className="hidden sm:inline">Mark all read</span>
                        </Button>
                      </m.div>
                    ) : null}
                  </AnimatePresence>
                  <InboxFilterMenu
                    filter={filter}
                    unreadCount={unreadCount}
                    onChange={setFilter}
                  />
                </>
              }
            />
            {/* Region divider between the header and the notification list. */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border">
              {filtered === undefined ? (
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
              ) : filtered.length === 0 ? (
                <div className="flex min-h-0 flex-1 items-center justify-center">
                  <EmptyState
                    icon={
                      <IconInbox size={24} className="text-muted-foreground" />
                    }
                    title={
                      filter === "unread"
                        ? "No unread notifications"
                        : "No notifications yet"
                    }
                    description="You're all caught up"
                    animate={filter !== "unread"}
                  />
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto scrollbar">
                  <NotificationList
                    notifications={filtered}
                    repoById={repoById}
                    selectedId={selectedId}
                    onSelect={handleSelect}
                    onMarkRead={handleMarkRead}
                    onToggleRead={handleToggleRead}
                  />
                </div>
              )}
            </div>
          </div>
        )}
        rightPanel={() => (
          <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
            <NotificationDetailPane
              notification={selected}
              repo={selectedRepo}
              onOpen={handleOpen}
            />
          </div>
        )}
      />
    </div>
  );
}
