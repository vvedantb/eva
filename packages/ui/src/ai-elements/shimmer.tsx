"use client";

import type { CSSProperties, ElementType } from "react";

import { cn } from "../utils/cn";

/** Inline style plus the custom properties the shimmer band reads. */
interface ShimmerStyle extends CSSProperties {
  "--shimmer-spread": string;
  "--shimmer-duration": string;
}

export interface TextShimmerProps {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
}

/**
 * Sweeps a highlight across the text, on the compositor.
 *
 * The glyphs never repaint. The text renders once in the base colour; a copy
 * in the highlight colour sits over it, masked to a soft band, and the band's
 * element translates one way while the copy inside it translates the other by
 * the same amount — so the copy stays put over the base and only the mask
 * moves. Two transform animations and one static mask, all off the main
 * thread, where the previous `background-clip: text` + `background-position`
 * sweep repainted the text every frame (traced 32.6 → 1.9 ms/s of main thread
 * for four instances, −94%; same band, same travel, same duration). The copy is
 * `aria-hidden` and inert to pointer and selection.
 *
 * Classes and keyframes: `shimmer-*` in the host app's globals.css.
 */
export function Shimmer({
  children,
  as: Component = "p",
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps) {
  const shimmerStyle: ShimmerStyle = {
    "--shimmer-spread": `${children.length * spread}px`,
    "--shimmer-duration": `${duration}s`,
  };

  return (
    <Component
      className={cn("relative inline-block text-muted-foreground", className)}
      style={shimmerStyle}
    >
      {children}
      <span aria-hidden="true" className="shimmer-overlay">
        <span className="shimmer-band">
          <span className="shimmer-copy">{children}</span>
        </span>
      </span>
    </Component>
  );
}
