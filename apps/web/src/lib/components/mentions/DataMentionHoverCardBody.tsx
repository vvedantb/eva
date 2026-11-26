"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { Spinner } from "@vvedantb/ui";
import {
  MENTION_PREVIEW_SURFACE_CLASS,
  MentionContentPreview,
} from "./MentionContentPreview";
import { LinkPreviewCard } from "./LinkPreviewCard";
import { MentionKindIcon } from "./MentionRow";

interface DataMentionHoverCardBodyProps {
  entityId: string;
  repoId: Id<"githubRepos">;
}

/**
 * Hover preview for Data `@` chips and Eva links in chat. Documents show
 * content; sessions, quick tasks and projects use the GitHub link card layout.
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
    const preview =
      entity.content?.trim() || entity.description?.trim() || "No content yet.";
    return (
      <MentionContentPreview title={entity.label}>
        <pre className="whitespace-pre-wrap wrap-break-word font-mono text-2xs leading-relaxed text-foreground">
          {preview}
        </pre>
      </MentionContentPreview>
    );
  }

  return (
    <div className={`${MENTION_PREVIEW_SURFACE_CLASS} w-80`}>
      <LinkPreviewCard
        pill={{
          label: entity.badge,
          className: "bg-muted/60 text-muted-foreground",
          icon: <MentionKindIcon kind={entity.kind} size={12} />,
        }}
        reference={entity.numId !== undefined ? `#${entity.numId}` : null}
        updatedAt={entity.updatedAt ?? null}
        title={entity.label}
        description={entity.description}
        author={
          entity.authorName !== undefined
            ? { name: entity.authorName, avatarUrl: null }
            : null
        }
      />
    </div>
  );
}
