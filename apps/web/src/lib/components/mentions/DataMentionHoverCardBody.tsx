"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { Spinner } from "@eva/ui";
import { MentionContentPreview } from "./MentionContentPreview";

interface DataMentionHoverCardBodyProps {
  entityId: string;
  repoId: Id<"githubRepos">;
}

/**
 * Hover preview for Data `@` chips. Documents show a short description;
 * other kinds show title + type badge.
 */
export function DataMentionHoverCardBody({
  entityId,
  repoId,
}: DataMentionHoverCardBodyProps) {
  const entity = useQuery(api.mentions.getEntity, { id: entityId, repoId });

  if (entity === undefined) {
    return (
      <MentionContentPreview title="Loading…">
        <Spinner className="size-4" />
      </MentionContentPreview>
    );
  }

  if (entity === null) {
    return (
      <MentionContentPreview title="Not found">
        <p>This reference may have been deleted.</p>
      </MentionContentPreview>
    );
  }

  if (entity.kind === "document") {
    const preview = entity.description?.trim() || "No content yet.";
    return (
      <MentionContentPreview title={entity.label}>
        <pre className="whitespace-pre-wrap wrap-break-word font-mono text-[11px] leading-relaxed text-foreground">
          {preview}
        </pre>
      </MentionContentPreview>
    );
  }

  return (
    <MentionContentPreview title={entity.label}>
      <p className="text-xs text-muted-foreground">{entity.badge}</p>
      {entity.description ? (
        <p className="mt-1 text-xs leading-relaxed text-foreground">
          {entity.description}
        </p>
      ) : null}
    </MentionContentPreview>
  );
}
