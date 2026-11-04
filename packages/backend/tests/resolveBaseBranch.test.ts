import { expect, test } from "vitest";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import {
  resolveNewTaskBaseBranch,
  resolveProjectBaseBranch,
  resolveTaskWorkflowBaseBranch,
} from "../convex/_taskWorkflow/resolveBaseBranch";
import { resolveSessionBaseBranch } from "../convex/_sessions/baseBranch";

test("resolveTaskWorkflowBaseBranch prefers project base when task is in a project", () => {
  // Child tasks must inherit the project's base, not drift to the repo default.
  expect(
    resolveTaskWorkflowBaseBranch(
      { baseBranch: "task-branch", projectId: "proj1" },
      { defaultBaseBranch: "main" },
      { baseBranch: "release/carepulse" },
    ),
  ).toBe("release/carepulse");
});

test("resolveTaskWorkflowBaseBranch uses task then repo when not in a project", () => {
  expect(
    resolveTaskWorkflowBaseBranch(
      { baseBranch: "feature/x", projectId: undefined },
      { defaultBaseBranch: "main" },
      { baseBranch: "ignored-project" },
    ),
  ).toBe("feature/x");

  expect(
    resolveTaskWorkflowBaseBranch(
      { baseBranch: "  ", projectId: undefined },
      { defaultBaseBranch: "develop" },
    ),
  ).toBe("develop");
});

test("resolveTaskWorkflowBaseBranch falls back when all candidates empty", () => {
  expect(
    resolveTaskWorkflowBaseBranch(
      { baseBranch: undefined, projectId: undefined },
      null,
    ),
  ).toBe(FALLBACK_GIT_BASE_BRANCH);
});

test("resolveNewTaskBaseBranch prefers explicit then project then repo", () => {
  expect(
    resolveNewTaskBaseBranch(
      "explicit",
      { defaultBaseBranch: "main" },
      { baseBranch: "project" },
    ),
  ).toBe("explicit");
  expect(
    resolveNewTaskBaseBranch(
      undefined,
      { defaultBaseBranch: "main" },
      { baseBranch: "project" },
    ),
  ).toBe("project");
  expect(
    resolveNewTaskBaseBranch(undefined, { defaultBaseBranch: "main" }),
  ).toBe("main");
});

test("resolveProjectBaseBranch prefers the project base over the repo default", () => {
  expect(
    resolveProjectBaseBranch(
      { baseBranch: "release/carepulse" },
      { defaultBaseBranch: "main" },
    ),
  ).toBe("release/carepulse");
});

test("resolveProjectBaseBranch treats an empty project base as missing", () => {
  expect(
    resolveProjectBaseBranch(
      { baseBranch: "  " },
      { defaultBaseBranch: "main" },
    ),
  ).toBe("main");
  expect(resolveProjectBaseBranch({ baseBranch: undefined }, null)).toBe(
    FALLBACK_GIT_BASE_BRANCH,
  );
});

test("resolveSessionBaseBranch prefers the branch chosen at session creation", () => {
  // The session PR must target the chosen base, not the repo default.
  expect(
    resolveSessionBaseBranch(
      { baseBranch: "main" },
      { defaultBaseBranch: "staging" },
    ),
  ).toBe("main");
});

test("resolveSessionBaseBranch falls back to repo default then constant", () => {
  expect(
    resolveSessionBaseBranch(
      { baseBranch: undefined },
      { defaultBaseBranch: "staging" },
    ),
  ).toBe("staging");
  expect(resolveSessionBaseBranch({ baseBranch: "  " }, null)).toBe(
    FALLBACK_GIT_BASE_BRANCH,
  );
});
