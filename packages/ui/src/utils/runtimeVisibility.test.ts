import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "runtimeVisibility.ts"), "utf8");
const beam = readFileSync(join(here, "..", "ui", "border-beam.tsx"), "utf8");
const loading = readFileSync(join(here, "..", "ui", "loading-state.tsx"), "utf8");
const shimmer = readFileSync(
  join(here, "..", "ai-elements", "shimmer.tsx"),
  "utf8",
);

/**
 * #764 used `closest('[aria-hidden="true"]')`. BorderBeam, Shimmer and
 * LoadingState mark their own chrome aria-hidden, so every visible
 * composer beam and session-row Drive grid paused on attach.
 */
describe("parked-subtree pause skips decorative animation chrome", () => {
  it("does not treat an element's own aria-hidden chrome as parked", () => {
    expect(source).toContain(
      '[aria-hidden="true"]:not([data-anim-chrome])',
    );
    expect(source).not.toContain('closest(\'[aria-hidden="true"]\')');
    expect(beam).toContain("data-anim-chrome");
    expect(loading).toContain("data-anim-chrome");
    expect(shimmer).toContain("data-anim-chrome");
  });
});
