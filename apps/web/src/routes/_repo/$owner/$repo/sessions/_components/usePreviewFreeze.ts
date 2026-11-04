"use client";

// useEffect: subscribe to the preview iframe's postMessages.
import { useEffect, useState } from "react";

/**
 * Freezes the preview's animations in place, so a mid-transition state can be
 * selected and commented on. The page can also toggle it (F in select mode)
 * and reports back, so the menu check stays true to the page.
 */
export function usePreviewFreeze(iframeElement: HTMLIFrameElement | null) {
  const [frozen, setFrozen] = useState(false);

  useEffect(() => {
    const target = iframeElement?.contentWindow;
    if (!target) return;
    function onMessage(event: MessageEvent) {
      if (event.source !== target) return;
      if (typeof event.data !== "object" || event.data === null) return;
      const data: object = event.data;
      const type = Reflect.get(data, "type");
      if (type === "eva-preview-annotate-frozen") {
        setFrozen(Reflect.get(data, "frozen") === true);
      }
      // A reload or navigation brings up a fresh page, which is not frozen.
      if (type === "eva-preview-annotate-ready" || type === "navigation") {
        setFrozen(false);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [iframeElement]);

  function toggle() {
    iframeElement?.contentWindow?.postMessage(
      { type: "eva-preview-annotate-freeze", active: !frozen },
      "*",
    );
  }

  return { frozen, toggle };
}
