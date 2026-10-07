"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useLocalStorage } from "usehooks-ts";
import { z } from "zod";
import {
  endPreviewGesture,
  setPreviewGesture,
  type PreviewGesture,
} from "./previewIframeHost";

/** Smallest gap kept between the window and a viewport edge. */
const EDGE_GAP_PX = 8;
/** Pointer travel that turns a press into a drag rather than a click. */
const DRAG_THRESHOLD_PX = 4;
const MIN_WIDTH_PX = 240;
const MIN_HEIGHT_PX = 150;

const STORAGE_KEY = "eva:preview-mini-player:frame";

/**
 * Corner-relative like the Ave launcher: the window's resting place is the
 * bottom-right, so anchoring there keeps it parked when the viewport grows.
 */
const frameSchema = z.object({
  right: z.number().finite(),
  bottom: z.number().finite(),
  width: z.number().finite().min(MIN_WIDTH_PX),
  height: z.number().finite().min(MIN_HEIGHT_PX),
});

export type PreviewMiniPlayerFrame = z.infer<typeof frameSchema>;

const DEFAULT_FRAME: PreviewMiniPlayerFrame = {
  right: 16,
  bottom: 16,
  width: 400,
  height: 260,
};

/** Stored values are parsed, not trusted: a NaN would strand the window. */
function deserializeFrame(raw: string): PreviewMiniPlayerFrame {
  try {
    const parsed = frameSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_FRAME;
  } catch {
    return DEFAULT_FRAME;
  }
}

interface Viewport {
  width: number;
  height: number;
}

