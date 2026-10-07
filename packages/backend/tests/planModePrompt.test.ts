import { expect, test } from "vitest";
import { buildEditPrompt } from "../convex/_sessions/prompts";

test("sessions no longer enter plan mode or inject plan.md as an approved plan", () => {
  const prompt = buildEditPrompt(
    { owner: "vvedantb", name: "eva", baseBranch: "main" },
    "eva/session-1",
    "",
    "ship it",
    "",
    "",
    undefined,
  );
  expect(prompt).not.toContain("You are in plan mode");
  expect(prompt).not.toContain("ExitPlanMode");
  expect(prompt).not.toContain("Approved plan:");
  expect(prompt).not.toContain("Follow this plan when implementing");
});

test("non-empty planContent is still attached as context for task/project chat", () => {
  const prompt = buildEditPrompt(
    { owner: "vvedantb", name: "eva", baseBranch: "main" },
    "eva/session-1",
    "# Spec\nDo the work",
    "ship it",
    "",
    "",
    undefined,
  );
  expect(prompt).toContain("Context:");
  expect(prompt).toContain("# Spec\nDo the work");
  expect(prompt).not.toContain("Approved plan:");
});
