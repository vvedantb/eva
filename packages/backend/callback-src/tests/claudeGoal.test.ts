import { describe, expect, test } from "vitest";
import {
  goalAfterTurn,
  isCleanTurnEnd,
  isGoalWorkFrame,
  nextClaudeGoal,
  sameGoal,
  type ClaudeGoal,
} from "../parse/claudeGoal.js";
import type { JsonObject } from "../types.js";

/** Root `<synthetic>` assistant frame, the shape `/goal` output arrives in. */
function commandOutput(text: string): JsonObject {
  return {
    type: "assistant",
    parent_tool_use_id: null,
    message: { model: "<synthetic>", content: [{ type: "text", text }] },
  };
}

function stopHookFeedback(text: string): JsonObject {
  return {
    type: "user",
    parent_tool_use_id: null,
    isSynthetic: true,
    message: { role: "user", content: [{ type: "text", text }] },
  };
}

const active: ClaudeGoal = {
  objective: "all tests pass",
  status: "active",
  checks: 0,
};

describe("nextClaudeGoal", () => {
  test("Goal set starts an active goal", () => {
    expect(
      nextClaudeGoal(null, commandOutput("Goal set: all tests pass")),
    ).toEqual(active);
  });

  test("clear and no-goal replies remove the goal", () => {
    for (const text of [
      "Goal cleared: all tests pass",
      "No goal set",
      "No goal set. Usage: `/goal <condition>`",
    ]) {
      expect(nextClaudeGoal(active, commandOutput(text))).toBeNull();
    }
  });

  test("Goal active restores the goal and its check count", () => {
    expect(
      nextClaudeGoal(
        null,
        commandOutput(
          "Goal active: all tests pass (3 turns)\nLast check: two failing",
        ),
      ),
    ).toEqual({ ...active, checks: 3 });
    expect(
      nextClaudeGoal(
        null,
        commandOutput("Goal active: all tests pass (not yet evaluated)"),
      ),
    ).toEqual(active);
  });

  test("Stop hook feedback for the active goal counts a check", () => {
    expect(
      nextClaudeGoal(
        active,
        stopHookFeedback(
          "Stop hook feedback:\n[all tests pass]: 2 tests still fail",
        ),
      ),
    ).toEqual({ ...active, checks: 1, lastCheck: "2 tests still fail" });
  });

  test("Stop hook feedback matches a condition Claude shortened", () => {
    const objective = "x".repeat(600);
    const shortened = "x".repeat(497) + "…";
    expect(
      nextClaudeGoal(
        { objective, status: "active", checks: 1 },
        stopHookFeedback(`Stop hook feedback:\n[${shortened}]: not yet`),
      ),
    ).toEqual({ objective, status: "active", checks: 2, lastCheck: "not yet" });
  });

  test("another Stop hook's feedback is ignored", () => {
    expect(
      nextClaudeGoal(
        active,
        stopHookFeedback("Stop hook feedback:\n[lint.sh]: lint failed"),
      ),
    ).toBeUndefined();
  });

  test("an unrecoverable error clears the goal", () => {
    expect(
      nextClaudeGoal(active, {
        type: "system",
        subtype: "informational",
        content:
          'Goal cleared after an unrecoverable error (context limit): "all tests pass". Run /goal again to continue.',
      }),
    ).toBeNull();
  });

  test("fails safe: unknown text, model text and subagent frames change nothing", () => {
    expect(
      nextClaudeGoal(active, commandOutput("Objective recorded: x")),
    ).toBeUndefined();
    expect(
      nextClaudeGoal(null, {
        type: "assistant",
        parent_tool_use_id: null,
        message: {
          model: "claude-opus-5",
          content: [{ type: "text", text: "Goal set: fake" }],
        },
      }),
    ).toBeUndefined();
    expect(
      nextClaudeGoal(null, {
        ...commandOutput("Goal set: nested"),
        parent_tool_use_id: "toolu_1",
      }),
    ).toBeUndefined();
    expect(
      nextClaudeGoal(null, stopHookFeedback("Stop hook feedback:\n[a]: b")),
    ).toBeUndefined();
  });
});

describe("goalAfterTurn", () => {
  const cleanWork = {
    modelWorked: true,
    endedCleanly: true,
    backgroundWorkRunning: false,
  };

  test("a clean turn the model worked in completes the goal", () => {
    expect(
      goalAfterTurn({ ...active, checks: 2, lastCheck: "x" }, cleanWork),
    ).toEqual({ ...active, status: "complete", checks: 2 });
  });

  test("errors, background work and command-only turns keep it active", () => {
    expect(goalAfterTurn(active, { ...cleanWork, endedCleanly: false })).toBe(
      active,
    );
    expect(
      goalAfterTurn(active, { ...cleanWork, backgroundWorkRunning: true }),
    ).toBe(active);
    expect(goalAfterTurn(active, { ...cleanWork, modelWorked: false })).toBe(
      active,
    );
    expect(goalAfterTurn(null, cleanWork)).toBeNull();
  });
});

describe("turn helpers", () => {
  test("isCleanTurnEnd accepts only an error-free completed result", () => {
    expect(isCleanTurnEnd({ type: "result", subtype: "success" })).toBe(true);
    expect(
      isCleanTurnEnd({
        type: "result",
        subtype: "success",
        terminal_reason: "completed",
      }),
    ).toBe(true);
    expect(
      isCleanTurnEnd({
        type: "result",
        subtype: "success",
        terminal_reason: "aborted_streaming",
      }),
    ).toBe(false);
    expect(
      isCleanTurnEnd({ type: "result", subtype: "success", is_error: true }),
    ).toBe(false);
  });

  test("isGoalWorkFrame is true only for model-written root frames", () => {
    expect(isGoalWorkFrame(commandOutput("Goal set: x"))).toBe(false);
    expect(
      isGoalWorkFrame({
        type: "assistant",
        parent_tool_use_id: null,
        message: { model: "claude-opus-5", content: [] },
      }),
    ).toBe(true);
  });

  test("sameGoal compares every stored field", () => {
    expect(sameGoal(active, { ...active })).toBe(true);
    expect(sameGoal(active, { ...active, checks: 1 })).toBe(false);
    expect(sameGoal(null, null)).toBe(true);
    expect(sameGoal(active, null)).toBe(false);
  });
});
