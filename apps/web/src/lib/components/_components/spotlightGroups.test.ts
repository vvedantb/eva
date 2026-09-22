import { describe, expect, test } from "vitest";
import {
  GROUP_LABEL,
  groupHits,
  iconForHit,
  iconForRecent,
  type HitType,
  type SpotlightHit,
} from "./spotlightGroups";

/**
 * Spotlight renders results by walking a hand-written group order, so a hit
 * type that order has never heard of is dropped on the floor — the backend
 * returns it, the user typed its title, and nothing appears. The compiler does
 * not catch it: labels and icons are `Record<HitType, …>` and must be
 * exhaustive, but the order is a plain array.
 *
 * `pr` and `draft` (e5ecaa85d, 2026-09-16) were the first types added since,
 * and needed three separate edits to show up. This asserts the fourth one
 * cannot be forgotten.
 */

function hit(type: HitType): SpotlightHit {
  return {
    type,
    title: `A ${type}`,
    subtitle: "evalucom/carepulse",
    href: "/somewhere",
  };
}

const ALL_TYPES = Object.keys(GROUP_LABEL).filter((key): key is HitType =>
  Object.hasOwn(GROUP_LABEL, key),
);

describe("spotlight grouping", () => {
  test.each(ALL_TYPES)("shows %s results in their own group", (type) => {
    expect(groupHits([hit(type)])).toEqual([{ type, items: [hit(type)] }]);
  });

  test("every type has a label and an icon", () => {
    for (const type of ALL_TYPES) {
      expect(GROUP_LABEL[type]).toBeTruthy();
      expect(iconForHit(type, "A title")).toBeTruthy();
    }
  });

  test("keeps the group order, whatever order the hits arrive in", () => {
    const grouped = groupHits([
      hit("doc"),
      hit("repo"),
      hit("session"),
      hit("page"),
    ]);

    expect(grouped.map((group) => group.type)).toEqual([
      "page",
      "repo",
      "session",
      "doc",
    ]);
  });

  test("keeps hits of one type together, in the order the server sent them", () => {
    const first = { ...hit("task"), title: "First" };
    const second = { ...hit("task"), title: "Second" };

    expect(groupHits([first, hit("repo"), second])).toEqual([
      { type: "repo", items: [hit("repo")] },
      { type: "task", items: [first, second] },
    ]);
  });

  test("a recent entry naming a type this build dropped still gets an icon", () => {
    // Recents outlive deploys, so the stored type is untrusted input.
    expect(iconForRecent("gone-in-a-rename", "Old thing")).toBeTruthy();
  });
});
