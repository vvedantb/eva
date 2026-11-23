import { describe, expect, test } from "vitest";
import { isZeroWorkTaskNotificationResult } from "../providers/claudeResult.js";

describe("Claude task-notification results", () => {
  const zeroWorkNotification = {
    type: "result",
    subtype: "success",
    is_error: false,
    result: "",
    num_turns: 0,
    origin: { kind: "task-notification" },
  };

  test("identifies the empty provider event that must not finish a user turn", () => {
    expect(isZeroWorkTaskNotificationResult(zeroWorkNotification)).toBe(true);
  });

  test("keeps real results and provider errors authoritative", () => {
    expect(
      isZeroWorkTaskNotificationResult({
        ...zeroWorkNotification,
        result: "The screenshot is attached.",
      }),
    ).toBe(false);
    expect(
      isZeroWorkTaskNotificationResult({
        ...zeroWorkNotification,
        num_turns: 1,
      }),
    ).toBe(false);
    expect(
      isZeroWorkTaskNotificationResult({
        ...zeroWorkNotification,
        is_error: true,
      }),
    ).toBe(false);
    expect(
      isZeroWorkTaskNotificationResult({
        ...zeroWorkNotification,
        origin: { kind: "user" },
      }),
    ).toBe(false);
  });
});
