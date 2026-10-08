import { describe, expect, test } from "vitest";
import { overlayRect, type Rect } from "./previewIframeHost";
import {
  previewGestureOffsets,
  type PreviewMiniPlayerFrame,
} from "./usePreviewMiniPlayerFrame";

/**
 * The mini-player window and the iframe it shows live in different trees: the
 * window is a fixed box positioned from the bottom-right corner, the iframe is
 * an overlay the host paints at a top-left rect it measures. Dragging the
 * window changes neither its size nor any scroll position, so nothing tells
 * the host to re-measure — the window publishes the offsets it is applying and
 * the overlay adds them in the same commit.
 *
 * That makes the two halves a round trip, and a sign error in either one shows
 * up only as an iframe drifting away from the window that owns it. Rather than
 * restate the offset formula, these tests derive the window's painted box from
 * the corner anchoring (`left = viewport.width - right - width`) and assert the
 * offsets carry the overlay to exactly that box.
 */

const VIEWPORT = { width: 1440, height: 900 };

/** Where a corner-anchored frame actually paints, per `position: fixed`. */
function paintedBox(frame: PreviewMiniPlayerFrame): Rect {
  return {
    top: VIEWPORT.height - frame.bottom - frame.height,
    left: VIEWPORT.width - frame.right - frame.width,
    width: frame.width,
    height: frame.height,
  };
}

/** Parked well clear of every edge, so no case here would be clamped. */
const ORIGIN: PreviewMiniPlayerFrame = {
  right: 200,
  bottom: 150,
  width: 400,
  height: 260,
};

/** The overlay rect after the window moves from ORIGIN to `next`. */
function overlayAfter(next: PreviewMiniPlayerFrame): Rect | null {
  return overlayRect(
    { key: "player", rect: paintedBox(ORIGIN) },
    { key: "player", ...previewGestureOffsets(ORIGIN, next) },
  );
}

describe("published gesture offsets carry the overlay to the window", () => {
  test("dragging towards the bottom-right corner", () => {
    // Pointer travel subtracts from the corner offsets: +40px right, +25 down.
    const next = {
      ...ORIGIN,
      right: ORIGIN.right - 40,
      bottom: ORIGIN.bottom - 25,
    };

    expect(overlayAfter(next)).toEqual(paintedBox(next));
  });

  test("dragging towards the top-left corner", () => {
    const next = {
      ...ORIGIN,
      right: ORIGIN.right + 120,
      bottom: ORIGIN.bottom + 90,
    };

    expect(overlayAfter(next)).toEqual(paintedBox(next));
  });

  test("growing from the bottom-right grip", () => {
    // The grip follows the pointer while the top-left stays put, so the corner
    // offsets shrink by exactly what the size gains.
    const next = {
      right: ORIGIN.right - 60,
      bottom: ORIGIN.bottom - 45,
      width: ORIGIN.width + 60,
      height: ORIGIN.height + 45,
    };

    expect(overlayAfter(next)).toEqual(paintedBox(next));
    expect(overlayAfter(next)).toMatchObject({
      top: paintedBox(ORIGIN).top,
      left: paintedBox(ORIGIN).left,
    });
  });

  test("shrinking from the bottom-right grip", () => {
    const next = {
      right: ORIGIN.right + 80,
      bottom: ORIGIN.bottom + 50,
      width: ORIGIN.width - 80,
      height: ORIGIN.height - 50,
    };

    expect(overlayAfter(next)).toEqual(paintedBox(next));
  });

  test("a press that has not moved yet leaves the overlay alone", () => {
    expect(previewGestureOffsets(ORIGIN, ORIGIN)).toEqual({
      dx: 0,
      dy: 0,
      dWidth: 0,
      dHeight: 0,
    });
    expect(overlayAfter(ORIGIN)).toEqual(paintedBox(ORIGIN));
  });
});

describe("overlay rects during a gesture", () => {
  test("only the anchor being manipulated takes the offsets", () => {
    const other = { key: "other-panel", rect: paintedBox(ORIGIN) };

    expect(
      overlayRect(other, {
        key: "player",
        dx: 40,
        dy: 25,
        dWidth: 0,
        dHeight: 0,
      }),
    ).toEqual(paintedBox(ORIGIN));
  });

  test("an unmeasured anchor stays hidden rather than painting at the offsets", () => {
    expect(
      overlayRect(
        { key: "player", rect: null },
        { key: "player", dx: 40, dy: 25, dWidth: 0, dHeight: 0 },
      ),
    ).toBeNull();
  });

  test("at rest the measured rect is returned untouched", () => {
    const rect = paintedBox(ORIGIN);

    expect(overlayRect({ key: "player", rect }, null)).toBe(rect);
  });
});
