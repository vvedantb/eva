import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

// Regression guard for commit f01123c18 ("unblock its arrow buttons").
//
// The lightbox takes pointer capture on its swipe surface to drive a 1:1 drag.
// Capture retargets the resulting `click` to the capturing container, so any
// button inside that surface stops firing unless the drag never starts for it.
// The opt-out is a `data-lightbox-control` marker that `onPointerDown` checks
// before capturing — so a control added without the marker is rendered, looks
// live, hovers, and does nothing. That failure is invisible in review, which
// is why the count is pinned here.
//
// Disk-read contract check (matching the suite's other *Contract tests): the
// component is a "use client" module pulling @vvedantb/ui, Radix and motion, none of
// which load in the node test environment.

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "ImageLightbox.tsx"), "utf8");

/** The capture surface: everything from its pointer handlers to the JSX end. */
function swipeSurface(): string {
  const start = source.indexOf("onPointerDown={onPointerDown}");
  expect(start, "the swipe surface's pointer handlers moved").toBeGreaterThan(
    -1,
  );
  return source.slice(start);
}

describe("ImageLightbox controls survive pointer capture", () => {
  test("pointerdown bails on a control before capturing", () => {
    // Order matters: capturing first is what swallowed the clicks.
    const guardAt = source.indexOf("closest(CONTROL_SELECTOR)");
    const captureAt = source.indexOf("setPointerCapture");
    expect(guardAt, "the control opt-out check is gone").toBeGreaterThan(-1);
    expect(captureAt, "pointer capture moved").toBeGreaterThan(-1);
    expect(guardAt, "capture is taken before the opt-out check").toBeLessThan(
      captureAt,
    );
  });

  test("the opt-out marker and the selector still agree", () => {
    expect(source).toContain(
      'const CONTROL_SELECTOR = "[data-lightbox-control]"',
    );
    expect(source).toContain("data-lightbox-control");
  });

  test("every control inside the swipe surface opts out", () => {
    const region = swipeSurface();
    const controls = [...region.matchAll(/<(?:button|a)[\s>]/g)].length;
    const optOuts = [...region.matchAll(/data-lightbox-control/g)].length;

    // A scan that found nothing would satisfy the comparison for free.
    expect(controls, "no controls found — the scan broke").toBeGreaterThan(2);
    expect(
      optOuts,
      "a control inside the swipe surface is missing data-lightbox-control, so its clicks are swallowed by pointer capture",
    ).toBe(controls);
  });
});
