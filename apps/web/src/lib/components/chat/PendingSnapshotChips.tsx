"use client";

import { IconCamera } from "@tabler/icons-react";
import {
  PendingContextChip,
  PendingContextChipRow,
} from "@/lib/components/chat/PendingContextChip";
import { snapshotChipLabel } from "@/lib/components/sandbox/previewSnapshot";
import { usePendingPreviewSnapshots } from "@/lib/contexts/PendingPreviewSnapshotsContext";

export function PendingSnapshotChips() {
  const snapshots = usePendingPreviewSnapshots();
  if (!snapshots || snapshots.items.length === 0) return null;

  return (
    <PendingContextChipRow testId="snapshot-chips">
      {snapshots.items.map((item) => (
        <PendingContextChip
          key={item.id}
          icon={
            <IconCamera className="size-3.5 shrink-0 text-muted-foreground" />
          }
          label={snapshotChipLabel(item.snapshot)}
          tooltip={`${item.snapshot.title} · ${item.snapshot.url}`}
          onRemove={() => snapshots.remove(item.id)}
        />
      ))}
    </PendingContextChipRow>
  );
}
