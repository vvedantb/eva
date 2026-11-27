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
  const target = useRef<ArtifactBridgeTarget>({
    postMessage: (json) => iframeRef.current?.contentWindow?.postMessage(json, "*"),
  });
  const { onMessage } = useArtifactBridge(artifactId, target);
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
      sandbox="allow-scripts"
      className="h-full w-full border-0 bg-white"
    />
  );
}
