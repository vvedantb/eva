"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useLocalStorage } from "usehooks-ts";
import { z } from "zod";

const LAUNCHER_SIZE_PX = 48;
const EDGE_GAP_PX = 8;
const PANEL_GAP_PX = 8;
const DRAG_THRESHOLD_PX = 4;

const PANEL_WIDTH = "min(26rem, calc(100% - 2rem))";
const PANEL_HEIGHT = "min(40rem, calc(100% - 7rem))";

const STORAGE_KEY = "eva:ave:launcher-offset";

const offsetSchema = z.object({
  right: z.number().finite(),
  bottom: z.number().finite(),
});

type LauncherOffset = z.infer<typeof offsetSchema>;

const DEFAULT_OFFSET: LauncherOffset = { right: 16, bottom: 16 };

function deserializeOffset(raw: string): LauncherOffset {
  try {
    const parsed = offsetSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_OFFSET;
  } catch {
    return DEFAULT_OFFSET;
  }
}

interface FixedViewport {
  width: number;
  height: number;
}

function fixedViewport(element: HTMLElement): FixedViewport {
  const style = getComputedStyle(element);
  const width =
    parseFloat(style.left) + element.offsetWidth + parseFloat(style.right);
  const height =
    parseFloat(style.top) + element.offsetHeight + parseFloat(style.bottom);
  const root = document.documentElement;
  return {
    width: Number.isFinite(width) ? width : root.clientWidth,
    height: Number.isFinite(height) ? height : root.clientHeight,
  };
}

function clampOffset(
  offset: LauncherOffset,
  viewport: FixedViewport,
): LauncherOffset {
  const maxRight = Math.max(
    EDGE_GAP_PX,
    viewport.width - LAUNCHER_SIZE_PX - EDGE_GAP_PX,
  );
  const maxBottom = Math.max(
    EDGE_GAP_PX,
    viewport.height - LAUNCHER_SIZE_PX - EDGE_GAP_PX,
  );
  return {
    right: Math.min(Math.max(offset.right, EDGE_GAP_PX), maxRight),
    bottom: Math.min(Math.max(offset.bottom, EDGE_GAP_PX), maxBottom),
  };
}

/**
 * Both surfaces read the same two custom properties, so the panel follows the
 * launcher without either component knowing the other's geometry.
 *
 * The `clamp()`s are the reason there is no resize listener: a spot saved on a
 * wide monitor is pulled back on screen by CSS on a narrow one, and grows back
 * out again when the window does, with no effect and no re-render.
 */
export const LAUNCHER_POSITION_STYLE: CSSProperties = {
  right: `clamp(${EDGE_GAP_PX}px, var(--ave-launcher-right), calc(100% - ${LAUNCHER_SIZE_PX + EDGE_GAP_PX}px))`,
  bottom: `clamp(calc(${EDGE_GAP_PX}px + env(safe-area-inset-bottom)), var(--ave-launcher-bottom), calc(100% - ${LAUNCHER_SIZE_PX + EDGE_GAP_PX}px))`,
};

/**
 * The panel sits directly above the launcher, then clamps against the same
 * edges. Dragging the launcher to the top of the window therefore slides the
 * panel down to stay whole rather than letting its header run off screen.
 *
 * The height is a hard size, not a `max-h` — see `AvePanel`.
 */
export const PANEL_POSITION_STYLE: CSSProperties = {
  width: PANEL_WIDTH,
  height: PANEL_HEIGHT,
  right: `clamp(${EDGE_GAP_PX}px, var(--ave-launcher-right), calc(100% - ${PANEL_WIDTH} - ${EDGE_GAP_PX}px))`,
  bottom: `clamp(calc(${EDGE_GAP_PX}px + env(safe-area-inset-bottom)), calc(var(--ave-launcher-bottom) + ${LAUNCHER_SIZE_PX + PANEL_GAP_PX}px), calc(100% - ${PANEL_HEIGHT} - ${EDGE_GAP_PX}px))`,
};

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  origin: LauncherOffset;
  viewport: FixedViewport;
  moved: boolean;
}

export interface AveLauncherDragHandlers {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
}

export interface AveLauncherPosition {
  cssVars: CSSProperties & Record<`--${string}`, string>;
  dragHandlers: AveLauncherDragHandlers;
  isDragging: boolean;
  shouldIgnoreClick: () => boolean;
}

/**
 * Lets the user park Manager Ave's launcher anywhere on screen.
 *
 * localStorage rather than Convex for the same reason panel splits are local:
 * the corner that is out of the way depends on the window in front of you, and
 * a drag should not cost a server write.
 *
 * Pointer capture rather than window listeners — the button keeps receiving
 * move/up events once pressed even when the pointer outruns it, so there is no
 * subscription to set up and tear down and nothing to leak if a drop is missed.
 */
export function useAveLauncherPosition(): AveLauncherPosition {
  const [savedOffset, setSavedOffset] = useLocalStorage<LauncherOffset>(
    STORAGE_KEY,
    DEFAULT_OFFSET,
    { deserializer: deserializeOffset },
  );
  const [dragOffset, setDragOffset] = useState<LauncherOffset | null>(null);
  const drag = useRef<DragState | null>(null);
  const pendingClickSuppression = useRef(false);

  const offset = dragOffset ?? savedOffset;

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    pendingClickSuppression.current = false;
    const viewport = fixedViewport(event.currentTarget);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: clampOffset(savedOffset, viewport),
      viewport,
      moved: false,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (state === null || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    state.moved = true;
    setDragOffset(
      clampOffset(
        {
          right: state.origin.right - dx,
          bottom: state.origin.bottom - dy,
        },
        state.viewport,
      ),
    );
  };

  const endDrag = (event: PointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (state === null || state.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!state.moved) return;
    pendingClickSuppression.current = true;
    if (dragOffset !== null) setSavedOffset(dragOffset);
    setDragOffset(null);
  };

  return {
    cssVars: {
      "--ave-launcher-right": `${offset.right}px`,
      "--ave-launcher-bottom": `${offset.bottom}px`,
    },
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
    isDragging: dragOffset !== null,
    shouldIgnoreClick: () => {
      if (!pendingClickSuppression.current) return false;
      pendingClickSuppression.current = false;
      return true;
    },
  };
}
