import { expect, test } from "vitest";
import { buildEditPrompt } from "../convex/_sessions/prompts";

test("sessions no longer enter plan mode or inject plan.md as an approved plan", () => {
  const prompt = buildEditPrompt({
    repo: { owner: "vvedantb", name: "eva", baseBranch: "main" },
    branchName: "eva/session-1",
    message: "ship it",
    rootDirectory: "",
    customInstructionsBlock: "",
  });
  expect(prompt).not.toContain("You are in plan mode");
  expect(prompt).not.toContain("ExitPlanMode");
  expect(prompt).not.toContain("Approved plan:");
  expect(prompt).not.toContain("Follow this plan when implementing");
});

test("non-empty planContent is still attached as context for task/project chat", () => {
  const prompt = buildEditPrompt({
    repo: { owner: "vvedantb", name: "eva", baseBranch: "main" },
    branchName: "eva/session-1",
    planContent: "# Spec\nDo the work",
    message: "ship it",
    rootDirectory: "",
    customInstructionsBlock: "",
  });
  expect(prompt).toContain("Context:");
  expect(prompt).toContain("# Spec\nDo the work");
  expect(prompt).not.toContain("Approved plan:");
});
