import { describe, expect, it } from "vitest";
import { optionId } from "./mentionOptionId";

/**
 * `aria-activedescendant` is resolved by id, so the editor and the row it
 * points at have to derive the same string — and that string has to survive a
 * `#id` lookup. Mention item ids are whatever the caller's domain uses
 * (`owner/repo`, `skill:name`, Convex ids) and the listbox id comes from
 * `useId`, which is `:r1:`.
 */
describe("optionId", () => {
  it("joins the listbox id and the item id", () => {
    expect(optionId("list", "preview")).toBe("list-option-preview");
  });

  it("keeps the characters an id selector can address", () => {
    expect(optionId("list", "AZaz09_-")).toBe("list-option-AZaz09_-");
  });

  it("replaces everything else, in both halves", () => {
    expect(optionId(":r1:", "owner/repo")).toBe("-r1--option-owner-repo");
    expect(optionId("list", "skill:name")).toBe("list-option-skill-name");
    expect(optionId("list", "a|b")).toBe("list-option-a-b");
    expect(optionId("list", "a b.c")).toBe("list-option-a-b-c");
  });

  it("is stable for the same input", () => {
    expect(optionId(":r7:", "docs/a b|c")).toBe(optionId(":r7:", "docs/a b|c"));
  });
});
