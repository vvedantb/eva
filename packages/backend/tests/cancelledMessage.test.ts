import { describe, expect, test } from "bun:test";
import { cancelledMessageOutcome } from "../convex/_chat/cancelledMessage";

/**
 * Hitting stop used to replace the assistant bubble with "Execution cancelled by
 * user.", destroying an answer the agent had already streamed in full (fix
 * c94e2d60). Every rule that protects the partial answer is pinned here.
 */
describe("cancelledMessageOutcome", () => {
  test("keeps the streamed text when the message has none", () => {
    expect(
      cancelledMessageOutcome(
        { role: "assistant" },
        { currentContent: "half an answer" },
      ),
    ).toEqual({ kind: "patch", content: "half an answer" });
  });

  /** The message's own content is ahead of the stream, so the stream must not win. */
  test("never overwrites text the message already committed", () => {
    expect(
      cancelledMessageOutcome(
        { role: "assistant", content: "persisted answer" },
        { currentContent: "stale stream" },
      ),
    ).toEqual({ kind: "patch" });
  });

  test("keeps the streamed tool timeline", () => {
    const activity = '[{"tool":"Read"}]';
    expect(
      cancelledMessageOutcome(
        { role: "assistant" },
        { currentActivity: activity },
      ),
    ).toEqual({ kind: "patch", activityLog: activity });
  });

  test("keeps text and timeline together", () => {
    const activity = '[{"tool":"Edit"}]';
    expect(
      cancelledMessageOutcome(
        { role: "assistant" },
        { currentContent: "  answer  ", currentActivity: activity },
      ),
    ).toEqual({ kind: "patch", content: "answer", activityLog: activity });
  });

  /**
   * Deleting is only safe when the turn produced nothing at all — an empty bubble
   * is noise, but a deleted answer is unrecoverable.
   */
  describe("deletes only a truly empty bubble", () => {
    test("no message content and no stream", () => {
      expect(cancelledMessageOutcome({ role: "assistant" }, null)).toEqual({
        kind: "delete",
      });
    });

    test("whitespace-only stream counts as nothing", () => {
      expect(
        cancelledMessageOutcome(
          { role: "assistant" },
          { currentContent: "   ", currentActivity: "  " },
        ),
      ).toEqual({ kind: "delete" });
    });

    /** An empty JSON array is the initial value, not a tool step. */
    test("an empty activity array counts as nothing", () => {
      expect(
        cancelledMessageOutcome(
          { role: "assistant", activityLog: "[]" },
          { currentActivity: "[]" },
        ),
      ).toEqual({ kind: "delete" });
    });

    test("keeps a bubble whose only content is already-persisted activity", () => {
      expect(
        cancelledMessageOutcome(
          { role: "assistant", activityLog: '[{"tool":"Bash"}]' },
          null,
        ),
      ).toEqual({ kind: "patch" });
    });
  });

  /** Anything already finished, or not the agent's, is somebody else's row. */
  describe("leaves other rows alone", () => {
    test("a user message", () => {
      expect(
        cancelledMessageOutcome({ role: "user" }, { currentContent: "x" }),
      ).toEqual({ kind: "skip" });
    });

    test("a message that already finished", () => {
      expect(
        cancelledMessageOutcome(
          { role: "assistant", finishedAt: 1 },
          { currentContent: "x" },
        ),
      ).toEqual({ kind: "skip" });
    });

    /** finishedAt: 0 is a real timestamp, not "unfinished". */
    test("a message finished at epoch zero", () => {
      expect(
        cancelledMessageOutcome({ role: "assistant", finishedAt: 0 }, null),
      ).toEqual({ kind: "skip" });
    });
  });
});
