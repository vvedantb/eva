import { expect, test } from "vitest";
import {
  hasLegacyDraftLabel,
  sessionPullRequestLabels,
  taskPullRequestLabels,
} from "../convex/_github/prLabels";

/**
 * Draft is a PR status, not a label. vvedantb/eva#995 kept a stale `draft`
 * label after it went ready for review, which misled label-based automation.
 */

test("session PRs never get a draft label", () => {
  expect(sessionPullRequestLabels("apps/web")).toEqual([
    "eva",
    "session",
    "web",
  ]);
  expect(sessionPullRequestLabels(undefined)).toEqual(["eva", "session"]);
  expect(sessionPullRequestLabels("")).toEqual(["eva", "session"]);
});

test("task and project PRs never get a draft label", () => {
  expect(
    taskPullRequestLabels({ rootDirectory: "apps/web", isQuickTask: true }),
  ).toEqual(["eva", "quick-task", "web"]);
  expect(
    taskPullRequestLabels({ rootDirectory: "", isQuickTask: false }),
  ).toEqual(["eva", "project"]);
});

test("detects a leftover draft label so ready-for-review can remove it", () => {
  expect(hasLegacyDraftLabel([{ name: "eva" }, { name: "draft" }])).toBe(true);
  expect(hasLegacyDraftLabel([{ name: "eva" }, { name: "session" }])).toBe(
    false,
  );
  expect(hasLegacyDraftLabel([])).toBe(false);
});
