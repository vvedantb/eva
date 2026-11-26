import { expect, test } from "bun:test";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import {
  resolveNewTaskBaseBranch,
  resolveProjectBaseBranch,
  resolveTaskWorkflowBaseBranch,
} from "../convex/_agentTasks/resolveBaseBranch";
import { resolveSessionBaseBranch } from "../convex/_sessions/baseBranch";

test("resolveTaskWorkflowBaseBranch uses the task's base, then the repo default", () => {
  // A project's child task opens its own PR to main: the project's branch
  // never stands in for its base.
  expect(
    resolveTaskWorkflowBaseBranch(
      { baseBranch: "feature/x" },
      { defaultBaseBranch: "main" },
    ),
  ).toBe("feature/x");

  expect(
    resolveTaskWorkflowBaseBranch(
      { baseBranch: "  " },
      { defaultBaseBranch: "develop" },
    ),
  ).toBe("develop");
});

test("resolveTaskWorkflowBaseBranch falls back when all candidates empty", () => {
  expect(resolveTaskWorkflowBaseBranch({ baseBranch: undefined }, null)).toBe(
    FALLBACK_GIT_BASE_BRANCH,
  );
});

test("resolveNewTaskBaseBranch prefers the explicit pick, then the repo", () => {
  expect(
    resolveNewTaskBaseBranch("explicit", { defaultBaseBranch: "main" }),
  ).toBe("explicit");
  expect(
    resolveNewTaskBaseBranch(undefined, { defaultBaseBranch: "main" }),
  ).toBe("main");
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

test("resolveProjectBaseBranch treats a blank project base as missing", () => {
  expect(
    resolveProjectBaseBranch(
      { baseBranch: "release/x" },
      { defaultBaseBranch: "main" },
    ),
  ).toBe("release/x");
  expect(
    resolveProjectBaseBranch({ baseBranch: "  " }, { defaultBaseBranch: "main" }),
  ).toBe("main");
  expect(resolveProjectBaseBranch({ baseBranch: "" }, null)).toBe(
    FALLBACK_GIT_BASE_BRANCH,
  );
});
