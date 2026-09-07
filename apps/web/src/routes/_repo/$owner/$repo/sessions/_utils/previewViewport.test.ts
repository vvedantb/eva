import { describe, expect, test } from "vitest";
import {
  clampPreviewViewportSize,
  framedPreviewViewport,
  migrateLegacyPreviewDevice,
  parsePreviewContainSize,
  parsePreviewViewport,
  presetViewport,
  previewIframeScale,
  resizePreviewViewport,
  rotatePreviewViewport,
  serializePreviewContainSize,
  serializePreviewViewport,
  snapshotFillViewport,
  togglePreviewContain,
  togglePreviewDevice,
} from "./previewViewport";

describe("preview viewport", () => {
  test("parses a stored freeform size and rejects junk", () => {
    expect(
      parsePreviewViewport(
        serializePreviewViewport({
          mode: "freeform",
          width: 1280,
          height: 800,
        }),
      ),
    ).toEqual({ mode: "freeform", width: 1280, height: 800 });
    expect(parsePreviewViewport("nope")).toEqual({ mode: "fill" });
    expect(parsePreviewViewport('{"mode":"preset","id":"nokia"}')).toEqual({
      mode: "fill",
    });
  });

  test("migrates the old desktop/tablet/mobile toggle", () => {
    expect(migrateLegacyPreviewDevice("desktop")).toEqual({ mode: "fill" });
    expect(migrateLegacyPreviewDevice("tablet")).toEqual(
      presetViewport("ipad-mini"),
    );
    expect(migrateLegacyPreviewDevice("mobile")).toEqual(
      presetViewport("iphone-12-pro"),
    );
  });

  test("rotate swaps sides and keeps the preset", () => {
    const phone = presetViewport("iphone-12-pro");
    expect(phone).toEqual({
      mode: "preset",
      id: "iphone-12-pro",
      width: 390,
      height: 844,
    });
    expect(rotatePreviewViewport(phone)).toEqual({
      mode: "preset",
      id: "iphone-12-pro",
      width: 844,
      height: 390,
    });
    expect(presetViewport("iphone-12-pro", "landscape")).toEqual({
      mode: "preset",
      id: "iphone-12-pro",
      width: 844,
      height: 390,
    });
  });

  test("aspect-locked resize keeps the ratio", () => {
    const next = resizePreviewViewport(
      { width: 400, height: 200 },
      { x: 200, y: 0 },
      "east",
      2,
    );
    expect(next.width / next.height).toBeCloseTo(2);
    expect(next.width).toBeGreaterThan(400);
  });

  test("snapshots fill from the live panel, clamped", () => {
    expect(snapshotFillViewport({ width: 980.4, height: 640.9 })).toEqual({
      mode: "freeform",
      width: 980,
      height: 641,
    });
    expect(snapshotFillViewport({ width: 12, height: 12 })).toEqual({
      mode: "freeform",
      width: 240,
      height: 240,
    });
  });

  test("scales the guest iframe so the logical viewport fits the panel", () => {
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

  test("clamps area so a drag cannot explode memory", () => {
    const huge = clampPreviewViewportSize({ width: 3840, height: 3840 });
    expect(huge.width * huge.height).toBeLessThanOrEqual(3840 * 2160);
  });

  test("round-trips a contain size and rejects junk", () => {
    expect(
      parsePreviewContainSize(
        serializePreviewContainSize({ width: 1280, height: 720 }),
      ),
    ).toEqual({ width: 1280, height: 720 });
    expect(parsePreviewContainSize("nope")).toEqual({
      width: 1280,
      height: 800,
    });
  });

  /**
   * The contain size is read back out of sessionStorage, so a stale entry from
   * an older build, or one edited by hand, is well-formed JSON of the wrong
   * shape. Coercion made each of these NaN, and the clamp floors NaN to the
   * 240px minimum — the preview letterboxed to a 240×240 stamp and, because the
   * bad value stays on disk, kept doing it on every reload. Well-formed JSON is
   * the case that survives `JSON.parse`, so the try/catch alone never caught it.
   */
  test.each([
    ["strings instead of numbers", '{"width":"1280","height":"800"}'],
    ["a missing height", '{"width":1280}'],
    ["an unrelated shape", '{"mode":"fill"}'],
    ["a bare number", "5"],
    ["null", "null"],
    ["an array", "[1280,800]"],
    ["a non-finite width", '{"width":1e999,"height":800}'],
  ])("falls back to the desktop frame for %s", (_label, raw) => {
    expect(parsePreviewContainSize(raw)).toEqual({ width: 1280, height: 800 });
  });

  test("still clamps a real but out-of-range stored size", () => {
    // Numbers we can trust are clamped, not discarded — only the shape is fatal.
    expect(parsePreviewContainSize('{"width":10,"height":10}')).toEqual({
      width: 240,
      height: 240,
    });
  });
});

/**
 * The preview toolbar has two toggles over one guest box: Device (frame it at a
 * chosen size) and Contain (letterbox a locked size inside the pane). They share
 * `contain` and `containSize`, and both flags survive in sessionStorage, so a
 * combination left behind by one toggle is what the other reads on the next
 * click — and on the next page load, long after the click that set it.
 *
 * Every wrong combination still renders a plausible preview at the wrong size,
 * which is exactly the failure a screenshot review waves through. The state
 * these assertions pin is: contain is meaningless outside fill mode, no toggle
 * ever leaves both on, and switching frames never loses the box the user sized.
 */
describe("preview device/contain framing", () => {
  const fill = { mode: "fill" } as const;
  const phone = presetViewport("iphone-12-pro");
  const desktop = { width: 1280, height: 800 };

  describe("framedPreviewViewport", () => {
    test("letterboxes the stored box in fill mode", () => {
      expect(
        framedPreviewViewport(fill, true, { width: 900, height: 600 }),
      ).toEqual({ mode: "freeform", width: 900, height: 600 });
    });

    test("fills the pane when contain is off", () => {
      expect(framedPreviewViewport(fill, false, desktop)).toEqual(fill);
    });

    test("ignores a stale contain flag on a device viewport", () => {
      // The device frame is already a locked box. Honouring contain here paints
      // the stored 1280×800 while the toolbar still reads "iPhone 12 Pro".
      expect(framedPreviewViewport(phone, true, desktop)).toEqual(phone);
    });
  });

  describe("togglePreviewDevice", () => {
    test("frames the pane at its live size", () => {
      const next = togglePreviewDevice(
        { viewport: fill, contain: false, containSize: desktop },
        { width: 980.4, height: 640.9 },
      );
      expect(next.viewport).toEqual({
        mode: "freeform",
        width: 980,
        height: 641,
      });
      // The frame is the same pixels the user was already looking at, so the
      // aspect lock they set on that box still applies.
      expect(next.resetAspectRatio).toBe(false);
    });

    test("falls back to a desktop frame with no pane to measure", () => {
      const next = togglePreviewDevice(
        { viewport: fill, contain: false, containSize: desktop },
        null,
      );
      expect(next.viewport).toEqual({
        mode: "freeform",
        width: 1280,
        height: 800,
      });
    });

    test("drops contain when leaving fill", () => {
      // Turning the frame on from a contained pane is the path that used to
      // leave contain set: harmless until the frame came off again, at which
      // point the pane letterboxed to a box nobody had chosen.
      const next = togglePreviewDevice(
        {
          viewport: fill,
          contain: true,
          containSize: { width: 900, height: 600 },
        },
        { width: 1440, height: 900 },
      );
      expect(next.contain).toBe(false);
      expect(
        framedPreviewViewport(next.viewport, next.contain, next.containSize),
      ).toEqual(next.viewport);
    });

    test("drops contain when returning to fill", () => {
      const next = togglePreviewDevice(
        { viewport: phone, contain: true, containSize: desktop },
        { width: 1440, height: 900 },
      );
      expect(next.viewport).toEqual(fill);
      expect(next.contain).toBe(false);
      expect(next.resetAspectRatio).toBe(true);
    });
  });

  describe("togglePreviewContain", () => {
    test("carries the device box over when the frame comes off", () => {
      const next = togglePreviewContain({
        viewport: phone,
        contain: false,
        containSize: desktop,
      });
      expect(next.viewport).toEqual(fill);
      expect(next.contain).toBe(true);
      // Same pixels, no frame: dropping the device size here would snap the
      // preview to 1280×800 the instant the button was pressed.
      expect(
        framedPreviewViewport(next.viewport, next.contain, next.containSize),
      ).toEqual({ mode: "freeform", width: 390, height: 844 });
    });

    test("flips in place in fill mode and keeps the stored box", () => {
      const on = togglePreviewContain({
        viewport: fill,
        contain: false,
        containSize: { width: 900, height: 600 },
      });
      expect(on.contain).toBe(true);
      // Not a snapshot of the pane: that would match the pane exactly and read
      // as a dead button until the splitter moved.
      expect(on.containSize).toEqual({ width: 900, height: 600 });

      const off = togglePreviewContain(on);
      expect(off.contain).toBe(false);
      expect(off.containSize).toEqual({ width: 900, height: 600 });
      expect(off.viewport).toEqual(fill);
    });

    test("round-trips a device viewport back through the device toggle", () => {
      const contained = togglePreviewContain({
        viewport: phone,
        contain: false,
        containSize: desktop,
      });
      const framed = togglePreviewDevice(contained, {
        width: 1440,
        height: 900,
      });
      // Back to a frame, sized from the pane rather than the phone — but with
      // contain off, so the two never stack.
      expect(framed.contain).toBe(false);
      expect(framed.viewport).toEqual({
        mode: "freeform",
        width: 1440,
        height: 900,
      });
    });
  });
});
