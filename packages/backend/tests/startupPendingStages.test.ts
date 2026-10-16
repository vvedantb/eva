import { describe, expect, test } from "vitest";
import {
  plannedStartupStages,
  startupProgress,
} from "../convex/_sandbox_runtime/prepareSandboxSteps";

describe("startup stages ahead of the running one are pending", () => {
  const plan = plannedStartupStages({ branchName: "eva/task-1" });

  test("a task branch run plans fetch, branch and command stages in order", () => {
    expect(plan).toEqual([
      "Fetching base branch...",
      "Fetching task branch...",
      "Setting up branch...",
      "Restoring seeded runtime...",
      "Launching background commands...",
      "Running startup commands...",
    ]);
  });

  test("read-only runs plan no command stages", () => {
    expect(
      plannedStartupStages({ baseBranch: "main", skipStartupCommands: true }),
    ).toEqual(["Fetching base branch...", "Checking out base branch..."]);
  });

  test("progress is finished, then running, then pending", () => {
    const steps = startupProgress(
      [
        { type: "tool", label: "Creating sandbox...", status: "complete" },
        { type: "tool", label: "Fetching base branch...", status: "complete" },
      ],
      "Fetching task branch...",
      plan,
    );
    expect(steps.map((step) => [step.label, step.status])).toEqual([
      ["Creating sandbox...", "complete"],
      ["Fetching base branch...", "complete"],
      ["Fetching task branch...", "active"],
      ["Setting up branch...", "pending"],
      ["Restoring seeded runtime...", "pending"],
      ["Launching background commands...", "pending"],
      ["Running startup commands...", "pending"],
    ]);
  });

  test("the last stage leaves nothing pending", () => {
    const steps = startupProgress([], "Running startup commands...", plan);
    expect(steps.map((step) => step.status)).toEqual(["active"]);
  });
});
