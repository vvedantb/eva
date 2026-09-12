"use client";

import type { FunctionReturnType } from "convex/server";
import { type api } from "@eva/backend";
import { IconLayoutDashboard } from "@tabler/icons-react";
import { EmptyState } from "@/lib/components/ui/EmptyState";
import { ArtifactCard } from "./ArtifactCard";

type ArtifactRow = FunctionReturnType<typeof api.artifacts.listAll>[number];

/** Responsive grid of artifact tiles, or an empty state. */
export function ArtifactList({
  artifacts,
  emptyDescription,
  showSource = true,
  compact = false,
}: {
  artifacts: ArtifactRow[];
  emptyDescription: string;
  showSource?: boolean;
  /** Single column — the sandbox Artifacts pane is too narrow for the grid. */
  compact?: boolean;
}) {
  if (artifacts.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center py-16">
        <EmptyState
          icon={
            <IconLayoutDashboard size={24} className="text-muted-foreground" />
          }
          title="No artifacts yet"
          description={emptyDescription}
        />
      </div>
    );
  }
  return (
    <div
      className={
        compact
          ? "grid grid-cols-1 gap-3"
          : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      }
    >
      {artifacts.map((artifact) => (
        <ArtifactCard
          key={artifact._id}
          artifact={artifact}
          showSource={showSource}
        />
      ))}
    </div>
  );
}
