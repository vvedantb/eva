"use client";

import { Button, CenteredSpinner, EmptyState } from "@vvedantb/ui";
import { IconArrowLeft, IconHistory, IconInbox } from "@tabler/icons-react";
import type { Id } from "@eva/backend";
import { groupInboxRows } from "@eva/shared/inbox";
import { InboxRowItem } from "@/lib/components/inbox/InboxRowItem";
import type { InboxRow } from "@/lib/components/inbox/useInboxDone";
import type { RepoWithLogo } from "@/lib/utils/repoGrouping";

/**
 * The Inbox list, flat as the old notification feed: a sticky label for each
 * group (Holding up work, Waiting on you, New since you looked) and divided
 * rows. In History it is one section, the whole notification feed. The
 * bottom link switches between the two.
 */
export function InboxList({
  rows,
  history,
  repoById,
  selectedKey,
  onSelect,
  onHistoryChange,
}: {
  rows: InboxRow[] | undefined;
  history: boolean;
  repoById: Map<Id<"githubRepos">, RepoWithLogo>;
  selectedKey: string | null;
  onSelect: (row: InboxRow) => void;
  onHistoryChange: (history: boolean) => void;
}) {
  if (rows === undefined) return <CenteredSpinner label="Loading inbox" />;
  const sections = history
    ? rows.length > 0
      ? [{ group: "history", label: "History", rows }]
      : []
    : groupInboxRows(rows);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar">
        {sections.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <EmptyState.Root enter>
              <EmptyState.Icon icon={IconInbox} size={24} />
              <EmptyState.Title>
                {history
                  ? "No notifications yet"
                  : "Nothing new since you looked"}
              </EmptyState.Title>
            </EmptyState.Root>
          </div>
        ) : (
          sections.map((section) => (
            <section key={section.group} aria-label={section.label}>
              <div className="sticky top-0 z-10 border-b border-border bg-background px-4 py-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {section.label}{" "}
                  <span className="tabular-nums">{section.rows.length}</span>
                </span>
              </div>
              <div className="divide-y divide-border border-b border-border">
                {section.rows.map((row) => (
                  <InboxRowItem
                    key={row.key}
                    row={row}
                    repo={row.repoId ? repoById.get(row.repoId) : undefined}
                    selected={row.key === selectedKey}
                    onSelect={() => onSelect(row)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
      <div className="shrink-0 border-t border-border px-2 py-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 text-xs text-muted-foreground"
          onClick={() => onHistoryChange(!history)}
        >
          {history ? <IconArrowLeft size={14} /> : <IconHistory size={14} />}
          {history ? "Back to Inbox" : "History"}
        </Button>
      </div>
    </div>
  );
}
