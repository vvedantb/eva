"use client";

import { useEffect, useRef } from "react";
import { cn } from "@eva/ui";
import { Badge, RelativeDateTime } from "@vvedantb/ui";
import { IconMessage } from "@tabler/icons-react";
import { inboxNewCountLabel, joinInboxLine } from "@eva/shared/inbox";
import { RepoLogo } from "@/lib/components/RepoLogo";
import {
  NotificationIcon,
  NotificationStatusIcon,
} from "@/lib/components/notifications/notification-config";
import { repoDisplayLabel, type RepoWithLogo } from "@/lib/utils/repoGrouping";
import type { InboxRow } from "@/lib/components/inbox/useInboxDone";

/**
 * One Inbox row, flat as the old notification feed: an unread dot, the repo
 * logo, the title over one muted line (where it is from, then the latest
 * message), and the time and a type icon on the right. The list draws the
 * dividers; a selected row is a muted background. A click selects it, which
 * shows it in the pane.
 */
export function InboxRowItem({
  row,
  repo,
  selected,
  onSelect,
}: {
  row: InboxRow;
  repo: RepoWithLogo | undefined;
  selected: boolean;
  onSelect: () => void;
}) {
  const rowRef = useRef<HTMLButtonElement>(null);
  /* eslint-disable no-effect/no-event-handler -- scrolls the DOM row into view */
  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  /* eslint-enable no-effect/no-event-handler */

  const detail = joinInboxLine(row.contextLabel, row.preview, " · ");
  return (
    // design-check-ignore-next-line — a full-width two-line row; Button would force control height and padding
    <button
      ref={rowRef}
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "motion-press flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors active:scale-[0.99] focus-visible:outline-hidden",
        selected ? "bg-muted" : "hover:bg-muted/40",
      )}
    >
      <span className="flex w-1.5 shrink-0 justify-center" aria-hidden>
        {row.unread ? <span className="size-1.5 rounded-full bg-primary" /> : null}
      </span>
      <InboxSourceAvatar repo={repo} notice={row.notice} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "truncate text-sm",
              row.unread ? "font-medium text-foreground" : "font-normal text-muted-foreground",
            )}
          >
            {row.title}
          </span>
          {row.action === "answer" ? (
            <Badge variant="warning" className="h-4 shrink-0 px-1.5 text-3xs">
              Question
            </Badge>
          ) : null}
          {row.action === "review" ? (
            <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-3xs">
              PR
            </Badge>
          ) : null}
          {row.newCount !== undefined ? (
            <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-3xs">
              {inboxNewCountLabel(row.newCount)}
            </Badge>
          ) : null}
        </span>
        {detail ? (
          <span className="truncate text-xs leading-relaxed text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </span>
      <RelativeDateTime
        at={row.at}
        className="shrink-0 text-xs tabular-nums text-muted-foreground"
      />
      {row.notice ? (
        <NotificationStatusIcon notification={row.notice} />
      ) : (
        <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden>
          <IconMessage size={16} className="text-muted-foreground" />
        </span>
      )}
    </button>
  );
}

function InboxSourceAvatar({
  repo,
  notice,
}: {
  repo: RepoWithLogo | undefined;
  notice: InboxRow["notice"];
}) {
  if (!repo) {
    return notice ? (
      <NotificationIcon notification={notice} size="sm" />
    ) : (
      <span className="size-7 shrink-0 rounded-full bg-muted" aria-hidden />
    );
  }
  return (
    <span className="size-7 shrink-0">
      <RepoLogo
        logoUrl={repo.logoUrl}
        size={28}
        fallback={
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
            {repoDisplayLabel(repo).charAt(0).toUpperCase()}
          </span>
        }
      />
    </span>
  );
}
