"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useLocalStorage } from "usehooks-ts";
import { z } from "zod";

/** Launcher diameter (`size-12`). The drag maths needs it in px, not rem. */
const LAUNCHER_SIZE_PX = 48;
/** Smallest gap kept between the launcher — or the panel — and a viewport edge. */
const EDGE_GAP_PX = 8;
/** Gap between the launcher and the panel stacked above it. */
const PANEL_GAP_PX = 8;
/** Pointer travel that turns a press into a drag rather than a click. */
const DRAG_THRESHOLD_PX = 4;

/**
 * Sized in percentages rather than `100vw`/`100dvh`: both surfaces are
 * `position: fixed`, so a percentage resolves against the initial containing
 * block — the viewport *minus* scrollbars — while `100vw` includes the
 * scrollbar and would push the clamped launcher a scrollbar's width off screen.
 */
const PANEL_WIDTH = "min(26rem, calc(100% - 2rem))";
const PANEL_HEIGHT = "min(40rem, calc(100% - 7rem))";

const STORAGE_KEY = "eva:ave:launcher-offset";

/**
 * Distance from the viewport's bottom-right corner, in px.
 *
 * Corner-relative rather than top-left: the launcher's resting place is the
 * bottom-right, so anchoring there keeps it where the user left it when the
 * window grows, instead of drifting away from the corner it was parked in.
 */
const offsetSchema = z.object({
  right: z.number().finite(),
  bottom: z.number().finite(),
});

type LauncherOffset = z.infer<typeof offsetSchema>;

/** Where the launcher sat before it could be moved: `right-4 bottom-4`. */
const DEFAULT_OFFSET: LauncherOffset = { right: 16, bottom: 16 };

/**
 * localStorage is written by hand elsewhere and survives schema changes, so the
 * stored value is parsed rather than trusted — a `NaN` offset would propagate
 * through the clamp and leave the launcher unreachable with no way to reset it.
 */
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

/**
 * The box a `position: fixed` element is actually laid out in.
 *
 * Measured off the launcher — its used `left`/`right` plus its own width are the
 * containing block by definition — rather than read from `innerWidth` or
 * `documentElement.clientWidth`. Both of those can count a classic scrollbar as
 * usable space, and the JS clamp has to agree with the CSS `clamp()` below or a
 * drag pushes the offset past what CSS will draw, leaving the launcher pinned to
 * the edge while the pointer keeps going and jumping on the next press.
 *
 * `offsetWidth`, not `getBoundingClientRect()`: the button is mid-`:active` here
 * and its press transform must not be measured as layout.
 */
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

/** Keeps the whole launcher on screen, whatever the pointer does. */
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
  /** Measured once at press: it cannot change while a pointer is captured. */
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
  /** Spread onto an ancestor of both the launcher and the panel. */
  cssVars: CSSProperties & Record<`--${string}`, string>;
  /** Spread onto the launcher button. */
  dragHandlers: AveLauncherDragHandlers;
  isDragging: boolean;
  /** True once per drag, for the click the browser fires after the drop. */
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
  // Live position while the pointer is down; `null` means "not dragging", so
  // the committed offset is the single source of truth at rest.
  const [dragOffset, setDragOffset] = useState<LauncherOffset | null>(null);
  const drag = useRef<DragState | null>(null);
  const pendingClickSuppression = useRef(false);

  const offset = dragOffset ?? savedOffset;

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    // A drop always produces the click this flag is waiting for, but clear it
    // anyway so a swallowed click can never carry over into the next press.
    pendingClickSuppression.current = false;
    const viewport = fixedViewport(event.currentTarget);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      // Re-clamp: the saved offset may point off a window that has since been
      // made smaller, in which case CSS is already drawing it somewhere else.
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
    // Below the threshold this is still a click. Crossing it once latches, so a
    // drag that returns to its origin does not turn back into a click.
    if (!state.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    state.moved = true;
    // Offsets grow towards the bottom-right corner, so pointer travel subtracts.
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
    // Batched with the reset below, so the launcher never renders a frame at
    // the old saved offset between letting go and the write landing.
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
