import { expect, test } from "vitest";
import { shouldArchiveSession } from "../convex/_sessions/prArchive";

/**
 * A session can hold many PRs: the primary repo's, one per linked repo, and
 * any the agent opened on a side branch. It only auto-archives once every one
 * is terminal — a single still-open PR anywhere keeps the whole session live.
 */

test("no PRs at all never auto-archives", () => {
  expect(shouldArchiveSession([])).toBe(false);
});

test("a session with one PR archives once it is terminal", () => {
  expect(shouldArchiveSession(["merged"])).toBe(true);
  expect(shouldArchiveSession(["closed"])).toBe(true);
  expect(shouldArchiveSession(["open"])).toBe(false);
  expect(shouldArchiveSession(["draft"])).toBe(false);
});

test("a still-open PR blocks archiving even after another merges", () => {
  expect(shouldArchiveSession(["merged", "open"])).toBe(false);
  expect(shouldArchiveSession(["merged", "draft"])).toBe(false);
});

test("archives once every PR is terminal", () => {
  expect(shouldArchiveSession(["merged", "merged", "closed"])).toBe(true);
  expect(shouldArchiveSession(["closed", "merged"])).toBe(true);
});
