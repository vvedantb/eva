"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api, type Id } from "@eva/backend";
import { useNavigate } from "@tanstack/react-router";
import { Badge, Button, Card, CardContent } from "@eva/ui";
import { IconX } from "@tabler/icons-react";
import { AnimatePresence, m } from "motion/react";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import { playNotificationChime } from "@/lib/utils/notificationChime";
import { hrefToNavigateOptions } from "@/lib/utils/repoUrl";
import {
  NotificationIcon,
  getNotificationAppearance,
  type Notification,
} from "@/lib/components/notifications/notification-config";
import { splitNotificationTitle } from "@/lib/components/notifications/notificationTitleParts";
import { nextToastExpiryDelay } from "@/lib/components/notifications/toastExpiry";

const TOAST_LIMIT = 4;
const TOAST_TTL_MS = 9000;

/** Matches `--motion-base` / `--motion-ease-out` in globals.css. */
const TOAST_DURATION_S = 0.22;

type ToastEntry = {
  notification: Notification;
  expiresAt: number;
};

/**
 * Whether a notification has finished arriving. A mention is written to the
 * inbox before routing has judged it, and its urgency decides whether it
 * announces itself at all — so an unrouted mention is held back rather than
 * toasted on the guess that it matters. Routing lands seconds later and the
 * row arrives properly then. Every other type is complete on insert.
 */
function hasArrived(notification: Notification): boolean {
  return !(
    notification.type === "mention" && notification.urgency === undefined
  );
}

export function NotificationToastStream() {
  // `{}` is the unarchived inbox: `notifications.list` now takes an `archived`
  // flag, and toasts only ever announce live notifications.
  const notifications = useQuery(api.notifications.list, {});
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
  const navigate = useNavigate();
  const seenNotificationIdsRef = useRef<Set<Id<"notifications">> | null>(null);
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  useEffect(() => {
    if (!notifications) {
      return;
    }
    const arrived = notifications.filter(hasArrived);
    const currentIds = new Set(arrived.map((notification) => notification._id));
    const seenNotificationIds = seenNotificationIdsRef.current;
    if (!seenNotificationIds) {
      seenNotificationIdsRef.current = currentIds;
      return;
    }

    const newlyArrived = arrived.filter(
      (notification) => !seenNotificationIds.has(notification._id),
    );
    seenNotificationIdsRef.current = currentIds;

    // Routing judged these incidental, so they are inbox-only: seen (they will
    // not toast later) but never announced.
    const announced = newlyArrived.filter(
      (notification) => notification.urgency !== "low",
    );
    if (announced.length === 0) {
      return;
    }

    // One chime per batch, however many landed together, and only for unread
    // arrivals. `list` returns the newest 100, so pruning an old notification
    // pulls the next one into the window and it reads as newly arrived â€” but
    // anything resurfacing that way is long since read.
    if (announced.some((notification) => !notification.read)) {
      playNotificationChime();
    }

    setToasts((previous) => {
      const existingIds = new Set(
        previous.map((entry) => entry.notification._id),
      );
      const next = [...previous];
      const now = Date.now();
      for (const notification of [...announced].reverse()) {
        if (existingIds.has(notification._id)) {
          continue;
        }
        next.unshift({
          notification,
          expiresAt: now + TOAST_TTL_MS,
        });
        existingIds.add(notification._id);
      }
      return next.slice(0, TOAST_LIMIT);
    });
  }, [notifications]);

  useEffect(() => {
    const delay = nextToastExpiryDelay(
      toasts.map((entry) => entry.expiresAt),
      Date.now(),
    );
    if (delay === null) return;
    const timeoutId = window.setTimeout(() => {
      const now = Date.now();
      setToasts((previous) =>
        previous.filter((entry) => entry.expiresAt > now),
      );
    }, delay);
    return () => window.clearTimeout(timeoutId);
  }, [toasts]);

  const dismissToast = (id: Id<"notifications">) => {
    setToasts((previous) =>
      previous.filter((entry) => entry.notification._id !== id),
    );
  };

  const openNotification = (notification: Notification) => {
    if (!notification.read) {
      markAsRead({ id: notification._id }).catch(() => undefined);
    }
    dismissToast(notification._id);
    if (notification.href) {
      // Same treatment as the inbox: the `repo--app` rewrite plus the search
      // split the router needs to see a comment anchor at all.
      navigate(hrefToNavigateOptions(notification.href));
      return;
    }
    navigate({ to: "/inbox" });
  };

  // Keep the fixed host mounted so AnimatePresence can play exit animations.
  const toastEase: [number, number, number, number] = [0.22, 1, 0.36, 1];
  const toastTransition = { duration: TOAST_DURATION_S, ease: toastEase };
  const toastEnter = { opacity: 0, y: -8 };
  const toastRest = { opacity: 1, y: 0 };
  const toastExit = { opacity: 0, y: -8 };

  return (
    <div
      className="pointer-events-none fixed right-4 top-20 z-40 flex w-[min(28rem,calc(100vw-2rem))] flex-col gap-2"
      aria-live="polite"
      aria-relevant="additions"
    >
      <AnimatePresence initial={false}>
        {toasts.map((entry) => {
          const notification = entry.notification;
          const config = getNotificationAppearance(notification);
          // Same two-line split as the inbox row, so a toast and the row it
          // becomes read the same way.
          const { subject, event } = splitNotificationTitle(notification);
          return (
            <m.div
              key={notification._id}
              layout
              initial={toastEnter}
              animate={toastRest}
              exit={toastExit}
              transition={toastTransition}
              className="pointer-events-auto"
            >
              <Card className="bg-popover/95 backdrop-blur-md smooth-shadow-ring-lg">
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <NotificationIcon notification={notification} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-snug">
                            {subject}
                          </p>
                          {event ? (
                            <p className="text-xs leading-snug text-muted-foreground">
                              {event}
                            </p>
                          ) : null}
                        </div>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => dismissToast(notification._id)}
                          aria-label="Dismiss notification"
                        >
                          <IconX size={14} />
                        </Button>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge
                          variant={config.badgeVariant}
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          {config.label}
                        </Badge>
                        <RelativeDateTime
                          at={notification.createdAt}
                          className="text-xs text-muted-foreground"
                        />
                      </div>
                      <div className="mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => openNotification(notification)}
                        >
                          Open
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </m.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
