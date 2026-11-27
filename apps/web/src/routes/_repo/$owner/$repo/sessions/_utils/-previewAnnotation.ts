import { PREVIEW_FRAME_MESSAGE } from "@eva/shared/previewFrameMessages";
import {
  parseAnnotationContext,
  parseRect,
  type PreviewAnnotationContext,
} from "@eva/shared/previewAnnotationContext";

export {
  annotationRef,
  buildAnnotationDisplay,
  buildAnnotationPrompt,
  elementChip,
  type PreviewAnnotationContext,
} from "@eva/shared/previewAnnotationContext";

export type PreviewAnnotationInbound =
  | { type: "ready" }
  | {
      type: "selected";
      context: PreviewAnnotationContext;
      rect: { top: number; left: number; width: number; height: number };
    }
  | {
      type: "rect";
      rect: { top: number; left: number; width: number; height: number } | null;
    }
  | { type: "dismissed" };

/**
 * Narrows iframe postMessage payloads for the annotation bridge.
 * Follows PreviewNavBar's field-by-field structural checks.
 */
export function parseAnnotationInbound(
  data: object | null,
): PreviewAnnotationInbound | null {
  if (!data || !("type" in data) || typeof data.type !== "string") {
    return null;
  }
  if (data.type === PREVIEW_FRAME_MESSAGE.annotateReady) {
    return { type: "ready" };
  }
  if (data.type === PREVIEW_FRAME_MESSAGE.annotateDismissed) {
    return { type: "dismissed" };
  }
  if (data.type === PREVIEW_FRAME_MESSAGE.annotateRect) {
    if (!("rect" in data)) return null;
    if (data.rect === null) {
      return { type: "rect", rect: null };
    }
    if (typeof data.rect !== "object" || data.rect === null) return null;
    return { type: "rect", rect: parseRect(data.rect) };
  }
  if (data.type === PREVIEW_FRAME_MESSAGE.annotateSelected) {
    if (
      !("context" in data) ||
      !("rect" in data) ||
      typeof data.context !== "object" ||
      data.context === null ||
      typeof data.rect !== "object" ||
      data.rect === null
    ) {
      return null;
    }
    const context = parseAnnotationContext(data.context);
    const rect = parseRect(data.rect);
    if (!context || !rect) return null;
    return { type: "selected", context, rect };
  }
  return null;
}
