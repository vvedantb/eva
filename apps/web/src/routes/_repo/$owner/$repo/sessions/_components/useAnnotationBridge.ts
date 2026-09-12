"use client";

// useEffect: subscribe to iframe postMessage + arm annotate mode on toggle/reload.
import { useEffect, useState, type RefObject } from "react";
import {
  parseAnnotationInbound,
  type PreviewAnnotationContext,
} from "../_utils/-previewAnnotation";

export interface AnnotationPending {
  context: PreviewAnnotationContext;
  rect: { top: number; left: number; width: number; height: number };
}

function expectedIframeOrigin(iframe: HTMLIFrameElement | null): string | null {
  if (!iframe?.src) return null;
  try {
    return new URL(iframe.src).origin;
  } catch {
    return null;
  }
}

function postAnnotateMessage(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  payload: { type: string; active?: boolean },
): void {
  const iframe = iframeRef.current;
  const origin = expectedIframeOrigin(iframe);
  if (!iframe || !origin) return;
  iframe.contentWindow?.postMessage(payload, origin);
}

/**
 * Bridges parent ↔ preview iframe annotation postMessages for one pane.
 * Mode is controlled by the parent; `ready` re-arms after reload.
 */
export function useAnnotationBridge({
  iframeRef,
  mode,
}: {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  mode: boolean;
}): {
  pending: AnnotationPending | null;
  clearPending: () => void;
} {
  const [pending, setPending] = useState<AnnotationPending | null>(null);

  const clearPending = () => {
    setPending(null);
    postAnnotateMessage(iframeRef, { type: "eva-preview-annotate-clear" });
  };

  useEffect(() => {
    postAnnotateMessage(iframeRef, {
      type: "eva-preview-annotate-mode",
      active: mode,
    });
  }, [iframeRef, mode]);

  if (!mode && pending !== null) {
    setPending(null);
  }

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const iframe = iframeRef.current;
      const origin = expectedIframeOrigin(iframe);
      if (
        !iframe ||
        event.source !== iframe.contentWindow ||
        !origin ||
        event.origin !== origin
      ) {
        return;
      }

      if (
        typeof event.data === "object" &&
        event.data !== null &&
        "type" in event.data &&
        event.data.type === "navigation"
      ) {
        setPending(null);
        return;
      }

      if (typeof event.data !== "object" || event.data === null) return;
      const inbound = parseAnnotationInbound(event.data);
      if (!inbound) return;

      if (inbound.type === "ready") {
        setPending(null);
        if (mode) {
          postAnnotateMessage(iframeRef, {
            type: "eva-preview-annotate-mode",
            active: true,
          });
        }
        return;
      }
      if (inbound.type === "selected") {
        setPending({ context: inbound.context, rect: inbound.rect });
        return;
      }
      if (inbound.type === "rect") {
        setPending((prev) => {
          if (!prev || !inbound.rect) return prev;
          return { ...prev, rect: inbound.rect };
        });
        return;
      }
      if (inbound.type === "dismissed") {
        setPending(null);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [iframeRef, mode]);

  return { pending, clearPending };
}
