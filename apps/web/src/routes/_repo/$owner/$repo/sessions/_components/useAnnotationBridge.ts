"use client";

// useEffect: subscribe to iframe postMessage + arm annotate mode on toggle/reload.
import { useEffect, useState, type RefObject } from "react";
import { PREVIEW_FRAME_MESSAGE } from "@eva/shared/previewFrameMessages";
import {
  parseAnnotationInbound,
  type PreviewAnnotationContext,
} from "../_utils/-previewAnnotation";
import { isFromFrame, postToFrame } from "@/lib/utils/frameMessaging";

export interface AnnotationPending {
  context: PreviewAnnotationContext;
  rect: { top: number; left: number; width: number; height: number };
}

function postAnnotateMessage(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  payload: {
    type:
      | typeof PREVIEW_FRAME_MESSAGE.annotateMode
      | typeof PREVIEW_FRAME_MESSAGE.annotateClear;
    active?: boolean;
  },
): void {
  postToFrame(iframeRef.current, payload);
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
    postAnnotateMessage(iframeRef, {
      type: PREVIEW_FRAME_MESSAGE.annotateClear,
    });
  };

  useEffect(() => {
    postAnnotateMessage(iframeRef, {
      type: PREVIEW_FRAME_MESSAGE.annotateMode,
      active: mode,
    });
  }, [iframeRef, mode]);

  if (!mode && pending !== null) {
    setPending(null);
  }

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!isFromFrame(event, iframeRef.current)) return;

      if (
        typeof event.data === "object" &&
        event.data !== null &&
        "type" in event.data &&
        event.data.type === PREVIEW_FRAME_MESSAGE.navigation
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
            type: PREVIEW_FRAME_MESSAGE.annotateMode,
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
