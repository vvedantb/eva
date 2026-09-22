import { expect, test } from "vitest";
import { shouldArchiveSession } from "../convex/_sessions/prArchive";

/**
 * A multi-repo session opens one PR per repo (primary + each linked
 * `sessionRepos` row). The session must only auto-archive once every PR it
 * opened is terminal — a single still-open PR anywhere keeps the whole
 * session live.
 */

test("no PRs at all never auto-archives", () => {
  expect(shouldArchiveSession(undefined, [])).toBe(false);
  expect(shouldArchiveSession(undefined, [undefined, undefined])).toBe(false);
});

test("single-repo session archives once its only PR is terminal", () => {
  expect(shouldArchiveSession("merged", [])).toBe(true);
  expect(shouldArchiveSession("closed", [])).toBe(true);
  expect(shouldArchiveSession("open", [])).toBe(false);
  expect(shouldArchiveSession("draft", [])).toBe(false);
});

test("a still-open linked PR blocks archiving even after the primary merges", () => {
  expect(shouldArchiveSession("merged", ["open"])).toBe(false);
  expect(shouldArchiveSession("merged", ["draft"])).toBe(false);
});

test("archives once every opened PR (primary + linked) is terminal", () => {
  expect(shouldArchiveSession("merged", ["merged", "closed"])).toBe(true);
  expect(shouldArchiveSession("closed", ["merged"])).toBe(true);
});

test("a linked repo that never opened a PR is ignored, not blocking", () => {
  expect(shouldArchiveSession("merged", [undefined])).toBe(true);
  expect(shouldArchiveSession("merged", [undefined, "closed"])).toBe(true);
});

test("no primary PR: archiving depends only on linked PR states", () => {
  expect(shouldArchiveSession(undefined, ["merged"])).toBe(true);
  expect(shouldArchiveSession(undefined, ["open"])).toBe(false);
  expect(shouldArchiveSession(undefined, ["merged", "open"])).toBe(false);
});
