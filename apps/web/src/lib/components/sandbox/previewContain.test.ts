import { describe, expect, test } from "vitest";
import {
  DEFAULT_MINI_PLAYER_LOGICAL_SIZE,
  previewContainedLayout,
  previewIframeScale,
  resolveMiniPlayerLogicalSize,
} from "./previewContain";

describe("previewContainedLayout", () => {
  test("fills a matching box with no letterbox", () => {
    expect(
      previewContainedLayout(
        { width: 390, height: 844 },
        { width: 390, height: 844 },
      ),
    ).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  test("letterboxes a portrait guest in a landscape window", () => {
    const layout = previewContainedLayout(
      { width: 400, height: 200 },
      { width: 390, height: 844 },
    );
    expect(layout.scale).toBeCloseTo(200 / 844);
    expect(layout.offsetX).toBeCloseTo((400 - 390 * (200 / 844)) / 2);
    expect(layout.offsetY).toBe(0);
  });

  test("letterboxes a wide guest in a tall window", () => {
    const layout = previewContainedLayout(
      { width: 200, height: 400 },
      { width: 1280, height: 800 },
    );
    expect(layout.scale).toBeCloseTo(200 / 1280);
    expect(layout.offsetX).toBe(0);
    expect(layout.offsetY).toBeCloseTo((400 - 800 * (200 / 1280)) / 2);
  });
});

describe("previewIframeScale", () => {
  test("picks the tighter axis", () => {
    expect(
      previewIframeScale(
        { width: 195, height: 422 },
        { width: 390, height: 844 },
      ),
    ).toBe(0.5);
    expect(
      previewIframeScale(
        { width: 800, height: 600 },
        { width: 390, height: 844 },
      ),
    ).toBeCloseTo(600 / 844);
  });
});

describe("resolveMiniPlayerLogicalSize", () => {
  test("prefers the pane's device viewport", () => {
    expect(
      resolveMiniPlayerLogicalSize(
        { width: 390, height: 844 },
        { width: 980, height: 640 },
      ),
    ).toEqual({ width: 390, height: 844 });
  });

  test("snapshots the fill box when the pane has no device size", () => {
    expect(
      resolveMiniPlayerLogicalSize(null, { width: 980.4, height: 640.9 }),
    ).toEqual({ width: 980, height: 641 });
  });

  test("falls back to a desktop frame", () => {
    expect(resolveMiniPlayerLogicalSize(null, null)).toEqual(
      DEFAULT_MINI_PLAYER_LOGICAL_SIZE,
    );
    expect(
      resolveMiniPlayerLogicalSize(null, { width: 0, height: 0 }),
    ).toEqual(DEFAULT_MINI_PLAYER_LOGICAL_SIZE);
  });
});
