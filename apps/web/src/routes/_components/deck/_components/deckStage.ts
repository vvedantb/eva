import { useState } from "react";

/** Slides are authored at a fixed 16:9 canvas and scaled to whatever pane holds them. */
export const DESIGN_W = 1280;
export const DESIGN_H = 720;

interface StageScale {
  scale: number;
  /** Attach to the element the canvas must fit inside. */
  measure: (el: HTMLElement | null) => (() => void) | undefined;
}

/** Keeps the 1280×720 canvas fitted to its container, via a ref callback. */
export function useStageScale(): StageScale {
  const [scale, setScale] = useState(1);

  return {
    scale,
    measure: (el) => {
      if (!el) return;
      const read = () => {
        const { width, height } = el.getBoundingClientRect();
        if (width === 0 || height === 0) return;
        setScale(Math.min(width / DESIGN_W, height / DESIGN_H));
      };
      read();
      const observer = new ResizeObserver(read);
      observer.observe(el);
      return () => observer.disconnect();
    },
  };
}
