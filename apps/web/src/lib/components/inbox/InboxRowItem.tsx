"use client";

import { useEffect, useRef } from "react";
import { Badge, ListRow, RelativeDateTime } from "@vvedantb/ui";
import { inboxNewCountLabel } from "@eva/shared/inbox";
import { RepoLogo } from "@/lib/components/RepoLogo";
import { repoDisplayLabel, type RepoWithLogo } from "@/lib/utils/repoGrouping";
import type { InboxRow } from "@/lib/components/inbox/useInboxDone";

/**
 * One Inbox row: the source line (repo logo, where it is from, the time), the
 * title, and one line of the latest message with its counts. A blue dot marks
 * unread. A click selects it, which shows it in the pane.
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
  const rowRef = useRef<HTMLDivElement>(null);
  // Arrow keys move the selection from the list's key handler, so the row has
  // no event of its own to scroll from; nearest-block is a no-op when visible.
  /* eslint-disable no-effect/no-event-handler -- scrolls the DOM row into view */
  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  /* eslint-enable no-effect/no-event-handler */

  return (
    <ListRow
      ref={rowRef}
      selected={selected}
      onClick={onSelect}
      aria-label={row.title}
      aria-current={selected ? "true" : undefined}
      contentClassName="flex flex-col gap-0.5 px-3 py-2"
    >
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span className="flex w-1.5 shrink-0 justify-center" aria-hidden>
          {row.unread ? <span className="size-1.5 rounded-full bg-primary" /> : null}
        </span>
        {repo ? (
          <RepoLogo
            logoUrl={repo.logoUrl}
            size={14}
            fallback={
              <span className="flex size-3.5 items-center justify-center rounded-full bg-muted text-3xs font-semibold">
                {repoDisplayLabel(repo).charAt(0).toUpperCase()}
              </span>
            }
          />
        ) : null}
        <span className="min-w-0 flex-1 truncate">{row.contextLabel}</span>
        <RelativeDateTime at={row.at} className="shrink-0 tabular-nums" />
      </span>
      <span className="truncate pl-3 text-sm font-medium text-foreground">
        {row.title}
      </span>
      {row.preview || row.newCount !== undefined || row.action ? (
        <span className="flex min-w-0 items-center gap-1.5 pl-3 text-xs text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">{row.preview}</span>
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
      ) : null}
    </ListRow>
  );
}
