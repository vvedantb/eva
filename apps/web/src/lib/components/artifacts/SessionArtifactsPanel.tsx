"use client";

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { Skeleton } from "@eva/ui";
import { IconArrowUpRight } from "@tabler/icons-react";
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
  const count = artifacts?.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
        <p className="truncate text-xs font-medium text-muted-foreground">
          {count === undefined
            ? "Artifacts"
            : count === 1
              ? "1 artifact"
              : `${count} artifacts`}
        </p>
        <Link
          to="/artifacts"
          className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          View all
          <IconArrowUpRight size={14} />
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {artifacts === undefined ? (
          <div
            className="flex flex-col gap-1"
            aria-busy="true"
            aria-label="Loading artifacts"
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-surface" />
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
