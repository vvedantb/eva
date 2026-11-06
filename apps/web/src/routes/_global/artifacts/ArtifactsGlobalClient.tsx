"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { PageWrapper } from "@/lib/components/PageWrapper";
import { LoadingSkeleton } from "@/lib/components/LoadingSkeleton";
import { ArtifactList } from "@/lib/components/artifacts/ArtifactList";
import { ArtifactUploadDialog } from "@/lib/components/artifacts/ArtifactUploadDialog";

const EMPTY_DESCRIPTION =
  "Upload a Cowork artifact HTML file to host it here. It runs live against the Eva MCP read-only tools.";

/** Global Artifacts page: every artifact across the teams the user belongs to. */
export function ArtifactsGlobalClient() {
  const artifacts = useQuery(api.artifacts.listAll);

  const isEmpty = artifacts !== undefined && artifacts.length === 0;

  return (
    <PageWrapper title="Artifacts" fillHeight={isEmpty}>
      {/* Stacks below `sm` so the blurb is not squeezed beside the Upload button. */}
      <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-sm:min-w-0 text-sm text-muted-foreground">
          Hosted dashboards that read live data through the Eva connector.
          Artifacts created in a session, task, or project stay linked to that
          chat.
        </p>
        <ArtifactUploadDialog />
      </div>
      <LoadingSkeleton
        id="artifacts-global"
        data={artifacts}
        label="Loading artifacts"
        spinnerClassName="min-h-80"
        empty={
          <ArtifactList artifacts={[]} emptyDescription={EMPTY_DESCRIPTION} />
        }
      >
        {(rows) => (
          <ArtifactList artifacts={rows} emptyDescription={EMPTY_DESCRIPTION} />
        )}
      </LoadingSkeleton>
    </PageWrapper>
  );
}
