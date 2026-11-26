import { describe, expect, it } from "bun:test";
import {
  defaultProjectTaskTab,
  projectTaskTabList,
} from "./projectSandboxTabs";

describe("projectTaskTabList", () => {
  it("adds a lone selected task as a tab", () => {
    expect(projectTaskTabList([], 903)).toEqual([903]);
    expect(projectTaskTabList([903], 907)).toEqual([903, 907]);
  });

  it("keeps the order and drops repeats", () => {
    expect(projectTaskTabList([907, 903, 907], 903)).toEqual([907, 903]);
  });

  it("closes the oldest past five tabs, never the selected one", () => {
    expect(projectTaskTabList([1, 2, 3, 4, 5], 6)).toEqual([2, 3, 4, 5, 6]);
    expect(projectTaskTabList([1, 2, 3, 4, 5, 6], 1)).toEqual([1, 3, 4, 5, 6]);
    expect(projectTaskTabList([1, 2, 3, 4, 5, 6], null)).toEqual([
      2, 3, 4, 5, 6,
    ]);
  });
});

describe("defaultProjectTaskTab", () => {
  it("opens on Review with a PR, else Preview while running, else Tasks", () => {
    const prUrl = "https://github.com/o/r/pull/1";
    expect(defaultProjectTaskTab({ sandboxStatus: "active", prUrl })).toBe(
      "task-review",
    );
    expect(defaultProjectTaskTab({ sandboxStatus: "active" })).toBe(
      "task-preview",
    );
    expect(defaultProjectTaskTab({ sandboxStatus: "closed" })).toBe("tasks");
  });
});
