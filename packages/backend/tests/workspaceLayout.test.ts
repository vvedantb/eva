import { expect, test } from "bun:test";
import {
  WORKSPACE_ROOT,
  linkedRepoDir,
  primaryLinkPath,
  repoNameFromWorkspacePath,
} from "../convex/_sandbox_runtime/workspaceLayout";

test("linked repos and the primary symlink share one workspace layout", () => {
  expect(WORKSPACE_ROOT).toBe("/tmp/workspace");
  expect(linkedRepoDir("carepulse-ts")).toBe("/tmp/workspace/carepulse-ts");
  expect(primaryLinkPath("eva")).toBe("/tmp/workspace/eva");
});

test("repoNameFromWorkspacePath reads the repo out of a workspace path", () => {
  expect(repoNameFromWorkspacePath("/tmp/workspace/foo/x.ts")).toBe("foo");
  expect(repoNameFromWorkspacePath("/tmp/workspace/foo")).toBe("foo");
  expect(repoNameFromWorkspacePath("/tmp/workspace/foo/")).toBe("foo");
});

test("repoNameFromWorkspacePath rejects paths outside the workspace", () => {
  expect(repoNameFromWorkspacePath("/tmp/repo/src/index.ts")).toBeNull();
  expect(repoNameFromWorkspacePath("/tmp/workspace")).toBeNull();
  expect(repoNameFromWorkspacePath("/tmp/workspace/")).toBeNull();
  expect(repoNameFromWorkspacePath("/tmp/workspace-other/foo")).toBeNull();
});
