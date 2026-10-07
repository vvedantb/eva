import { describe, expect, it } from "vitest";
import {
  isComposerVisible,
  type ComposerElement,
} from "@/lib/components/chat/_components/composerVisibility";

/**
 * A stand-in for the editor's root element. The three reads below are the whole
 * contract, so a fake keeps the rule testable in the node environment the rest
 * of the suite runs in.
 */
function editor(overrides: Partial<ComposerElement> = {}): ComposerElement {
  return {
    isConnected: true,
    getClientRects: () => ({ length: 1 }),
    closest: () => null,
    ...overrides,
  };
}

/**
 * Up to three session shells and Manager Ave's panel stay mounted at once, so
 * anything that listens on `document` reaches every one of them. Each rule here
 * is one of the ways a mounted composer can be invisible; missing any of them
 * put a stray keystroke into every hidden draft.
 */
describe("isComposerVisible", () => {
  it("accepts a rendered, visible editor", () => {
    expect(isComposerVisible(editor())).toBe(true);
  });

  it("rejects a missing editor", () => {
    expect(isComposerVisible(null)).toBe(false);
    expect(isComposerVisible(undefined)).toBe(false);
  });

  it("rejects an editor detached from the document", () => {
    expect(isComposerVisible(editor({ isConnected: false }))).toBe(false);
  });

  it("rejects an editor with no box — a `display: none` shell", () => {
    expect(
      isComposerVisible(editor({ getClientRects: () => ({ length: 0 }) })),
    ).toBe(false);
  });

  it("rejects an editor inside an aria-hidden ancestor", () => {
    const shell = editor();
    expect(
      isComposerVisible(
        editor({
          closest: (selectors) =>
            selectors === '[aria-hidden="true"]' ? shell : null,
        }),
      ),
    ).toBe(false);
  });
});
