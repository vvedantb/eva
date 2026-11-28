"use client";

import { useEffect } from "react";
import { PREVIEW_FRAME_MESSAGE } from "@eva/shared/previewFrameMessages";
import { isFromFrame, postToFrame } from "@/lib/utils/frameMessaging";
import { readPreviewToolbarTheme } from "../_utils/previewToolbarTheme";

export interface PreviewToolbarState {
  selectEnabled: boolean;
  commentsEnabled: boolean;
  commentsActive: boolean;
  commentCount: number;
  sketchEnabled: boolean;
  sketchActive: boolean;
}

export interface PreviewToolbarActions {
  select: () => void;
  comments: () => void;
  sketch: () => void;
  screenshot: () => void;
}

function isToolbarAction(value: unknown): value is keyof PreviewToolbarActions {
  return (
    value === "select" ||
    value === "comments" ||
    value === "sketch" ||
    value === "screenshot"
  );
}

/**
 * Connects Eva to the toolbar the proxy injects into the previewed page. The
 * page draws the buttons and reports clicks; Eva owns what select, comments,
 * sketch and screenshot do, and tells the page which of them to show and
 * whether they are on. Freeze lives wholly in the page.
 */
export function usePreviewToolbarBridge({
  iframeElement,
  state,
  actions,
}: {
  iframeElement: HTMLIFrameElement | null;
  state: PreviewToolbarState;
  actions: PreviewToolbarActions;
}) {
  const {
    selectEnabled,
    commentsEnabled,
    commentsActive,
    commentCount,
    sketchEnabled,
    sketchActive,
  } = state;

  useEffect(() => {
    function sendState() {
      postToFrame(iframeElement, {
        type: PREVIEW_FRAME_MESSAGE.toolbarState,
        selectEnabled,
        commentsEnabled,
        commentsActive,
        commentCount,
        sketchEnabled,
        sketchActive,
        theme: readPreviewToolbarTheme(),
      });
    }
    sendState();
    const themeObserver = new MutationObserver(sendState);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    function onMessage(event: MessageEvent) {
      if (!isFromFrame(event, iframeElement)) return;
      if (typeof event.data !== "object" || event.data === null) return;
      const type = Reflect.get(event.data, "type");
      if (type === PREVIEW_FRAME_MESSAGE.annotateReady) {
        sendState();
        return;
      }
      if (type !== PREVIEW_FRAME_MESSAGE.toolbarAction) return;
      const action = Reflect.get(event.data, "action");
      if (isToolbarAction(action)) actions[action]();
    }
    window.addEventListener("message", onMessage);
    return () => {
      themeObserver.disconnect();
      window.removeEventListener("message", onMessage);
    };
  }, [
    iframeElement,
    actions,
    selectEnabled,
    commentsEnabled,
    commentsActive,
    commentCount,
    sketchEnabled,
    sketchActive,
  ]);
}
