"use client";

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { Skeleton } from "@eva/ui";
import { IconArrowUpRight, IconLayoutDashboard } from "@tabler/icons-react";
import { ArtifactList } from "./ArtifactList";

export type ArtifactSourceArg =
  | { kind: "session"; sessionId: Id<"sessions"> }
  | { kind: "task"; taskId: Id<"agentTasks"> }
  | { kind: "project"; projectId: Id<"projects"> };

/** Artifacts created from this session / task / project chat. */
export function useSourceArtifacts(source: ArtifactSourceArg) {
  const artifacts = useQuery(api.artifacts.listForSource, { source });
  return {
    artifacts,
    hasArtifacts: artifacts !== undefined && artifacts.length > 0,
  };
}

/**
 * Sandbox-pane list of artifacts generated in this chat. The same rows appear
 * on `/artifacts`; cards open that viewer so both surfaces stay one object.
 */
export function SessionArtifactsPanel({
  source,
}: {
  source: ArtifactSourceArg;
}) {
  const { artifacts } = useSourceArtifacts(source);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <IconLayoutDashboard
            size={16}
            className="shrink-0 text-muted-foreground"
          />
          <p className="truncate text-sm font-medium">Artifacts</p>
        </div>
        <Link
          to="/artifacts"
          className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          All artifacts
          <IconArrowUpRight size={14} />
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 sm:px-4">
        {artifacts === undefined ? (
          <div
            className="grid grid-cols-1 gap-3"
            aria-busy="true"
            aria-label="Loading artifacts"
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-surface" />
            ))}
          </div>
        ) : (
          <ArtifactList
            artifacts={artifacts}
            showSource={false}
            compact
            emptyDescription="Artifacts created in this chat with create_artifact appear here and on the Artifacts page."
          />
        )}
      </div>
    </div>
  );
}
