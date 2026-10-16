import { describe, expect, test } from "vitest";
import { bareHarnessCommandPrompt } from "../convex/_mentions/bareHarnessCommand";
import { agentGoalPatch } from "../convex/_chat/agentGoal";

describe("bareHarnessCommandPrompt", () => {
  test("a Claude /goal turn is sent alone, trimmed", () => {
    expect(
      bareHarnessCommandPrompt("  /goal all tests pass\n", "claude:opus"),
    ).toBe("/goal all tests pass");
    expect(bareHarnessCommandPrompt("/goal", "claude:opus")).toBe("/goal");
  });

  test("other messages and other providers keep the wrapped prompt", () => {
    expect(bareHarnessCommandPrompt("/goals are nice", "claude:opus")).toBe(
      null,
    );
    expect(bareHarnessCommandPrompt("set a /goal", "claude:opus")).toBe(null);
    expect(bareHarnessCommandPrompt("/simplify", "claude:opus")).toBe(null);
    expect(bareHarnessCommandPrompt("/goal x", "codex:gpt-5")).toBe(null);
  });
});

describe("agentGoalPatch", () => {
  const goal = { objective: "x", status: "active" as const, checks: 0 };

  test("writes only on change", () => {
    expect(agentGoalPatch(undefined, null)).toBeNull();
    expect(agentGoalPatch(goal, { ...goal })).toBeNull();
    expect(agentGoalPatch(goal, null)).toEqual({ goal: undefined });
    expect(agentGoalPatch(goal, { ...goal, checks: 1 })).toEqual({
      goal: { ...goal, checks: 1 },
    });
  });
});
