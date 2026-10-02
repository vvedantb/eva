"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { CenteredSpinner } from "@eva/ui";
import { IconExternalLink } from "@tabler/icons-react";
import {
  SessionSourceDetail,
  sessionSourceDetailTitleClass,
  sessionSourceViewAllClass,
} from "@/lib/components/sandbox/SessionSourcePane";
import { ArtifactContent } from "./ArtifactViewer";
import { openArtifactInNewTab } from "./_open";

/**
 * Artifact opened from the sandbox Artifacts tab, rendered beside the chat
 * instead of navigating to `/artifacts/$id`.
 */
export function SourceArtifactViewer({
  artifact,
  onBack,
}: {
  artifact: { _id: Id<"artifacts">; name: string };
  onBack: () => void;
}) {
  // The list rows carry no signed URL; `get` resolves it.
  const withUrl = useQuery(api.artifacts.get, { id: artifact._id });

  return (
    <SessionSourceDetail
      backLabel="Artifacts"
      onBack={onBack}
      title={<p className={sessionSourceDetailTitleClass}>{artifact.name}</p>}
      actions={
        <button
          type="button"
          onClick={() => openArtifactInNewTab(artifact._id)}
          aria-label="Open in new tab"
          title="Open in new tab"
          className={sessionSourceViewAllClass}
        >
          <IconExternalLink size={14} />
        </button>
      }
    >
      {withUrl ? (
        <div className="min-h-0 flex-1 bg-white">
          <ArtifactContent url={withUrl.url} title={artifact.name} />
        </div>
      ) : (
        <CenteredSpinner label="Loading" />
      )}
    </SessionSourceDetail>
  );
}
