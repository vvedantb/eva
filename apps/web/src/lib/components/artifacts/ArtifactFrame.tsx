"use client";

import { useEffect, useRef } from "react";
import type { Id } from "@eva/backend";
import { buildArtifactSrcDoc, useArtifactBridge, type ArtifactBridgeTarget } from "@eva/shared/artifactBridge";

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
  // The bridge replies through this frame's window as JSON text, which the shim
  // parses (opaque origin, so any target origin).
  const target = useRef<ArtifactBridgeTarget>({
    postMessage: (json) => iframeRef.current?.contentWindow?.postMessage(json, "*"),
  });
  const { onMessage } = useArtifactBridge(artifactId, target);
  // The frame is an external system: take its messages from the window, from
  // this frame's own window only (an opaque origin, so match by source).
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source === iframeRef.current?.contentWindow) onMessage(event.data);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [onMessage]);
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
