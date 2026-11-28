import { describe, expect, it } from "bun:test";
import {
  composeDocumentTitle,
  publishEntityTitle,
  readEntityTitle,
} from "./useDocumentTitle";

describe("publishEntityTitle", () => {
  it("keeps the newer title when the older publisher clears late", () => {
    const clearOld = publishEntityTitle("Old session");
    const clearNew = publishEntityTitle("New session");
    clearOld();
    expect(readEntityTitle()).toBe("New session");
    clearNew();
    expect(readEntityTitle()).toBeNull();
  });

  it("does not clear a newer publish of the same title", () => {
    const clearFirst = publishEntityTitle("Same name");
    const clearSecond = publishEntityTitle("Same name");
    clearFirst();
    expect(readEntityTitle()).toBe("Same name");
    clearSecond();
    expect(readEntityTitle()).toBeNull();
  });
});

describe("composeDocumentTitle", () => {
  it("names the entity ahead of the section", () => {
    expect(
      composeDocumentTitle({
        section: "Sessions",
        entity: "Fix the login redirect",
        unread: 0,
      }),
    ).toBe("Fix the login redirect · Sessions | Eva");
  });

  it("keeps the section alone when no entity is open", () => {
    expect(
      composeDocumentTitle({ section: "Projects", entity: null, unread: 0 }),
    ).toBe("Projects | Eva");
  });

  it("leads with the unread count", () => {
    expect(
      composeDocumentTitle({ section: "Sessions", entity: null, unread: 3 }),
    ).toBe("(3) Sessions | Eva");
    expect(
      composeDocumentTitle({ section: "Sessions", entity: "Ship it", unread: 12 }),
    ).toBe("(12) Ship it · Sessions | Eva");
  });

  it("shows no count when there is nothing unread", () => {
    expect(
      composeDocumentTitle({ section: "Inbox", entity: null, unread: 0 }),
    ).not.toContain("(");
  });

  it("falls back to the marketing title when nothing is named", () => {
    expect(
      composeDocumentTitle({ section: null, entity: null, unread: 4 }),
    ).toBe("Eva - Your New Coworker");
  });

  it("renders an entity with no section", () => {
    expect(
      composeDocumentTitle({ section: null, entity: "Untitled doc", unread: 0 }),
    ).toBe("Untitled doc | Eva");
  });
});
