"use client";

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { IconArrowUpRight } from "@tabler/icons-react";
import {
  SessionSourcePane,
  sessionSourceViewAllClass,
} from "@/lib/components/sandbox/SessionSourcePane";
import { ArtifactList } from "./ArtifactList";

export type ArtifactSourceArg =
  | { kind: "session"; sessionId: Id<"sessions"> }
  | { kind: "task"; taskId: Id<"agentTasks"> }
  | { kind: "project"; projectId: Id<"projects"> };

/** Artifacts created from this session / task / project chat. */
export function useSourceArtifacts(source: ArtifactSourceArg) {
  const artifacts = useQuery(api.artifacts.listForSource, { source });
  return { artifacts, artifactCount: artifacts?.length };
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
  const { artifacts, artifactCount } = useSourceArtifacts(source);

  return (
    <SessionSourcePane
      title="Artifacts"
      count={artifactCount}
      viewAll={
        <Link to="/artifacts" className={sessionSourceViewAllClass}>
          View all
          <IconArrowUpRight size={14} />
        </Link>
      }
      loading={artifacts === undefined}
    >
      <ArtifactList
        artifacts={artifacts ?? []}
        showSource={false}
        compact
        emptyDescription="Artifacts created in this chat appear here and on the Artifacts page."
      />
    </SessionSourcePane>
  );
}
