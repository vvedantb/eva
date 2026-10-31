import { describe, expect, test } from "vitest";
import { hasNewlyMergedPr } from "./prMergeCelebration";

describe("hasNewlyMergedPr", () => {
  test("celebrates an open PR that merges", () => {
    expect(
      hasNewlyMergedPr(
        [{ _id: "a", state: "open" }],
        [{ _id: "a", state: "merged" }],
      ),
    ).toBe(true);
  });

  test("ignores a PR first seen already merged", () => {
    expect(hasNewlyMergedPr([], [{ _id: "a", state: "merged" }])).toBe(false);
  });

  test("ignores a merged PR that stays merged", () => {
    expect(
      hasNewlyMergedPr(
        [{ _id: "a", state: "merged" }],
        [{ _id: "a", state: "merged" }],
      ),
    ).toBe(false);
  });

  test("ignores a PR that closes without merging", () => {
    expect(
      hasNewlyMergedPr(
        [{ _id: "a", state: "open" }],
        [{ _id: "a", state: "closed" }],
      ),
    ).toBe(false);
  });
});