/** `clientWidth` excludes a classic scrollbar, matching `position: fixed`'s box. */
function currentViewport(): Viewport {
  const root = document.documentElement;
  return { width: root.clientWidth, height: root.clientHeight };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Keeps the whole window on screen at its current size. */
function clampFrame(
  frame: PreviewMiniPlayerFrame,
  viewport: Viewport,
): PreviewMiniPlayerFrame {
  const width = clampNumber(
    frame.width,
    MIN_WIDTH_PX,
    viewport.width - 2 * EDGE_GAP_PX,
  );
  const height = clampNumber(
    frame.height,
    MIN_HEIGHT_PX,
    viewport.height - 2 * EDGE_GAP_PX,
  );
  return {
    width,
    height,
    right: clampNumber(
      frame.right,
      EDGE_GAP_PX,
      viewport.width - width - EDGE_GAP_PX,
    ),
    bottom: clampNumber(
      frame.bottom,
      EDGE_GAP_PX,
      viewport.height - height - EDGE_GAP_PX,
    ),
  };
}

/**
 * The offsets a frame change applies to the window's painted box, published so
 * the hosted iframe overlay moves with it in the same commit. The frame is
 * anchored to the bottom-right corner while the overlay paints from the
 * top-left: the box's left is `viewport.width - right - width`, so a shrinking
 * `right` and a growing `width` both push the top-left the same way.
 */
export function previewGestureOffsets(
  origin: PreviewMiniPlayerFrame,
  next: PreviewMiniPlayerFrame,
): Omit<PreviewGesture, "key"> {
  const dWidth = next.width - origin.width;
  const dHeight = next.height - origin.height;
  return {
    dx: origin.right - next.right - dWidth,
    dy: origin.bottom - next.bottom - dHeight,
    dWidth,
    dHeight,
  };
}

type Gesture = "move" | "resize";

interface GestureState {
  kind: Gesture;
  pointerId: number;
  startX: number;
  startY: number;
  origin: PreviewMiniPlayerFrame;
  /** Measured once at press: it cannot change while a pointer is captured. */
  viewport: Viewport;
  moved: boolean;
}

export interface PointerGestureHandlers {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
}

export interface PreviewMiniPlayerFrameApi {
  /** Spread onto the fixed window element. */
  style: CSSProperties;
  /** Spread onto the title bar. */
  moveHandlers: PointerGestureHandlers;
  /** Spread onto the bottom-right corner grip. */
  resizeHandlers: PointerGestureHandlers;
  /** Which gesture is live, for cursor and select-none styling. */
  gesture: Gesture | null;
}

/**
 * Where the mini-player sits and how big it is, persisted per browser.
 *
 * Pointer capture rather than window listeners — the pressed element keeps
 * receiving move/up once captured, so nothing is subscribed or leaked. While a
 * gesture runs the hosted iframes go pointer-inert (they would otherwise eat
 * the events the moment the pointer crosses one) and the hosted overlay for
 * this window follows the same offsets, since it sits outside this tree and
 * cannot see the box move.
 *
 * The CSS `clamp()`s mean no resize listener: a frame saved on a wide monitor
 * is pulled back on screen by CSS on a narrow one, and grows back out when the
 * window does, with no effect and no re-render.
 */
export function usePreviewMiniPlayerFrame(
  entryKey: string,
): PreviewMiniPlayerFrameApi {
  const [savedFrame, setSavedFrame] = useLocalStorage<PreviewMiniPlayerFrame>(
    STORAGE_KEY,
    DEFAULT_FRAME,
    { deserializer: deserializeFrame },
  );
  // Live frame while the pointer is down; `null` = at rest, so the committed
  // frame is the single source of truth between gestures.
  const [live, setLive] = useState<{
    kind: Gesture;
    frame: PreviewMiniPlayerFrame;
  } | null>(null);
  const gestureRef = useRef<GestureState | null>(null);

  const frame = live?.frame ?? savedFrame;

  const publish = (
    next: PreviewMiniPlayerFrame,
    origin: PreviewMiniPlayerFrame,
  ) => {
    setPreviewGesture({
      key: entryKey,
      ...previewGestureOffsets(origin, next),
    });
  };

  const start = (kind: Gesture) => (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const viewport = currentViewport();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = {
      kind,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      // Re-clamp: the saved frame may hang off a window that has since shrunk,
      // in which case CSS is already drawing it somewhere else.
      origin: clampFrame(savedFrame, viewport),
      viewport,
      moved: false,
    };
    setPreviewGesture({ key: entryKey, dx: 0, dy: 0, dWidth: 0, dHeight: 0 });
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const state = gestureRef.current;
    if (state === null || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    // Below the threshold this is still a click. Crossing it once latches.
    if (!state.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    state.moved = true;
    const { kind, origin, viewport } = state;
    if (kind === "move") {
      // Offsets grow towards the bottom-right corner, so pointer travel subtracts.
      const moved = clampFrame(
        { ...origin, right: origin.right - dx, bottom: origin.bottom - dy },
        viewport,
      );
      setLive({ kind, frame: moved });
      publish(moved, origin);
      return;
    }
    // Resize from the bottom-right corner: that corner follows the pointer
    // while the top-left stays put, so the offsets shrink as the size grows.
    const right = Math.max(origin.right - dx, EDGE_GAP_PX);
    const bottom = Math.max(origin.bottom - dy, EDGE_GAP_PX);
    const resized = clampFrame(
      {
        right,
        bottom,
        width: origin.width + (origin.right - right),
        height: origin.height + (origin.bottom - bottom),
      },
      viewport,
    );
    setLive({ kind, frame: resized });
    publish(resized, origin);
  };

  const end = (event: PointerEvent<HTMLElement>) => {
    const state = gestureRef.current;
    if (state === null || state.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    endPreviewGesture();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!state.moved) return;
    // Batched with the reset, so no frame renders at the old saved offset
    // between letting go and the write landing.
    if (live !== null) setSavedFrame(live.frame);
    setLive(null);
  };

  const gestureHandlers = (kind: Gesture): PointerGestureHandlers => ({
    onPointerDown: start(kind),
    onPointerMove,
    onPointerUp: end,
    onPointerCancel: end,
  });

  const maxSize = `calc(100% - ${2 * EDGE_GAP_PX}px)`;
  return {
    style: {
      width: `min(${frame.width}px, ${maxSize})`,
      height: `min(${frame.height}px, ${maxSize})`,
      right: `clamp(${EDGE_GAP_PX}px, ${frame.right}px, calc(100% - ${frame.width + EDGE_GAP_PX}px))`,
      bottom: `clamp(calc(${EDGE_GAP_PX}px + env(safe-area-inset-bottom)), ${frame.bottom}px, calc(100% - ${frame.height + EDGE_GAP_PX}px))`,
    },
    moveHandlers: gestureHandlers("move"),
    resizeHandlers: gestureHandlers("resize"),
    gesture: live?.kind ?? null,
  };
}
