"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { CenteredSpinner } from "@eva/ui";
import { IconExternalLink } from "@tabler/icons-react";
import {
  SessionSourceDetailHeader,
  sessionSourceViewAllClass,
} from "@/lib/components/sandbox/SessionSourcePane";
import { ArtifactContent } from "./ArtifactViewer";

/**
 * Artifact opened from the sandbox Artifacts tab, rendered beside the chat
 * instead of navigating to `/artifacts/$id`.
 */
export function SourceArtifactViewer({
  artifactId,
  onBack,
}: {
  artifactId: string;
  onBack: () => void;
}) {
  const artifact = useQuery(api.artifacts.get, { id: artifactId });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SessionSourceDetailHeader backLabel="Artifacts" onBack={onBack}>
        <p className="min-w-0 flex-1 truncate px-1.5 text-[13px] font-medium tracking-[-0.01em] text-foreground">
          {artifact?.name}
        </p>
        <button
          type="button"
          onClick={() =>
            window.open(`/artifacts/${artifactId}`, "_blank", "noopener")
          }
          aria-label="Open in new tab"
          title="Open in new tab"
          className={sessionSourceViewAllClass}
        >
          <IconExternalLink size={14} />
        </button>
      </SessionSourceDetailHeader>
      {artifact === undefined ? (
        <CenteredSpinner label="Loading" />
      ) : artifact === null ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
          This artifact was deleted.
        </p>
      ) : (
        <div className="min-h-0 flex-1 bg-white">
          <ArtifactContent url={artifact.url} title={artifact.name} />
        </div>
      )}
    </div>
  );
}
