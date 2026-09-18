import { describe, expect, test } from "vitest";
import {
  assistantReplyContent,
  delayedPublishFailureError,
  formatDelayedPublishFailureError,
  orphanPlaceholderMessages,
  PUBLISH_FAILURE_MARKER,
  resultTargetMessage,
} from "../convex/_sessions/resultTarget";

/** Only the fields the decision reads; the real docs carry many more. */
function reply(fields: {
  content?: string;
  isSystemAlert?: boolean;
  isSyntheticTurn?: boolean;
  finishedAt?: number;
  role?: string;
}) {
  return {
    role: fields.role ?? "assistant",
    content: fields.content ?? "",
    isSystemAlert: fields.isSystemAlert,
    isSyntheticTurn: fields.isSyntheticTurn,
    finishedAt: fields.finishedAt,
  };
}

describe("assistantReplyContent", () => {
  test("uses the result on success", () => {
    expect(
      assistantReplyContent({
        success: true,
        result: "done",
        error: null,
      }),
    ).toBe("done");
  });

  test("falls back when a successful turn produced no text", () => {
    expect(
      assistantReplyContent({
        success: true,
        result: null,
        error: null,
      }),
    ).toBe("I couldn't process your message.");
  });

  test("surfaces the error on failure", () => {
    expect(
      assistantReplyContent({
        success: false,
        result: null,
        error: "sandbox died",
      }),
    ).toBe("Error: sandbox died");
  });
});

describe("formatDelayedPublishFailureError", () => {
  test.each(["session", "chat", "task"] as const)(
    "the %s lead-in is recognised as a delayed publish failure",
    (scope) => {
      const error = formatDelayedPublishFailureError(
        scope,
        new Error("origin rejected the push"),
      );
      expect(error).toContain(PUBLISH_FAILURE_MARKER);
      expect(error).toContain("origin rejected the push");
      expect(delayedPublishFailureError("saved reply", error)).toBe(error);
    },
  );
});

describe("delayedPublishFailureError", () => {
  test("identifies a publish failure after a result was already saved", () => {
    const error =
      "Session completed locally, but Eva could not publish the branch to GitHub.";
    expect(delayedPublishFailureError("saved reply", error)).toBe(error);
  });

  test("identifies a task/project chat publish failure", () => {
    const error =
      "Chat completed locally, but Eva could not publish the branch to GitHub.";
    expect(delayedPublishFailureError("saved reply", error)).toBe(error);
  });

  test.each([
    [
      "no saved result",
      null,
      "Session completed locally, but Eva could not publish",
    ],
    ["no error", "saved reply", null],
    ["an execution error", "saved reply", "Sandbox command failed"],
  ])("ignores %s", (_label, result, error) => {
    expect(delayedPublishFailureError(result, error)).toBeUndefined();
  });
});

/**
 * A turn's result used to land on whatever the newest message was. A system
 * alert left over from an earlier turn (a draft-PR failure, say) sits exactly
 * there, so the reply the user was waiting on was written into the alert —
 * arriving with someone else's errorDetail attached (fix c9bad485).
 */
describe("resultTargetMessage", () => {
  test("picks the newest assistant reply", () => {
    const newest = reply({ content: "" });
    const older = reply({ content: "previous answer" });
    expect(resultTargetMessage([newest, older])).toBe(newest);
  });

  test("skips a system alert sitting on top", () => {
    const alert = reply({ content: "Failed to open PR", isSystemAlert: true });
    const target = reply({ content: "" });
    expect(resultTargetMessage([alert, target])).toBe(target);
  });

  /** Synthetic turns are Eva's own continuations, not the bubble in flight. */
  test("skips a synthetic turn", () => {
    const synthetic = reply({ isSyntheticTurn: true });
    const target = reply({ content: "" });
    expect(resultTargetMessage([synthetic, target])).toBe(target);
  });

  test("skips user messages", () => {
    const user = reply({ role: "user", content: "do the thing" });
    const target = reply({ content: "" });
    expect(resultTargetMessage([user, target])).toBe(target);
  });

  /** Writing into nothing beats writing into the wrong row. */
  test("returns nothing when every candidate is disqualified", () => {
    expect(
      resultTargetMessage([
        reply({ isSystemAlert: true }),
        reply({ role: "user" }),
      ]),
    ).toBeUndefined();
  });

  test("returns nothing for an empty history", () => {
    expect(resultTargetMessage([])).toBeUndefined();
  });
});

/**
 * The other half of the same bug: with an alert on top, the placeholder logic
 * staged a second bubble, and the one that did not receive the result stayed on
 * screen as a "Working…" row forever (fix a42c0d1f).
 */
describe("orphanPlaceholderMessages", () => {
  test("returns the empty unfinished bubble the result did not land on", () => {
    const orphan = reply({ content: "" });
    const target = reply({ content: "" });
    expect(orphanPlaceholderMessages([orphan, target], target)).toEqual([
      orphan,
    ]);
  });

  test("never returns the target itself", () => {
    const target = reply({ content: "" });
    expect(orphanPlaceholderMessages([target], target)).toEqual([]);
  });

  /** Content is real output, however stale — deleting it loses an answer. */
  test("keeps a bubble that has content", () => {
    const target = reply({ content: "" });
    const answered = reply({ content: "an earlier answer" });
    expect(orphanPlaceholderMessages([answered, target], target)).toEqual([]);
  });

  test("keeps a bubble that already finished", () => {
    const target = reply({ content: "" });
    const finished = reply({ content: "", finishedAt: 1 });
    expect(orphanPlaceholderMessages([finished, target], target)).toEqual([]);
  });

  test.each([
    ["a system alert", { isSystemAlert: true }],
    ["a synthetic turn", { isSyntheticTurn: true }],
    ["a user message", { role: "user" }],
  ])("keeps %s even when empty", (_label, fields) => {
    const target = reply({ content: "" });
    const other = reply({ ...fields, content: "" });
    expect(orphanPlaceholderMessages([other, target], target)).toEqual([]);
  });

  test("collects every orphan, not just the first", () => {
    const first = reply({ content: "" });
    const second = reply({ content: "" });
    const target = reply({ content: "" });
    expect(orphanPlaceholderMessages([first, second, target], target)).toEqual([
      first,
      second,
    ]);
  });
});
