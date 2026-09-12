"use client";

import { Suspense, use, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { Spinner } from "@eva/ui";
import { IconArrowLeft, IconExternalLink } from "@tabler/icons-react";
import { ArtifactFrame } from "./ArtifactFrame";
import { EntityNotFound } from "@/lib/components/EntityNotFound";
import {
  artifactSourceLabel,
  artifactSourceRoute,
  type ArtifactSource,
} from "./_source";

type ArtifactHtmlResult =
  | { ok: true; html: string }
  | { ok: false; error: string };

const artifactHtmlCache = new Map<string, Promise<ArtifactHtmlResult>>();

function loadArtifactHtml(url: string): Promise<ArtifactHtmlResult> {
  const cached = artifactHtmlCache.get(url);
  if (cached) return cached;
  const promise = fetch(url)
    .then(async (response) => {
      if (!response.ok) {
        return {
          ok: false as const,
          error: `Failed to load artifact (status ${response.status})`,
        };
      }
      return { ok: true as const, html: await response.text() };
    })
    .catch((error: Error) => ({
      ok: false as const,
      error: error.message || String(error),
    }));
  artifactHtmlCache.set(url, promise);
  return promise;
}

function ArtifactHtmlBody({ url, title }: { url: string; title: string }) {
  const result = use(loadArtifactHtml(url));
  if (!result.ok) {
    return (
      <Centered>
        <p className="text-sm text-destructive">{result.error}</p>
      </Centered>
    );
  }
  return <ArtifactFrame html={result.html} title={title} />;
}

/** Loads an artifact's stored HTML and renders it in the bridged sandbox iframe. */
export function ArtifactViewer({ artifactId }: { artifactId: string }) {
  const artifact = useQuery(api.artifacts.get, { id: artifactId });

  if (artifact === undefined) {
    return <Centered>{<Spinner />}</Centered>;
  }
  if (artifact === null) {
    return (
      <EntityNotFound
        entityLabel="artifact"
        description="It may have been deleted, the link could be wrong, or you may not have access."
        backTo="/artifacts"
      />
    );
  }

  const url = artifact.url;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Only the artifact name is essential on a phone, so the breadcrumb and
          the new-tab label collapse to their icons and keep an accessible name. */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <Link
          to="/artifacts"
          aria-label="Back to artifacts"
          className="max-sm:hit-target flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft size={16} />
          <span className="hidden sm:inline">Artifacts</span>
        </Link>
        <span className="hidden text-muted-foreground sm:inline">/</span>
        <h1 className="min-w-0 truncate text-balance font-medium text-foreground">
          {artifact.name}
        </h1>
        {artifact.source ? (
          <SourceLink source={artifact.source} />
        ) : null}
        <button
          type="button"
          onClick={() =>
            window.open(`/artifacts/${artifact._id}`, "_blank", "noopener")
          }
          aria-label="Open in new tab"
          className="max-sm:hit-target flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconExternalLink size={16} />
          <span className="hidden sm:inline">Open in new tab</span>
        </button>
      </div>
      <div className="min-h-0 w-full flex-1 overflow-hidden rounded-surface border border-border bg-white">
        {url ? (
          <Suspense
            fallback={
              <Centered>
                <div className="flex flex-col items-center gap-2">
                  <Spinner />
                  <span className="text-sm text-muted-foreground">
                    Loading dashboard…
                  </span>
                </div>
              </Centered>
            }
          >
            <ArtifactHtmlBody key={url} url={url} title={artifact.name} />
          </Suspense>
        ) : (
          <Centered>
            <p className="text-sm text-muted-foreground">
              Artifact has no content URL.
            </p>
          </Centered>
        )}
      </div>
    </div>
  );
}

function SourceLink({ source }: { source: ArtifactSource }) {
  const route = artifactSourceRoute(source);
  const label = artifactSourceLabel(source);
  if (!route) {
    return (
      <span className="hidden min-w-0 truncate text-sm text-muted-foreground sm:inline">
        {label}
      </span>
    );
  }
  return (
    <Link
      to={route.to}
      params={route.params}
      className="hidden min-w-0 truncate text-sm text-muted-foreground hover:text-foreground sm:inline"
    >
      {label}
    </Link>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-64 items-center justify-center">
      {children}
    </div>
  );
}
