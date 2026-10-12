"use client";

import { useRef } from "react";
import type { Id } from "@eva/backend";
import { buildArtifactSrcDoc } from "./_shim";
import { useArtifactBridge } from "./useArtifactBridge";

/** Renders a hosted artifact in a sandboxed iframe with the cowork bridge wired up. */
export function ArtifactFrame({
  artifactId,
  html,
  title,
}: {
  artifactId: Id<"artifacts">;
  html: string;
  title: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  useArtifactBridge(iframeRef, artifactId);
  return (
    <iframe
      ref={iframeRef}
      title={title}
      srcDoc={buildArtifactSrcDoc(html)}
      // allow-scripts WITHOUT allow-same-origin: the artifact runs in an opaque
      // origin and cannot reach eva's cookies, storage, or DOM. CDN scripts and
      // postMessage still work.
      sandbox="allow-scripts"
      className="h-full w-full border-0 bg-white"
    />
  );
}
