"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Spinner, motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { IconArrowUpRight, IconInbox } from "@tabler/icons-react";
import { type Notification } from "@/lib/components/notifications/notification-config";
import { splitNotificationTitle } from "@/lib/components/notifications/notificationTitleParts";
import { MarkdownMentionText } from "@/lib/components/chat/MarkdownMentionText";
import { embedReadyMessage } from "@/lib/embed/embedded";
import { type RepoWithLogo } from "@/lib/utils/repoGrouping";
import { repoHref, toInternalRepoHref } from "@/lib/utils/repoUrl";

/**
 * The linked page itself, embedded as a same-origin iframe running the app in
 * chromeless mode (see `lib/embed/embedded.ts`). One iframe persists across
 * selections: once the embedded app announces `eva:embed-ready`, switching
 * notifications posts an `eva:embed-navigate` message and the embedded router
 * navigates in place — no SPA reboot per selection. Until that handshake (or
 * if it never arrives), switches fall back to swapping the iframe src.
 */
function NotificationPagePreview({ href }: { href: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const [booted, setBooted] = useState(false);
  // The src only seeds the first document; later hrefs arrive via postMessage.
  const [initialHref] = useState(href);

  /* eslint-disable no-effect/no-event-handler, no-effect/no-adjust-state-on-prop-change --
     Drives an iframe: either postMessage into the embedded document or swap its
     `src`. Both are writes to another window, not state this component owns. */
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    if (readyRef.current && frame.contentWindow) {
      frame.contentWindow.postMessage(
        { type: "eva:embed-navigate", href },
        window.location.origin,
      );
      return;
    }
    if (frame.getAttribute("src") !== href) {
      setBooted(false);
      frame.setAttribute("src", href);
    }
  }, [href]);
  /* eslint-enable no-effect/no-event-handler, no-effect/no-adjust-state-on-prop-change */

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      if (embedReadyMessage.safeParse(event.data).success) {
        readyRef.current = true;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className="relative min-h-0 flex-1">
      {!booted ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : null}
      <iframe
        ref={frameRef}
        src={initialHref}
        onLoad={() => setBooted(true)}
        title="Notification page preview"
        className="absolute inset-0 size-full border-0 bg-background"
      />
    </div>
  );
}

interface NotificationDetailPaneProps {
  notification: Notification | undefined;
  repo: RepoWithLogo | undefined;
  onOpen: (notification: Notification) => void;
}

/**
 * Right column of the two-pane inbox: the linked page rendered live in an
 * embedded frame, with no header — the list row already names the notification
 * and the page names itself. "Open" floats over the frame and leaves the inbox
 * for the full-window page (Enter does the same from the list). Notifications
 * without a link fall back to showing the notification's own message in full.
 */
export function NotificationDetailPane({
  notification,
  repo,
  onOpen,
}: NotificationDetailPaneProps) {
  if (!notification) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
        <IconInbox className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Select a notification to preview it
        </p>
      </div>
    );
  }

  const { subject, event } = splitNotificationTitle(notification);

  // The embed iframe must stay mounted across href switches — a keyed fade
  // remounts it and drops the `eva:embed-ready` handshake / in-place navigate.
  if (notification.href) {
    return (
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
        {/* The one action the header used to hold, floated over the frame's
          corner. `bg-background` keeps it legible over whatever the embedded
          page renders underneath. */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onOpen(notification)}
          title="Open as full page"
          className="absolute right-3 top-3 z-10 h-7 gap-1 bg-background text-xs"
        >
          Open
          <IconArrowUpRight size={14} />
        </Button>
        <NotificationPagePreview href={notification.href} />
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={notification._id}
        className="relative flex h-full min-h-0 flex-col overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={motionFast}
      >
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar">
          <div className="mx-auto w-full max-w-2xl space-y-4 px-6 py-6">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-balance text-foreground">
                {subject}
              </h2>
              {event ? (
                <p className="text-sm text-muted-foreground">{event}</p>
              ) : null}
            </div>
            {notification.message ? (
              repo && notification.repoId ? (
                // Repo-scoped messages can carry `@[Label](id)` mention tokens
                // (comment/mention notifications), so they get the chip-aware
                // renderer the rest of the app uses for comment bodies.
                <MarkdownMentionText
                  text={notification.message}
                  repoBasePath={toInternalRepoHref(
                    repoHref(repo.owner, repo.name, repo.rootDirectory),
                  )}
                  repoId={notification.repoId}
                  atKind="user"
                  className="text-sm"
                />
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {notification.message}
                </p>
              )
            ) : null}
          </div>
        </div>
      </m.div>
    </AnimatePresence>
  );
}
