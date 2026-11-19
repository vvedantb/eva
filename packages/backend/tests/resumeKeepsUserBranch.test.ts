import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { getUserCheckedOutBranch } from "../convex/_sandbox_runtime/git";
import { git, localGitSandboxHandle } from "./_helpers/localGitSandbox";

/**
 * A resumed sandbox must stay on a branch the user switched to (PR #952,
 * 13 Oct 2026: resume forced it back onto the chat branch). It must still
 * check out the chat branch when the startup checkout never ran (the eva/65
 * failed-checkout shape), or when HEAD is detached.
 *
 * Runs the real git probe against a temp repository standing in for the
 * sandbox workspace.
 */

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
    // HEAD on main is where setup left it, not a user choice.
    await expect(probe()).resolves.toBeNull();
  });

  test("returns null on a detached HEAD", async () => {
    git(workspace, "branch", SESSION_BRANCH);
    git(workspace, "checkout", "-q", "--detach");
    await expect(probe()).resolves.toBeNull();
  });
});
