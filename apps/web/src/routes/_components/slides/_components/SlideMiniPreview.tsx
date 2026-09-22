import { useRef, useState, useSyncExternalStore } from "react";
import { SLIDES } from "../slides/index";
import { SlideStepContext, SlideThemeContext } from "./SlideShell";

const DESIGN_W = 1280;
const DESIGN_H = 720;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface SlideMiniPreviewProps {
  slideNumber: number;
  buildStep?: number;
  label?: string;
}

export function SlideMiniPreview({
  slideNumber,
  buildStep,
  label,
}: SlideMiniPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.25);

  const index = clamp(slideNumber - 1, 0, SLIDES.length - 1);
  const entry = SLIDES[index];
  const step = buildStep ?? entry.steps;
  const { Component, theme } = entry;

  useSyncExternalStore(
    () => {
      const el = containerRef.current;
      if (!el) return () => {};
      function measure() {
        const node = containerRef.current;
        if (!node) return;
        const { width } = node.getBoundingClientRect();
        setScale(width / DESIGN_W);
      }
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => observer.disconnect();
    },
    () => scale,
    () => scale,
  );

  return (
    <div className="space-y-1.5">
      {label ? (
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      ) : null}
      <div
        ref={containerRef}
        className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-background"
      >
        <div
          className="pointer-events-none absolute left-0 top-0 origin-top-left"
          style={{
            width: DESIGN_W,
            height: DESIGN_H,
            transform: `scale(${scale})`,
          }}
        >
          <SlideThemeContext value={theme}>
            <SlideStepContext value={step}>
              <Component />
            </SlideStepContext>
          </SlideThemeContext>
        </div>
      </div>
    </div>
  );
}
