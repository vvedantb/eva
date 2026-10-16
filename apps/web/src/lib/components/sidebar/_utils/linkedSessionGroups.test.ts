import { describe, expect, test } from "vitest";
import { linkedSessionGroups } from "./linkedSessionGroups";

const row = (
  id: string,
  createdAt: number,
  extra: { group?: string; name?: string; linkedFrom?: object } = {},
) => ({
  _id: id,
  _creationTime: createdAt,
  title: `title ${id}`,
  sessionGroupId: extra.group,
  sessionGroupName: extra.name,
  linkedFrom: extra.linkedFrom,
});

describe("linkedSessionGroups", () => {
  test("groups linked sessions across repos, oldest first", () => {
    const groups = linkedSessionGroups([
      {
        repo: "ts",
        sessions: [row("child", 2, { group: "g" }), row("solo", 9)],
      },
      { repo: "v2", sessions: [row("origin", 1, { group: "g" })] },
    ]);
    expect(groups).toEqual([
      {
        groupId: "g",
        name: undefined,
        label: "title origin",
        members: [
          { session: row("origin", 1, { group: "g" }), repo: "v2" },
          { session: row("child", 2, { group: "g" }), repo: "ts" },
        ],
      },
    ]);
  });

  test("a user-set name labels the group", () => {
    const [group] = linkedSessionGroups([
      {
        repo: "ts",
        sessions: [row("a", 1, { group: "g", name: "Referrals" })],
      },
    ]);
    expect(group.label).toBe("Referrals");
  });

  test("a lone visible member still shows as its group", () => {
    expect(
      linkedSessionGroups([
        { repo: "ts", sessions: [row("child", 2, { group: "g" })] },
      ]).map((group) => group.members.length),
    ).toEqual([1]);
  });

  test("a session listed twice keeps its own repo's row", () => {
    const [group] = linkedSessionGroups([
      {
        repo: "other",
        sessions: [row("b", 2, { group: "g", linkedFrom: {} })],
      },
      {
        repo: "home",
        sessions: [row("a", 1, { group: "g" }), row("b", 2, { group: "g" })],
      },
    ]);
    expect(group.members.map((m) => m.repo)).toEqual(["home", "home"]);
  });
});
