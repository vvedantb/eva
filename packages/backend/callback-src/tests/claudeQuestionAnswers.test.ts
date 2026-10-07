import { afterEach, describe, expect, test } from "vitest";
import { claudeParseLine } from "../providers/claude.js";
import {
  callbackState as S,
  resetAttemptState,
  resetStateForTests,
} from "../runtime/state.js";

/**
 * A blocking AskUserQuestion answers itself through `canUseTool`, so the SDK's
 * tool_result for it carries no text. Before the fix the empty-output guard in
 * `claudeToolCompleteResult` returned undefined for exactly that shape, the
 * parse emitted a bare `complete_tool`, and the options and the user's choice
 * never reached the step — the transcript kept only "Asked a question".
 *
 * These pin the provider end of that plumbing: the parked answers must ride out
 * on the completion result, exactly once, without changing what an ordinary
 * empty tool_result does.
 */

afterEach(() => {
  resetStateForTests();
});

describe("claudeParseLine AskUserQuestion answers", () => {
  test("an empty tool_result still completes with the parked answers", () => {
    S.questionAnswers.set("toolu_q", { "Which database?": "Convex" });

    const events = claudeParseLine({
      type: "tool_result",
      tool_use_id: "toolu_q",
      content: "",
    });

    expect(events).toEqual([
      {
        kind: "complete_tool",
        trackingId: "toolu_q",
        result: {
          output: undefined,
          isError: undefined,
          answers: { "Which database?": "Convex" },
        },
      },
    ]);
    // Handed over, so a later result for the same id cannot re-attach them.
    expect(S.questionAnswers.has("toolu_q")).toBe(false);
  });

  test("answers ride out of a tool_result nested in a user message", () => {
    S.questionAnswers.set("toolu_nested", { "Ship it?": "Yes" });

    const events = claudeParseLine({
      type: "user",
      message: {
        content: [
          { type: "text", text: "ignored" },
          { type: "tool_result", tool_use_id: "toolu_nested", content: [] },
        ],
      },
    });

    expect(events).toEqual([
      {
        kind: "complete_tool",
        trackingId: "toolu_nested",
        result: {
          output: undefined,
          isError: undefined,
          answers: { "Ship it?": "Yes" },
        },
      },
    ]);
    expect(S.questionAnswers.has("toolu_nested")).toBe(false);
  });

  test("an ordinary empty tool_result still carries no result payload", () => {
    const events = claudeParseLine({
      type: "tool_result",
      tool_use_id: "toolu_read",
      content: "",
    });

    expect(events).toEqual([
      { kind: "complete_tool", trackingId: "toolu_read" },
    ]);
  });

  test("answers are merged alongside output and error text", () => {
    S.questionAnswers.set("toolu_both", { "Retry?": "No" });

    const events = claudeParseLine({
      type: "tool_result",
      tool_use_id: "toolu_both",
      content: "the question was answered",
      is_error: true,
    });

    expect(events[0]).toMatchObject({
      kind: "complete_tool",
      trackingId: "toolu_both",
      result: {
        isError: true,
        answers: { "Retry?": "No" },
      },
    });
    expect(events[0]).toHaveProperty(
      "result.output.text",
      "the question was answered",
    );
  });

  test("a retry cannot inherit the previous attempt's answers", () => {
    S.questionAnswers.set("toolu_stale", { "Which database?": "Convex" });
    resetAttemptState();

    expect(S.questionAnswers.size).toBe(0);
    expect(
      claudeParseLine({
        type: "tool_result",
        tool_use_id: "toolu_stale",
        content: "",
      }),
    ).toEqual([{ kind: "complete_tool", trackingId: "toolu_stale" }]);
  });
});
