import { describe, expect, test } from "bun:test";
import { cursorMovedEnough } from "./useLiveCursors";

describe("cursorMovedEnough", () => {
  test("the first position always sends", () => {
    expect(cursorMovedEnough(null, { x: 0.1, y: 0.1 })).toBe(true);
  });

  test("sub-pixel jitter does not send", () => {
    expect(
      cursorMovedEnough({ x: 40, y: 40 }, { x: 40.1, y: 40.1 }),
    ).toBe(false);
  });

  test("a real move sends", () => {
    expect(cursorMovedEnough({ x: 40, y: 40 }, { x: 41, y: 40 })).toBe(true);
  });
});
