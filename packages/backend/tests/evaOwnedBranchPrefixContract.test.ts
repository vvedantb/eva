import { describe, expect, test } from "vitest";
import {
  buildTestGenBranchName,
  EVA_BRANCH_PREFIX,
} from "../convex/_git/branchNames";
import { isEvaOwnedBranch } from "../convex/_sandbox_runtime/divergedPublish";

/**
 * `eva/` is load-bearing in four places that never see each other, and a
 * branch outside the prefix fails all four while type-checking and publishing
 * perfectly:
 *
 *  - Vercel's `git.deploymentEnabled` (root and `apps/web/vercel.json`, fix
 *    fb33487b8) stops one production build per push per agent branch.
 *  - `persistTurnWork` pushes a turn's uncommitted work only on an eva-owned
 *    branch; off-prefix, a sandbox VM that dies mid-turn erases the work.
 *  - `turnCheckpoint` (fix 46e4b84fc) checkpoints only on an eva-owned branch.
 *  - `isEvaOwnedBranch` gates the force-push recovery (fix 0f2004686), so an
 *    off-prefix branch can never recover from a rewritten local history.
 *
 * `testGenWorkflow` published `tests/doc-<slug>` and was missing all four.
 */
describe("every branch Eva publishes stays under the eva/ prefix", () => {
  test("the builders agree on the prefix", () => {
    // The automation and project builders' exact output is pinned in
    // automationRunBranchName.test.ts; those shapes are repeated here only to
    // be run past the predicate the publish path actually asks.
    const built = [
      "eva/automation-mh7automation0000000000001-mh7run001",
      "eva/project-mh7project0000000000000001",
      "eva/project-mh7project0000000000000001-v3",
      buildTestGenBranchName("Mention documents in the session prompt input"),
      "eva/task-mh7task00000000000000000001",
    ];
    for (const name of built) {
      expect(name.startsWith(EVA_BRANCH_PREFIX), name).toBe(true);
      expect(isEvaOwnedBranch(name), name).toBe(true);
    }
    expect(buildTestGenBranchName("A Feature!")).toBe(
      "eva/tests-doc-a-feature",
    );
    // An empty slug must not collapse into the prefix itself.
    expect(buildTestGenBranchName("!!!")).toBe("eva/tests-doc-untitled");
  });

  test("branches Eva does not own are refused", () => {
    for (const name of [
      "main",
      "staging",
      "develop",
      "tests/doc-a",
      "evax/y",
    ]) {
      expect(isEvaOwnedBranch(name), name).toBe(false);
    }
  });
});
