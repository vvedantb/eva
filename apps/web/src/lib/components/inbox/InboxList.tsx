"use client";

import { CenteredSpinner, EmptyState } from "@vvedantb/ui";
import { IconInbox } from "@tabler/icons-react";
import type { Id } from "@eva/backend";
import { groupInboxRows } from "@eva/shared/inbox";
import { InboxRowItem } from "@/lib/components/inbox/InboxRowItem";
import type { InboxRow } from "@/lib/components/inbox/useInboxDone";
import type { RepoWithLogo } from "@/lib/utils/repoGrouping";

/**
 * The Inbox list: Holding up work, Waiting on you, New since you looked
 * (`@eva/shared/inbox`), each with a sticky label and its count.
 */
export function InboxList({
  rows,
  repoById,
  selectedKey,
  onSelect,
}: {
  /** `undefined` while the query is in flight. */
  rows: InboxRow[] | undefined;
  repoById: Map<Id<"githubRepos">, RepoWithLogo>;
  selectedKey: string | null;
  onSelect: (row: InboxRow) => void;
}) {
  if (rows === undefined) return <CenteredSpinner label="Loading inbox" />;
  if (rows.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <EmptyState.Root enter>
          <EmptyState.Icon icon={IconInbox} size={24} />
          <EmptyState.Title>Nothing new since you looked</EmptyState.Title>
        </EmptyState.Root>
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar">
      {groupInboxRows(rows).map((section) => (
        <section key={section.group} aria-label={section.label}>
          <div className="sticky top-0 z-10 bg-background px-4 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {section.label}{" "}
              <span className="tabular-nums">{section.rows.length}</span>
            </span>
          </div>
          <div className="flex flex-col gap-0.5 px-2 pb-2">
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
      ))}
    </div>
  );
}
