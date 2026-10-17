"use client";

import { useRef, useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import { Button, Spinner, Surface, motionFast } from "@eva/ui";
import {
  IconExternalLink,
  IconLayoutDashboard,
  IconMaximize,
} from "@tabler/icons-react";
import { m } from "motion/react";
import { ArtifactContent } from "./ArtifactViewer";
import { openArtifactInNewTab } from "./_open";

/**
 * An artifact the agent saved in this turn (`create_artifact`), shown under
 * its reply. Collapsed by default: a live artifact runs its own scripts and
 * bridge, so the iframe mounts only when the user asks for the preview.
 */
export function ChatArtifactCard({
  artifact,
}: {
  artifact: { _id: Id<"artifacts">; name: string; description?: string };
}) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Same toggle as `ChatHtmlFrame`. Fullscreen needs the preview, so it also
  // expands the card; the frame mounts inside the fullscreen box.
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    setExpanded(true);
    void containerRef.current?.requestFullscreen();
  };

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionFast}
      data-testid="chat-artifact-card"
    >
      <Surface
        ref={containerRef}
        density="tight"
        className="flex min-w-0 max-w-full flex-col gap-3 [&:fullscreen]:rounded-none [&:fullscreen]:bg-background [&:fullscreen]:p-6"
      >
        <div className="flex min-w-0 items-center gap-3">
          <IconLayoutDashboard
            size={18}
            className="shrink-0 text-muted-foreground"
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-foreground">
              {artifact.name}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {artifact.description ?? "Saved artifact"}
            </span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? "Hide" : "Preview"}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            aria-label="Toggle fullscreen"
            title="Fullscreen"
            onClick={toggleFullscreen}
          >
            <IconMaximize className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            aria-label="Open in new tab"
            title="Open in new tab"
            onClick={() => openArtifactInNewTab(artifact._id)}
          >
            <IconExternalLink className="size-4" />
          </Button>
        </div>
        {expanded ? (
          <div className="h-[480px] overflow-hidden rounded-surface bg-white [:fullscreen_&]:h-auto [:fullscreen_&]:min-h-0 [:fullscreen_&]:flex-1">
            <ArtifactPreview artifact={artifact} />
          </div>
        ) : null}
      </Surface>
    </m.div>
  );
}

function ArtifactPreview({
  artifact,
}: {
  artifact: { _id: Id<"artifacts">; name: string };
}) {
  // The card rows carry no signed URL; `get` resolves it on first preview.
  const withUrl = useQuery(api.artifacts.get, { id: artifact._id });
  if (withUrl === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  return (
    <ArtifactContent
      artifactId={artifact._id}
      url={withUrl?.url ?? null}
      title={artifact.name}
    />
  );
}
