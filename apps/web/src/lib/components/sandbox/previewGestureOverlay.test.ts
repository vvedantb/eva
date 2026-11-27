import { describe, expect, test } from "bun:test";
import { overlayRect, type Rect } from "./previewIframeHost";
import {
  previewGestureOffsets,
  type PreviewMiniPlayerFrame,
} from "./usePreviewMiniPlayerFrame";

const VIEWPORT = { width: 1440, height: 900 };
function paintedBox(frame: PreviewMiniPlayerFrame): Rect {
  return {
    top: VIEWPORT.height - frame.bottom - frame.height,
    left: VIEWPORT.width - frame.right - frame.width,
    width: frame.width,
    height: frame.height,
  };
}
const ORIGIN: PreviewMiniPlayerFrame = {
  right: 200,
  bottom: 150,
  width: 400,
  height: 260,
};
function overlayAfter(next: PreviewMiniPlayerFrame): Rect | null {
  return overlayRect(
    { key: "player", rect: paintedBox(ORIGIN) },
    { key: "player", ...previewGestureOffsets(ORIGIN, next) },
  );
}

describe("published gesture offsets carry the overlay to the window", () => {
  test("dragging towards the bottom-right corner", () => {
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
