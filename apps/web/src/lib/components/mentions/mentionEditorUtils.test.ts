import { describe, expect, it } from "vitest";
import { isInsertedTokenTrigger } from "./mentionEditorUtils";

// Regression: accepting a skill inserts `/label `, but a surface that collapses
// whitespace lets the browser drop that trailing space on the next keystroke.
// The value then reads as `/labelx`, which is a valid trigger, and the picker
// reopened filtering by the chip's own label.
describe("isInsertedTokenTrigger", () => {
  const inserted = { startIndex: 0, token: "/caveman-help" };

  it("suppresses a trigger that is the intact chip just inserted", () => {
    expect(isInsertedTokenTrigger("/caveman-helphello", 0, inserted)).toBe(true);
  });

  it("honours a trigger typed after the chip", () => {
    expect(
      isInsertedTokenTrigger("/caveman-help /rev", 14, inserted),
    ).toBe(false);
  });

  it("honours a trigger once the chip has been edited", () => {
    // Backspacing into a chip is how a reader picks something else instead.
    expect(isInsertedTokenTrigger("/caveman-hel", 0, inserted)).toBe(false);
  });

  it("holds only at the index the chip was inserted at", () => {
    expect(
      isInsertedTokenTrigger("see /caveman-help", 4, {
        startIndex: 0,
        token: "/caveman-help",
      }),
    ).toBe(false);
  });

  it("does nothing when no accept has happened", () => {
    expect(isInsertedTokenTrigger("/cave", 0, null)).toBe(false);
  });
});
