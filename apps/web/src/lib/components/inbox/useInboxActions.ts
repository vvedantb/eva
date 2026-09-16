"use client";

import { useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import { api, type Id } from "@eva/backend";
import { toast } from "@eva/ui";
import { catchMutationError } from "@/lib/utils/mutationToast";
import type { Notification } from "@/lib/components/notifications/notification-config";

/** Which half of the inbox the UI is subscribed to (see `notifications.list`). */
export interface InboxListArgs {
  archived: boolean;
}

/** Rewrites the list the inbox is currently showing. */
function patchList(
  localStore: OptimisticLocalStore,
  listArgs: InboxListArgs,
  patch: (notification: Notification) => Notification,
): void {
  const current = localStore.getQuery(api.notifications.list, listArgs);
  if (current === undefined) return;
  localStore.setQuery(api.notifications.list, listArgs, current.map(patch));
}

/** Moves the unread badge by `delta`, never below zero. */
function adjustUnread(localStore: OptimisticLocalStore, delta: number): void {
  const count = localStore.getQuery(api.notifications.countUnread, {});
  if (count === undefined) return;
  localStore.setQuery(
    api.notifications.countUnread,
    {},
    Math.max(0, count + delta),
  );
}

/** Flips a set of rows' read state and moves the badge by what actually changed. */
function setManyRead(
  localStore: OptimisticLocalStore,
  listArgs: InboxListArgs,
  ids: ReadonlySet<string>,
  read: boolean,
): void {
  const current = localStore.getQuery(api.notifications.list, listArgs);
  if (current === undefined) return;
  const changed = current.filter(
    (n) => ids.has(n._id) && n.read !== read,
  ).length;
  localStore.setQuery(
    api.notifications.list,
    listArgs,
    current.map((n) => (ids.has(n._id) ? { ...n, read } : n)),
  );
  adjustUnread(localStore, read ? -changed : changed);
}

/**
 * Drops rows that crossed the archive line out of the list being shown. The
 * badge only moves for archiving, since unarchiving returns rows that were
 * marked read on the way in.
 */
function removeFromList(
  localStore: OptimisticLocalStore,
  listArgs: InboxListArgs,
  ids: ReadonlySet<string>,
): void {
  const current = localStore.getQuery(api.notifications.list, listArgs);
  if (current === undefined) return;
  const unreadRemoved = current.filter((n) => ids.has(n._id) && !n.read).length;
  localStore.setQuery(
    api.notifications.list,
    listArgs,
    current.filter((n) => !ids.has(n._id)),
  );
  adjustUnread(localStore, -unreadRemoved);
}

/**
 * Every write the inbox makes, as intent-level handlers: the mutation, its
 * optimistic update, and the toast that goes with it. `listArgs` is the query
 * key the page is subscribed to, so the optimistic patches land on the list the
 * user is actually looking at (the unread badge is shared by every surface).
 */
export function useInboxActions(listArgs: InboxListArgs) {
  const markAsRead = useMutation(
    api.notifications.markAsRead,
  ).withOptimisticUpdate((localStore, args) => {
    patchList(localStore, listArgs, (n) =>
      n._id === args.id ? { ...n, read: true } : n,
    );
    adjustUnread(localStore, -1);
  });

  const markAsUnread = useMutation(
    api.notifications.markAsUnread,
  ).withOptimisticUpdate((localStore, args) => {
    patchList(localStore, listArgs, (n) =>
      n._id === args.id ? { ...n, read: false } : n,
    );
    adjustUnread(localStore, 1);
  });

  const markAllAsRead = useMutation(
    api.notifications.markAllAsRead,
  ).withOptimisticUpdate((localStore) => {
    patchList(localStore, listArgs, (n) => ({ ...n, read: true }));
    localStore.setQuery(api.notifications.countUnread, {}, 0);
  });

  const markManyAsRead = useMutation(
    api.notifications.markManyAsRead,
  ).withOptimisticUpdate((localStore, args) => {
    setManyRead(localStore, listArgs, new Set<string>(args.ids), true);
  });

  const markManyAsUnread = useMutation(
    api.notifications.markManyAsUnread,
  ).withOptimisticUpdate((localStore, args) => {
    setManyRead(localStore, listArgs, new Set<string>(args.ids), false);
  });

  const archiveMany = useMutation(
    api.notifications.archiveMany,
  ).withOptimisticUpdate((localStore, args) => {
    removeFromList(localStore, listArgs, new Set<string>(args.ids));
  });

  const unarchiveMany = useMutation(
    api.notifications.unarchiveMany,
  ).withOptimisticUpdate((localStore, args) => {
    removeFromList(localStore, listArgs, new Set<string>(args.ids));
  });

  const unarchive = (ids: Id<"notifications">[]) => {
    if (ids.length === 0) return;
    void catchMutationError(
      unarchiveMany({ ids }),
      "Couldn't unarchive",
      "inbox-unarchive",
    );
  };

  return {
    markRead: (id: Id<"notifications">) => {
      void catchMutationError(
        markAsRead({ id }),
        "Couldn't mark as read",
        "inbox-mark-read",
      );
    },
    markUnread: (id: Id<"notifications">) => {
      void catchMutationError(
        markAsUnread({ id }),
        "Couldn't mark as unread",
        "inbox-mark-unread",
      );
    },
    markAllRead: () => {
      void catchMutationError(
        markAllAsRead(),
        "Couldn't mark all as read",
        "inbox-mark-all-read",
      );
    },
    markMany: (ids: Id<"notifications">[], read: boolean) => {
      if (ids.length === 0) return;
      void catchMutationError(
        read ? markManyAsRead({ ids }) : markManyAsUnread({ ids }),
        read ? "Couldn't mark as read" : "Couldn't mark as unread",
        "inbox-bulk-read",
      );
    },
    // The toast fires with the optimistic update rather than after the round
    // trip: the rows are already gone from the list by then, so waiting would
    // only delay the one control that brings them back.
    archive: (ids: Id<"notifications">[]) => {
      if (ids.length === 0) return;
      void catchMutationError(
        archiveMany({ ids }),
        "Couldn't archive",
        "inbox-archive",
      );
      toast.success(`${ids.length} archived`, {
        action: { label: "Undo", onClick: () => unarchive(ids) },
      });
    },
    unarchive,
  };
}
