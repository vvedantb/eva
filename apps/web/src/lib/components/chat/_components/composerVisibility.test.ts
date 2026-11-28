import { describe, expect, it } from "bun:test";
import {
  isComposerVisible,
  type ComposerElement,
} from "@/lib/components/chat/_components/composerVisibility";

function editor(overrides: Partial<ComposerElement> = {}): ComposerElement {
  return {
    isConnected: true,
    getClientRects: () => ({ length: 1 }),
    closest: () => null,
    ...overrides,
  };
}

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
