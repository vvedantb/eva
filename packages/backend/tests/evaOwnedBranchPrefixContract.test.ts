import { describe, expect, test } from "bun:test";
import {
  buildTestGenBranchName,
  EVA_BRANCH_PREFIX,
} from "../convex/_git/branchNames";
import { isEvaOwnedBranch } from "../convex/_sandbox_runtime/divergedPublish";

describe("every branch Eva publishes stays under the eva/ prefix", () => {
  test("the builders agree on the prefix", () => {
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
