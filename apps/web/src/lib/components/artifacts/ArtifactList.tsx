"use client";

import type { FunctionReturnType } from "convex/server";
import { type api } from "@eva/backend";
import { IconLayoutDashboard } from "@tabler/icons-react";
import { EmptyState } from "@/lib/components/ui/EmptyState";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { ArtifactCard } from "./ArtifactCard";

type ArtifactRow = FunctionReturnType<typeof api.artifacts.listAll>[number];

/** Responsive grid of artifact tiles, or an empty state. */
export function ArtifactList({
  artifacts,
  emptyDescription,
}: {
  artifacts: ArtifactRow[];
  emptyDescription: string;
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {artifacts.map((artifact, index) => (
        <ListEnter key={artifact._id} index={index}>
          <ArtifactCard artifact={artifact} />
        </ListEnter>
      ))}
    </div>
  );
}
