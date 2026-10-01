"use client";

import { Link } from "@tanstack/react-router";
import { useQueryState } from "nuqs";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { IconArrowUpRight } from "@tabler/icons-react";
import {
  SessionSourcePane,
  sessionSourceViewAllClass,
} from "@/lib/components/sandbox/SessionSourcePane";
import { panelArtifactParser } from "@/lib/search-params";
import { ArtifactList } from "./ArtifactList";
import { SourceArtifactViewer } from "./SourceArtifactViewer";

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
 * on `/artifacts`; here a row opens inline so the chat stays in view.
 */
export function SessionArtifactsPanel({
  source,
}: {
  source: ArtifactSourceArg;
}) {
  const { artifacts, artifactCount } = useSourceArtifacts(source);
  const [openId, setOpenId] = useQueryState(
    "panelArtifact",
    panelArtifactParser,
  );

  // Only this chat's artifacts open inline: the param can ride along in the
  // URL to another chat's panel, where it should fall back to the list.
  const isOpenLinked =
    openId !== null &&
    artifacts !== undefined &&
    artifacts.some((artifact) => artifact._id === openId);

  if (openId !== null && isOpenLinked) {
    return (
      <SourceArtifactViewer
        artifactId={openId}
        onBack={() => void setOpenId(null)}
      />
    );
  }

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
        onOpen={(artifactId) => void setOpenId(artifactId)}
        emptyDescription="Artifacts created in this chat appear here and on the Artifacts page."
      />
    </SessionSourcePane>
  );
}
