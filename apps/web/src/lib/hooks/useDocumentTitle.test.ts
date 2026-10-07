import { describe, expect, it } from "vitest";
import { composeDocumentTitle } from "./useDocumentTitle";

/**
 * The tab title used to read "Sessions | Eva" for every session, so three
 * pinned tabs were indistinguishable. These rules pin the composition that
 * fixes that: the entity names the tab, the section stays as the suffix, and
 * the unread count leads so it survives the browser's truncation of long
 * titles.
 */
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

  /** Tabs are narrow: anything but a leading count gets truncated away. */
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

  /**
   * Landing and auth callbacks declare no `staticData.title`. The marketing
   * title is the whole string there — no " | Eva" suffix and no count, since
   * the query behind the count is skipped while signed out.
   */
  it("falls back to the marketing title when nothing is named", () => {
    expect(
      composeDocumentTitle({ section: null, entity: null, unread: 4 }),
    ).toBe("Eva - Your New Coworker");
  });

  /** A detail view can resolve before its route label does — no stray "·". */
  it("renders an entity with no section", () => {
    expect(
      composeDocumentTitle({ section: null, entity: "Untitled doc", unread: 0 }),
    ).toBe("Untitled doc | Eva");
  });
});
