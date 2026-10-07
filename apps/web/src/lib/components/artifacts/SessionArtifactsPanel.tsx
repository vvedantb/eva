"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import {
  SessionSourcePane,
  useSourcePanelItem,
} from "@/lib/components/sandbox/SessionSourcePane";
import type { ChatSourceArg } from "@/lib/components/sandbox/chatSource";
import { ArtifactList } from "./ArtifactList";
import { SourceArtifactViewer } from "./SourceArtifactViewer";

/** Artifacts created from this session / task / project chat. */
export function useSourceArtifacts(source: ChatSourceArg) {
  const artifacts = useQuery(api.artifacts.listForSource, { source });
  return { artifacts, artifactCount: artifacts?.length };
}

/**
 * Sandbox-pane list of artifacts generated in this chat. The same rows appear
 * on `/artifacts`; here a row opens inline so the chat stays in view.
 */
export function SessionArtifactsPanel({ source }: { source: ChatSourceArg }) {
  const { artifacts, artifactCount } = useSourceArtifacts(source);
  const { openRow, open, close } = useSourcePanelItem(artifacts);

  if (openRow) {
    return <SourceArtifactViewer artifact={openRow} onBack={close} />;
  }

  return (
    <SessionSourcePane
      title="Artifacts"
      count={artifactCount}
      viewAllHref="/artifacts"
      loading={artifacts === undefined}
    >
      <ArtifactList
        artifacts={artifacts ?? []}
        showSource={false}
        compact
        onOpen={open}
        emptyDescription="Artifacts created in this chat appear here and on the Artifacts page."
      />
    </SessionSourcePane>
  );
}
