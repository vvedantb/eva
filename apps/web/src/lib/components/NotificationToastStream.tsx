"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api, type Id } from "@eva/backend";
import { patchLoadedQuery } from "@vvedantb/server";
import { useNavigate } from "@tanstack/react-router";
import {
  Badge,
  Button,
  Card,
  CardContent,
  motionEase,
  RelativeDateTime,
} from "@vvedantb/ui";
import { IconX } from "@tabler/icons-react";
import { AnimatePresence, m } from "motion/react";
import { playNotificationBell } from "@/lib/utils/notificationBell";
import { hrefToNavigateOptions } from "@/lib/utils/repoUrl";
import { isInternalAppHref } from "@eva/shared/safeUrl";
import {
  NotificationIcon,
  getNotificationAppearance,
  type Notification,
} from "@/lib/components/notifications/notification-config";
import { splitNotificationTitle } from "@eva/shared/notificationTitle";
import { nextToastExpiryDelay } from "@/lib/components/notifications/toastExpiry";
import {
  isDesktopNotificationsEnabled,
  showDesktopNotification,
} from "@/lib/components/notifications/desktopNotifications";
import {
  isAwaitingRouting,
  notificationToasts,
} from "@eva/shared/notificationRouting";

const TOAST_LIMIT = 4;
const TOAST_TTL_MS = 9000;

const TOAST_DURATION_S = 0.22;

type ToastEntry = {
  notification: Notification;
  expiresAt: number;
};

export function NotificationToastStream() {
  const notifications = useQuery(api.notifications.list, {});
  const flags = useQuery(api.auth.getExperimentalFlags);
  const isBellEnabled = flags?.notificationBell === true;
  const markAsRead = useMutation(
    api.notifications.markAsRead,
  ).withOptimisticUpdate((localStore, args) => {
    patchLoadedQuery(localStore, api.notifications.list, {}, (current) =>
      current.map((n) => (n._id === args.id ? { ...n, read: true } : n)),
    );
    patchLoadedQuery(localStore, api.notifications.countUnread, {}, (count) =>
      Math.max(0, count - 1),
    );
  });
  const navigate = useNavigate();
  const seenNotificationIdsRef = useRef<Set<Id<"notifications">> | null>(null);
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

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
    if (notification.href && isInternalAppHref(notification.href)) {
      navigate(hrefToNavigateOptions(notification.href));
      return;
    }
    navigate({ to: "/inbox" });
  };

  useEffect(() => {
    if (!notifications) {
      return;
    }
    const arrived = notifications.filter(
      (notification) => !isAwaitingRouting(notification),
    );
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

    const announced = newlyArrived.filter(notificationToasts);
    if (announced.length === 0) {
      return;
    }

    if (isBellEnabled && announced.some((notification) => !notification.read)) {
      playNotificationBell();
    }

    if (!document.hasFocus() && isDesktopNotificationsEnabled()) {
      for (const notification of announced) {
        if (notification.read) continue;
        const { subject, event } = splitNotificationTitle(notification);
        showDesktopNotification({
          id: notification._id,
          title: subject,
          body: event,
          onClick: () => openNotification(notification),
        });
      }
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
  }, [notifications, isBellEnabled]);

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

  const toastTransition = { duration: TOAST_DURATION_S, ease: motionEase };
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
                          className="h-4 px-1.5 py-0 text-3xs"
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
