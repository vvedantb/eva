import { expect, test } from "bun:test";
import {
  buildAutomationRunBranchName,
  buildProjectBranchName,
} from "../convex/_git/branchNames";

test("buildAutomationRunBranchName is per-run so fresh PRs do not reuse branches", () => {
  expect(
    buildAutomationRunBranchName(
      "mh7automation00000000000000",
      "mh7run00000000000000000001",
    ),
  ).toBe(
    "eva/automation-mh7automation00000000000000-mh7run00000000000000000001",
  );
});

test("buildProjectBranchName omits version suffix for v1 and adds it for v2+", () => {
  // After PR merge, v2+ sandboxes need a new branch name.
  expect(buildProjectBranchName("mh7project0000000000000001")).toBe(
    "eva/project-mh7project0000000000000001",
  );
  expect(buildProjectBranchName("mh7project0000000000000001", 1)).toBe(
    "eva/project-mh7project0000000000000001",
  );
  expect(buildProjectBranchName("mh7project0000000000000001", 2)).toBe(
    "eva/project-mh7project0000000000000001-v2",
  );
});
