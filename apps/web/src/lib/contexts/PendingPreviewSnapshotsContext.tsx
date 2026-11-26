"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  readonly sketchCount: number;
  addSketch: (file: File) => void;
  takeSketches: () => File[];
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
  const sketchesRef = useRef<File[]>([]);
  const [sketchCount, setSketchCount] = useState(0);

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
    sketchCount,
    addSketch: (file) => {
      sketchesRef.current = [...sketchesRef.current, file];
      setSketchCount(sketchesRef.current.length);
    },
    takeSketches: () => {
      const taken = sketchesRef.current;
      sketchesRef.current = [];
      if (taken.length > 0) setSketchCount(0);
      return taken;
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
