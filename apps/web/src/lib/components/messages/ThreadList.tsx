"use client";

import { useEffect, useRef } from "react";
import { Avatar, AvatarFallback, cn } from "@eva/ui";
import {
  IconCheck,
  IconClock,
  IconMessage,
  IconMessageQuestion,
  IconX,
} from "@tabler/icons-react";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import {
  LIST_STATUS_ORDER,
  statusClass,
  statusLabel,
} from "@/lib/components/messages/status";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";

type Thread = FunctionReturnType<typeof api.routedThreads.listMine>[number];

/**
 * Which bucket a thread sits in for *this* reader. A group thread flips to
 * `waiting_eva` the moment anyone answers, so grouping on the raw status would
 * file a question you personally still owe under "Waiting on Eva".
 */
function listStatus(thread: Thread): string {
  return thread.needsMyReply ? "waiting_human" : thread.status;
}

function groupByStatus(threads: Thread[]) {
  const groups: { status: string; label: string; items: Thread[] }[] = [];
  const bucketed = new Set<string>();
  for (const status of LIST_STATUS_ORDER) {
    const items = threads.filter((thread) => listStatus(thread) === status);
    if (items.length === 0) continue;
    for (const thread of items) bucketed.add(thread._id);
    groups.push({ status, label: statusLabel(status), items });
  }
  const leftover = threads.filter((thread) => !bucketed.has(thread._id));
  if (leftover.length > 0) {
    groups.push({ status: "other", label: "Other", items: leftover });
  }
  return groups;
}

function ThreadStatusIcon({ status }: { status: string }) {
  const className = cn("size-4", statusClass(status));
  if (status === "waiting_human") return <IconMessage className={className} />;
  if (status === "waiting_eva") return <IconClock className={className} />;
  if (status === "resolved") return <IconCheck className={className} />;
  if (status === "cancelled") return <IconX className={className} />;
  return <IconMessage className="size-4 text-muted-foreground" />;
}

function ThreadRow({
  thread,
  selected,
  onSelect,
}: {
  thread: Thread;
  selected: boolean;
  onSelect: () => void;
}) {
  const rowRef = useRef<HTMLButtonElement>(null);
  const needsReply = thread.needsMyReply;
  // Same reading as the group header above the row, not the raw thread status.
  const rowStatus = listStatus(thread);

  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <button
      ref={rowRef}
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group relative flex w-full items-center gap-3 px-4 py-3 text-left motion-press transition-colors active:scale-[0.99] focus-visible:outline-hidden",
        selected
          ? "bg-muted before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary"
          : "hover:bg-muted/40",
      )}
    >
      <span className="flex w-1.5 shrink-0 justify-center" aria-hidden>
        {needsReply ? (
          <span className="size-1.5 rounded-full bg-warning" />
        ) : null}
      </span>
      <Avatar className="size-7 shrink-0 rounded-lg">
        <AvatarFallback className="rounded-lg bg-primary/10">
          <IconMessageQuestion size={16} className="text-primary" />
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            "truncate text-sm",
            needsReply
              ? "font-medium text-foreground"
              : "text-muted-foreground",
            selected && "text-foreground",
          )}
        >
          {thread.title}
        </span>
        <span className="truncate text-xs leading-relaxed text-muted-foreground">
          {thread.lastPreview}
        </span>
      </div>
      <RelativeDateTime
        at={thread.lastMessageAt}
        className="shrink-0 text-xs tabular-nums text-muted-foreground"
      />
      <span
        role="img"
        aria-label={statusLabel(rowStatus)}
        title={statusLabel(rowStatus)}
        className="flex size-4 shrink-0 items-center justify-center"
      >
        <ThreadStatusIcon status={rowStatus} />
      </span>
    </button>
  );
}

export function ThreadList({
  threads,
  selectedId,
  onSelect,
}: {
  threads: Thread[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const groups = groupByStatus(threads);

  return (
    <div>
      {groups.map((group) => (
        <div key={group.status}>
          <div className="sticky top-0 z-10 border-b border-border bg-background px-4 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {group.label}
            </span>
          </div>
          <div className="divide-y divide-border">
            {group.items.map((thread) => (
              <ThreadRow
                key={thread._id}
                thread={thread}
                selected={thread._id === selectedId}
                onSelect={() => onSelect(thread._id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
