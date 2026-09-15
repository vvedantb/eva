/**
 * Letterbox a guest CSS viewport into a smaller painted box — the same
 * contain-and-center math t3code uses for the in-chat mini-player
 * (`resolveBrowserViewportLayout` + `fitSourceContent`).
 *
 * The hosted iframe overlay is the full mini-player body (so drag/resize
 * offsets stay a 1:1 map onto that box). Containment is a transform on the
 * iframe, not a second layout tree.
 */

export const DEFAULT_MINI_PLAYER_LOGICAL_SIZE = {
  width: 1280,
  height: 800,
} as const;

export interface PreviewBox {
  width: number;
  height: number;
}

export interface PreviewContainedLayout {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function previewIframeScale(
  visual: PreviewBox,
  logical: PreviewBox,
): number {
  if (logical.width <= 0 || logical.height <= 0) return 1;
  const scale = Math.min(
    visual.width / logical.width,
    visual.height / logical.height,
  );
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/** Uniform scale + letterbox offsets so `logical` fits inside `visual`. */
export function previewContainedLayout(
  visual: PreviewBox,
  logical: PreviewBox,
): PreviewContainedLayout {
  const scale = previewIframeScale(visual, logical);
  return {
    scale,
    offsetX: (visual.width - logical.width * scale) / 2,
    offsetY: (visual.height - logical.height * scale) / 2,
  };
}

/**
 * Mini-player always has a concrete guest viewport so the page is contained
 * instead of reflowing into the chrome. Prefer the pane's device size; fall
 * back to the live fill box; last resort is a 1280×800 desktop frame.
 */
export function resolveMiniPlayerLogicalSize(
  logical: PreviewBox | null,
  fallback: PreviewBox | null,
): PreviewBox {
  if (logical !== null && logical.width >= 1 && logical.height >= 1) {
    return {
      width: Math.round(logical.width),
      height: Math.round(logical.height),
    };
  }
  if (fallback !== null && fallback.width >= 1 && fallback.height >= 1) {
    return {
      width: Math.round(fallback.width),
      height: Math.round(fallback.height),
    };
  }
  return {
    width: DEFAULT_MINI_PLAYER_LOGICAL_SIZE.width,
    height: DEFAULT_MINI_PLAYER_LOGICAL_SIZE.height,
  };
}
