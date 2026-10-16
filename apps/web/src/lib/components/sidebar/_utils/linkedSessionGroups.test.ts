import { describe, expect, test } from "vitest";
import { linkedSessionGroups } from "./linkedSessionGroups";

const row = (
  id: string,
  createdAt: number,
  extra: { root?: string; linkedFrom?: object } = {},
) => ({
  _id: id,
  _creationTime: createdAt,
  title: `title ${id}`,
  sessionGroupRootId: extra.root,
  linkedFrom: extra.linkedFrom,
});

describe("linkedSessionGroups", () => {
  test("groups linked sessions across repos, root first", () => {
    const groups = linkedSessionGroups([
      { repo: "ts", sessions: [row("child", 2, { root: "root" }), row("solo", 9)] },
      { repo: "v2", sessions: [row("root", 1, { root: "root" })] },
    ]);
    expect(groups).toEqual([
      {
        rootId: "root",
        title: "title root",
        members: [
          { session: row("root", 1, { root: "root" }), repo: "v2" },
          { session: row("child", 2, { root: "root" }), repo: "ts" },
        ],
      },
    ]);
  });

  test("a lone visible member forms no group", () => {
    expect(
      linkedSessionGroups([
        { repo: "ts", sessions: [row("child", 2, { root: "root" })] },
      ]),
    ).toEqual([]);
  });

  test("a session listed twice keeps its own repo's row", () => {
    const own = row("b", 2, { root: "a" });
    const [group] = linkedSessionGroups([
      { repo: "other", sessions: [row("b", 2, { root: "a", linkedFrom: {} })] },
      { repo: "home", sessions: [row("a", 1, { root: "a" }), own] },
    ]);
    expect(group.members.map((m) => m.repo)).toEqual(["home", "home"]);
  });
});
