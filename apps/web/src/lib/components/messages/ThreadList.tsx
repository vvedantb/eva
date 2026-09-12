"use client";

import { ListRow } from "@eva/ui";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import { statusClass, statusLabel } from "@/lib/components/messages/status";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";

type Thread = FunctionReturnType<typeof api.routedThreads.listMine>[number];

export function ThreadList({
  threads,
  selectedId,
  onSelect,
}: {
  threads: Thread[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-px p-2">
      {threads.map((thread) => (
        <ListRow
          key={thread._id}
          selected={thread._id === selectedId}
          onClick={() => onSelect(thread._id)}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 px-2 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-sm font-medium">{thread.title}</p>
              <RelativeDateTime
                at={thread.lastMessageAt}
                className="shrink-0 text-[11px] text-muted-foreground"
              />
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {thread.sourceTitle} · {thread.assigneeName}
            </p>
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs text-muted-foreground">
                {thread.lastPreview}
              </p>
              <span
                className={`shrink-0 text-[10px] font-medium uppercase ${statusClass(thread.status)}`}
              >
                {statusLabel(thread.status)}
              </span>
            </div>
          </div>
        </ListRow>
      ))}
    </div>
  );
}
