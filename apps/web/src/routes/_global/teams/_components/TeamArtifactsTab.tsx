"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { ArtifactList } from "@/lib/components/artifacts/ArtifactList";
import { ArtifactUploadDialog } from "@/lib/components/artifacts/ArtifactUploadDialog";

/** Team detail "Artifacts" tab: artifacts bound to this team, with team-scoped upload. */
export function TeamArtifactsTab({ teamId }: { teamId: Id<"teams"> }) {
  const artifacts = useQuery(api.artifacts.listForTeam, { teamId }) ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Stacks below `sm` so the blurb is not squeezed beside the Upload button. */}
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-sm:min-w-0 text-sm text-muted-foreground">
          Artifacts bound to this team. Anyone in the team can open or delete
          them.
        </p>
        <ArtifactUploadDialog defaultTeamId={teamId} />
      </div>
      <ArtifactList
        artifacts={artifacts}
        emptyDescription="Upload a Cowork artifact HTML file to host it for this team."
      />
    </div>
  );
}
