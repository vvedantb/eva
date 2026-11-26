"use client";

// useEffect: subscribe to the preview iframe's postMessages.
import { useEffect, useState } from "react";
import { PREVIEW_FRAME_MESSAGE } from "@eva/shared/previewFrameMessages";
import { isFromFrame, postToFrame } from "@/lib/utils/frameMessaging";

/**
 * Freezes the preview's animations in place, so a mid-transition state can be
 * selected and commented on. The page can also toggle it (F in select mode)
 * and reports back, so the menu check stays true to the page.
 */
export function usePreviewFreeze(iframeElement: HTMLIFrameElement | null) {
  const [frozen, setFrozen] = useState(false);

  useEffect(() => {
    if (!iframeElement?.contentWindow) return;
    function onMessage(event: MessageEvent) {
      if (!isFromFrame(event, iframeElement)) return;
      if (typeof event.data !== "object" || event.data === null) return;
      const data: object = event.data;
      const type = Reflect.get(data, "type");
      if (type === PREVIEW_FRAME_MESSAGE.annotateFrozen) {
        setFrozen(Reflect.get(data, "frozen") === true);
      }
      // A reload or navigation brings up a fresh page, which is not frozen.
      if (
        type === PREVIEW_FRAME_MESSAGE.annotateReady ||
        type === PREVIEW_FRAME_MESSAGE.navigation
      ) {
        setFrozen(false);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [iframeElement]);

  function toggle() {
    postToFrame(iframeElement, {
      type: PREVIEW_FRAME_MESSAGE.annotateFreeze,
      active: !frozen,
    });
  }

  return { frozen, toggle };
}
