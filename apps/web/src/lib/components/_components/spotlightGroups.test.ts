import { describe, expect, test } from "bun:test";
import {
  GROUP_LABEL,
  groupHits,
  iconForHit,
  iconForRecent,
  type HitType,
  type SpotlightHit,
} from "./spotlightGroups";

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
    expect(iconForRecent("gone-in-a-rename", "Old thing")).toBeTruthy();
  });
});
