"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@eva/ui";
import { IconCamera, IconX } from "@tabler/icons-react";
import { snapshotChipLabel } from "@/lib/components/sandbox/previewSnapshot";
import { usePendingPreviewSnapshots } from "@/lib/contexts/PendingPreviewSnapshotsContext";

export function PendingSnapshotChips() {
  const snapshots = usePendingPreviewSnapshots();
  if (!snapshots || snapshots.items.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-1.5" data-testid="snapshot-chips">
      {snapshots.items.map((item) => {
        const label = snapshotChipLabel(item.snapshot);
        return (
          <Tooltip key={item.id}>
            <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-card py-0.5 pl-2 pr-1 text-xs text-foreground">
              <TooltipTrigger asChild>
                <span className="inline-flex min-w-0 flex-1 items-center gap-1">
                  <IconCamera className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{label}</span>
                </span>
              </TooltipTrigger>
              <button
                type="button"
                className="hit-target inline-flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted"
                aria-label={`Remove ${label}`}
                onClick={() => snapshots.remove(item.id)}
              >
                <IconX className="size-3" />
              </button>
            </span>
            <TooltipContent side="top" className="max-w-80">
              {item.snapshot.title} · {item.snapshot.url}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
