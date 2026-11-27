import { useLayoutEffect, useState } from "react";

export interface IframeBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The hosted preview iframe's viewport box, kept current while it moves or
 * resizes. Null while there is no iframe, or after the owner hides (a hidden
 * `<Activity>` runs this cleanup), so body portals never float over nothing.
 */
export function useIframeBox(
  iframe: HTMLIFrameElement | null,
): IframeBox | null {
  const [box, setBox] = useState<IframeBox | null>(null);
  useLayoutEffect(() => {
    if (!iframe) return;
    function measure() {
      if (!iframe) return;
      const rect = iframe.getBoundingClientRect();
      setBox({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      });
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(iframe);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      setBox(null);
    };
  }, [iframe]);
  return box;
}
