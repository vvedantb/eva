import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "loading-state.tsx"),
  "utf8",
);

/**
 * The labelled loader used to own a 10 Hz `setInterval` that kept ticking
 * while the tab was hidden. The shared quantized clock is the same 0.1s
 * display and sleeps with `document.hidden`.
 */
describe("LoadingState elapsed clock", () => {
  it("uses the shared quantized clock, not a private interval", () => {
    expect(source).toContain("subscribeQuantized");
    expect(source).not.toContain("setInterval");
  });
});
