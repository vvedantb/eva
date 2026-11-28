import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getUserCheckedOutBranch } from "../convex/_sandbox_runtime/git";
import { git, localGitSandboxHandle } from "./_helpers/localGitSandbox";

const SESSION_BRANCH = "eva/session-resume";

let workspace: string;

const probe = () =>
  getUserCheckedOutBranch(localGitSandboxHandle({ workspace }), SESSION_BRANCH);

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "eva-resume-branch-"));
  git(workspace, "init", "-q", "-b", "main");
  writeFileSync(join(workspace, "README.md"), "base\n");
  git(workspace, "add", "-A");
  git(workspace, "commit", "-q", "-m", "base");
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("getUserCheckedOutBranch", () => {
  test("keeps a branch the user switched to after the session checkout", async () => {
    git(workspace, "branch", SESSION_BRANCH);
    git(workspace, "checkout", "-q", "-b", "feature/user-pick");
    await expect(probe()).resolves.toBe("feature/user-pick");
  });

  test("returns null when already on the session branch", async () => {
    git(workspace, "checkout", "-q", "-b", SESSION_BRANCH);
    await expect(probe()).resolves.toBeNull();
  });

  test("returns null when the session branch was never created locally", async () => {
    await expect(probe()).resolves.toBeNull();
  });

  test("returns null on a detached HEAD", async () => {
    git(workspace, "branch", SESSION_BRANCH);
    git(workspace, "checkout", "-q", "--detach");
    await expect(probe()).resolves.toBeNull();
  });
});
