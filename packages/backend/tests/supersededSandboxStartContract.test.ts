import { describe, expect, test } from "vitest";
import { isSupersededStart } from "../convex/_sandbox/transitions";

/**
 * Found on a live sandbox (#1064): a superseded start's writes were already
 * ignored, but its remaining steps still ran on the VM, and its dev-server
 * relaunch dropped every terminal the newer start had attached. Its abort
 * handler also stopped the VM the newer start was resuming.
 */
describe("isSupersededStart", () => {
  test("an untokened start is never superseded", () => {
    expect(isSupersededStart(undefined, undefined)).toBe(false);
    expect(isSupersededStart(3, undefined)).toBe(false);
  });

  test("the current attempt is not superseded", () => {
    expect(isSupersededStart(2, 2)).toBe(false);
  });

  test("an older attempt, or a row with no attempt, is superseded", () => {
    expect(isSupersededStart(3, 2)).toBe(true);
    expect(isSupersededStart(undefined, 1)).toBe(true);
  });
});
