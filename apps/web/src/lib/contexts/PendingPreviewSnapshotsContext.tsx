"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { PreviewSnapshot } from "@/lib/components/sandbox/previewSnapshot";

interface PendingSnapshotItem {
  readonly id: string;
  readonly snapshot: PreviewSnapshot;
}

interface PendingPreviewSnapshotsValue {
  readonly items: ReadonlyArray<PendingSnapshotItem>;
  add: (snapshot: PreviewSnapshot) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const PendingPreviewSnapshotsContext =
  createContext<PendingPreviewSnapshotsValue | null>(null);

export function PendingPreviewSnapshotsProvider({
  children,
  initialSnapshots = [],
}: {
  children: ReactNode;
  initialSnapshots?: ReadonlyArray<PreviewSnapshot>;
}) {
  const [items, setItems] = useState<PendingSnapshotItem[]>(() =>
    initialSnapshots.map((snapshot, index) => ({
      id: `snap:seed:${index}`,
      snapshot,
    })),
  );

  const value: PendingPreviewSnapshotsValue = {
    items,
    add: (snapshot) => {
      setItems((current) => [
        ...current,
        { id: `snap:${Date.now()}:${current.length}`, snapshot },
      ]);
    },
    remove: (id) => {
      setItems((current) => current.filter((item) => item.id !== id));
    },
    clear: () => {
      setItems([]);
    },
  };

  return (
    <PendingPreviewSnapshotsContext value={value}>
      {children}
    </PendingPreviewSnapshotsContext>
  );
}

export function usePendingPreviewSnapshots():
  | PendingPreviewSnapshotsValue
  | undefined {
  return useContext(PendingPreviewSnapshotsContext) ?? undefined;
}
