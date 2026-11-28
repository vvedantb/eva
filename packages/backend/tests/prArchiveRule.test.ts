import { expect, test } from "bun:test";
import { shouldArchiveSession } from "../convex/_sessions/prArchive";

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
