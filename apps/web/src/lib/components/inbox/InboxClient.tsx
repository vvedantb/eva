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
  inboxViewParser,
} from "@/lib/search-params";
import { type Notification } from "@/lib/components/notifications/notification-config";
import { InboxHeader } from "@/lib/components/inbox/InboxHeader";
import { InboxBulkBar } from "@/lib/components/inbox/InboxBulkBar";
import { InboxListPane } from "@/lib/components/inbox/InboxListPane";
import { NotificationDetailPane } from "@/lib/components/inbox/NotificationDetailPane";
import { NeedsYouList } from "@/lib/components/inbox/NeedsYouList";
import { useInboxActions } from "@/lib/components/inbox/useInboxActions";
import { useInboxSelection } from "@/lib/components/inbox/useInboxSelection";
import { ResizablePanelLayout } from "@/lib/components/ResizablePanelLayout";
import { hrefToNavigateOptions } from "@/lib/utils/repoUrl";
import { isInternalAppHref } from "@eva/shared/safeUrl";
import type { RepoWithLogo } from "@/lib/utils/repoGrouping";

/**
 * The Inbox, in two views. Needs you (the default): what waits for a person,
 * derived from live state (`NeedsYouList`), scoped to `repoId` on a repo's
 * inbox. Updates: the notification feed, two-pane (Linear-style) — the list
 * on the left, the selected notification's full content on the right.
 * Clicking a row selects it (and marks it read) instead of navigating away;
 * the detail pane owns the jump to the linked entity. Archive is reversible —
 * archived rows move to their own filter rather than leaving.
 */
export function InboxClient({
  repoId,
}: {
  repoId?: Id<"githubRepos">;
} = {}) {
  const navigate = useNavigate();
  usePageTitleSync("Inbox");
  const [view, setView] = useQueryState("view", inboxViewParser);
  const needsYou = useQuery(
    api.needsYou.list,
    view === "needs" ? (repoId === undefined ? {} : { repoId }) : "skip",
  );
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

  const { isSelecting, selectedIds, start, toggle, selectAll, clear, exit } =
    useInboxSelection((filtered ?? []).map((n) => n._id));
  const checkedIds = (filtered ?? [])
    .filter((n) => selectedIds.has(n._id))
    .map((n) => n._id);

  const selected = notifications?.find((n) => n._id === selectedId);
  const selectedRepo =
    selected?.repoId !== undefined ? repoById.get(selected.repoId) : undefined;

  const handleMarkRead = (n: Notification) => markRead(n._id);

  const handleSelect = (n: Notification) => {
    if (!n.read) markRead(n._id);
    setSelectedId(n._id);
  };

  const handleToggleRead = (n: Notification) => {
    if (n.read) markUnread(n._id);
    else markRead(n._id);
  };

  const handleToggleArchive = (n: Notification) => {
    if (n.archivedAt !== undefined) unarchive([n._id]);
    else archive([n._id]);
  };

  const runBulk = (action: (ids: Id<"notifications">[]) => void) => {
    const ids = checkedIds;
    exit();
    action(ids);
  };

  const handleOpen = (n: Notification) => {
    if (n.href && isInternalAppHref(n.href)) {
      navigate(hrefToNavigateOptions(n.href));
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (view !== "updates") return;
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
    view,
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

  const header = (
    <InboxHeader
      view={view}
      onViewChange={setView}
      filter={filter}
      group={group}
      unreadCount={unreadCount}
      isSelecting={isSelecting}
      onFilterChange={setFilter}
      onGroupChange={setGroup}
      onToggleSelecting={() => (isSelecting ? exit() : start())}
      onMarkAllRead={markAllRead}
    />
  );

  if (view === "needs") {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden animate-in fade-in duration-300">
        {header}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border">
          <NeedsYouList rows={needsYou} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full min-h-0 overflow-hidden animate-in fade-in duration-300">
      <ResizablePanelLayout
        storageKey="inbox-split"
        leftDefaultSize="40%"
        leftMinWidthPx={300}
        rightMinWidthPx={360}
        defaultRightCollapsed={false}
        leftPanel={() => (
          <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
            {header}
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
