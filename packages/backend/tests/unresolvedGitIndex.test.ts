import { describe, expect, test } from "vitest";
import { isUnresolvedGitIndexError } from "../convex/_sandbox_runtime/git";

/**
 * Session n97ex5wm reused a VM whose previous run died mid-merge. Every later
 * checkout refused with "needs merge; you need to resolve your current index
 * first", and the session workflow died with an uncaught
 * SandboxCommandFailedError (fix 718b300d5).
 *
 * sandboxReuseUnresolvedIndexContract.test.ts pins that the recovery is still
 * wired into the checkout retry. This pins what the detector actually matches:
 * it has to catch git's real refusals, and it must NOT widen to failures that
 * a `git reset --merge` would silently destroy work over.
 */
describe("unresolved git index detection", () => {
  test("matches git's real unresolved-index refusals", () => {
    const refusals = [
      // The prod fingerprint, as it reached Axiom.
      "Sandbox command failed (exit 1): error: Your local changes to the following files would be overwritten by checkout:\nsrc/app.ts: needs merge\nerror: you need to resolve your current index first",
      "src/app.ts: needs merge",
      "error: you need to resolve your current index first",
      "error: Pulling is not possible because you have unmerged files.",
      "fatal: You have not concluded your merge (MERGE_HEAD exists).",
      "error: MERGE_HEAD exists",
    ];
    for (const message of refusals) {
      expect(isUnresolvedGitIndexError(message), message).toBe(true);
    }
  });

  test("is case-insensitive, as git capitalises inconsistently", () => {
    expect(isUnresolvedGitIndexError("MERGE_HEAD exists")).toBe(true);
    expect(
      isUnresolvedGitIndexError("You have not concluded your merge"),
    ).toBe(true);
  });

  test("leaves every other git failure to fail loudly", () => {
    // Recovery runs `git merge --abort` / `git reset --merge`, so a false
    // positive throws away a conflicted-but-recoverable tree for a fault the
    // reset cannot fix anyway.
    for (const message of [
      "fatal: Authentication failed for 'https://github.com/eva/eva.git/'",
      "fatal: couldn't find remote ref eva/automation-dead",
      "fatal: unable to access 'https://github.com/eva/eva.git/': Could not resolve host",
      "error: Your local changes to the following files would be overwritten by checkout:\nsrc/app.ts\nPlease commit your changes or stash them before you switch branches.",
      "CONFLICT (content): Merge conflict in src/app.ts",
      "",
    ]) {
      expect(isUnresolvedGitIndexError(message), message).toBe(false);
    }
  });
});
