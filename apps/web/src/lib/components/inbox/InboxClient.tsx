"use client";

import { useEffect } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import { useNavigate } from "@tanstack/react-router";
import { useQueryState } from "nuqs";
import { usePageTitleSync } from "@/lib/contexts/PageTitleContext";
import {
  inboxFilterParser,
  inboxGroupParser,
  inboxSelectedParser,
} from "@/lib/search-params";
import { type Notification } from "@/lib/components/notifications/notification-config";
import { InboxHeader } from "@/lib/components/inbox/InboxHeader";
import { InboxBulkBar } from "@/lib/components/inbox/InboxBulkBar";
import { InboxListPane } from "@/lib/components/inbox/InboxListPane";
import { NotificationDetailPane } from "@/lib/components/inbox/NotificationDetailPane";
import { useInboxActions } from "@/lib/components/inbox/useInboxActions";
import { useInboxSelection } from "@/lib/components/inbox/useInboxSelection";
import { ResizablePanelLayout } from "@/lib/components/ResizablePanelLayout";
import { hrefToNavigateOptions } from "@/lib/utils/repoUrl";
import type { RepoWithLogo } from "@/lib/utils/repoGrouping";

/**
 * Two-pane inbox (Linear-style): the notification list on the left, the
 * selected notification's full content on the right. Clicking a row selects
 * it (and marks it read) instead of navigating away; the detail pane owns
 * the jump to the linked entity. Archive is reversible — archived rows move to
 * their own filter rather than leaving.
 */
export function InboxClient() {
  const navigate = useNavigate();
  usePageTitleSync("Inbox");
  const [filter, setFilter] = useQueryState("filter", inboxFilterParser);
  const [group, setGroup] = useQueryState("group", inboxGroupParser);
  const [selectedId, setSelectedId] = useQueryState(
    "notification",
    inboxSelectedParser,
  );
  const listArgs = { archived: filter === "archived" };
  const notifications = useQuery(api.notifications.list, listArgs);
  const repos = useQuery(api.githubRepos.list, {});
  const unreadCount = useQuery(api.notifications.countUnread) ?? 0;
  const repoById = new Map<Id<"githubRepos">, RepoWithLogo>(
    (repos ?? []).map((repo) => [repo._id, repo]),
  );
  const { markRead, markUnread, markAllRead, markMany, archive, unarchive } =
    useInboxActions(listArgs);

  const filtered =
    notifications === undefined
      ? undefined
      : filter === "unread"
        ? notifications.filter((n) => !n.read)
        : notifications;

  // Selection is scoped to what is on screen: the rendered order defines both
  // "select all" and a shift-click range, and rows that leave the list have
  // their selection pruned inside the hook.
  const { isSelecting, selectedIds, start, toggle, selectAll, clear, exit } =
    useInboxSelection((filtered ?? []).map((n) => n._id));
  const checkedIds = (filtered ?? [])
    .filter((n) => selectedIds.has(n._id))
    .map((n) => n._id);

  // Resolved against the full list, not `filtered`: selecting an unread row on
  // the Unread tab marks it read (removing it from the tab), and the detail
  // pane must keep showing it rather than blanking out.
  const selected = notifications?.find((n) => n._id === selectedId);
  const selectedRepo =
    selected?.repoId !== undefined ? repoById.get(selected.repoId) : undefined;

  const handleMarkRead = (n: Notification) => markRead(n._id);

  const handleSelect = (n: Notification) => {
    if (!n.read) markRead(n._id);
    setSelectedId(n._id);
  };

  // Right-click toggle. Deliberately leaves selection alone: marking the open
  // notification unread should not close the detail pane, and re-reading it
  // only happens when the row is clicked again.
  const handleToggleRead = (n: Notification) => {
    if (n.read) markUnread(n._id);
    else markRead(n._id);
  };

  const handleToggleArchive = (n: Notification) => {
    if (n.archivedAt !== undefined) unarchive([n._id]);
    else archive([n._id]);
  };

  // Every bulk action leaves selection mode: the rows it acted on have just
  // moved or changed, so holding the selection open would leave the bar
  // counting a list the user no longer has in front of them.
  const runBulk = (action: (ids: Id<"notifications">[]) => void) => {
    const ids = checkedIds;
    exit();
    action(ids);
  };

  const handleOpen = (n: Notification) => {
    // Split rather than passed whole: a comment notification's href carries
    // `?comment=<id>`, and the router resolves `to` as a pathname only.
    if (n.href) navigate(hrefToNavigateOptions(n.href));
  };

  // Linear-style keys: arrows step the list, Enter opens the linked entity,
  // `x` checks the focused row while selecting, and Escape backs out of
  // selection mode first and the selected row second. Skipped while typing.
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
      } else if (e.key === "x" || e.key === "X") {
        if (!isSelecting || selectedId === null) return;
        e.preventDefault();
        toggle(selectedId);
      } else if (e.key === "Escape") {
        if (isSelecting) {
          exit();
          return;
        }
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    filtered,
    selected,
    selectedId,
    setSelectedId,
    handleSelect,
    handleOpen,
    isSelecting,
    toggle,
    exit,
  ]);

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
          // `relative`: the floating bulk bar anchors to this pane, not the page.
          <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
            <InboxHeader
              filter={filter}
              group={group}
              unreadCount={unreadCount}
              isSelecting={isSelecting}
              onFilterChange={setFilter}
              onGroupChange={setGroup}
              onToggleSelecting={() => (isSelecting ? exit() : start())}
              onMarkAllRead={markAllRead}
            />
            {/* Region divider between the header and the notification list. */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border">
              <InboxListPane
                notifications={filtered}
                filter={filter}
                group={group}
                repoById={repoById}
                selectedId={selectedId}
                onSelect={handleSelect}
                onMarkRead={handleMarkRead}
                onToggleRead={handleToggleRead}
                onToggleArchive={handleToggleArchive}
                isSelecting={isSelecting}
                checkedIds={selectedIds}
                onToggleCheck={(n, extend) => toggle(n._id, extend)}
              />
            </div>
            <InboxBulkBar
              isSelecting={isSelecting}
              selectedCount={checkedIds.length}
              totalCount={(filtered ?? []).length}
              viewingArchived={filter === "archived"}
              onExitSelect={exit}
              onSelectAll={selectAll}
              onClearSelection={clear}
              onMarkRead={() => runBulk((ids) => markMany(ids, true))}
              onMarkUnread={() => runBulk((ids) => markMany(ids, false))}
              onArchive={() => runBulk(archive)}
              onUnarchive={() => runBulk(unarchive)}
            />
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
