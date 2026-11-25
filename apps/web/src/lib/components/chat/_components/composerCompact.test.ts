import { describe, expect, test } from "bun:test";
import { draftExceedsPillWidth, isComposerCompact } from "./composerCompact";

describe("isComposerCompact", () => {
  test("empty draft stays a pill", () => {
    expect(
      isComposerCompact({ value: "", fileCount: 0, exceedsPill: false }),
    ).toBe(true);
    expect(
      isComposerCompact({ value: "\n", fileCount: 0, exceedsPill: true }),
    ).toBe(true);
  });

  test("attachments always expand", () => {
    expect(
      isComposerCompact({ value: "", fileCount: 1, exceedsPill: false }),
    ).toBe(false);
  });

  test("a newline expands", () => {
    expect(
      isComposerCompact({
        value: "hello\nworld",
        fileCount: 0,
        exceedsPill: false,
      }),
    ).toBe(false);
  });

  test("one short line stays a pill", () => {
    expect(
      isComposerCompact({ value: "hello", fileCount: 0, exceedsPill: false }),
    ).toBe(true);
  });

  test("a line that does not fit the pill expands", () => {
    expect(
      isComposerCompact({ value: "hello", fileCount: 0, exceedsPill: true }),
    ).toBe(false);
  });
});

describe("draftExceedsPillWidth", () => {
  test("empty or unknown width never exceeds", () => {
    expect(draftExceedsPillWidth("", 200, "14px sans-serif")).toBe(false);
    expect(draftExceedsPillWidth("hello", 0, "14px sans-serif")).toBe(false);
  });
});
