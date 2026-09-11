import { describe, expect, test } from "vitest";
import { buildErrorMessage } from "../runtime/completion.js";
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

describe("one-shot completion errors", () => {
  test("fatal heartbeat errors win over every local diagnosis", () => {
    expect(
      buildErrorMessage(
        137,
        "lease lost",
        "tool stalled",
        true,
        true,
        true,
        true,
        true,
        true,
      ),
    ).toBe("lease lost");
  });

  test("tool stalls win over timeout flags", () => {
    expect(
      buildErrorMessage(
        1,
        "",
        "tool stalled",
        true,
        true,
        true,
        true,
        true,
        true,
      ),
    ).toBe("tool stalled");
  });

  test("names each timeout phase", () => {
    expect(
      buildErrorMessage(1, "", "", true, false, false, false, false, false),
    ).toContain("max runtime");
    expect(
      buildErrorMessage(1, "", "", false, true, false, false, false, false),
    ).toContain("no stdout");
    expect(
      buildErrorMessage(1, "", "", false, false, true, false, false, false),
    ).toContain("no parseable");
    expect(
      buildErrorMessage(1, "", "", false, false, false, true, false, false),
    ).toContain("no assistant response");
    expect(
      buildErrorMessage(1, "", "", false, false, false, false, true, false),
    ).toContain("stalled after first text");
    expect(
      buildErrorMessage(1, "", "", false, false, false, false, false, true),
    ).toContain("zombie state");
  });

  test("reports SIGKILL-style exits as memory interruptions", () => {
    const message = buildErrorMessage(
      137,
      "",
      "",
      false,
      false,
      false,
      false,
      false,
      false,
    );
    expect(message).toContain("ran out of memory");
    expect(message).toContain("nothing was completed");
  });

  test("reports SIGTERM-style exits as cancellations, never success", () => {
    const message = buildErrorMessage(
      143,
      "",
      "",
      false,
      false,
      false,
      false,
      false,
      false,
    );
    expect(message).toContain("run was interrupted");
    expect(message).toContain("nothing was completed");
  });

  test("keeps ordinary non-zero exits diagnosable", () => {
    expect(
      buildErrorMessage(23, "", "", false, false, false, false, false, false),
    ).toMatch(/exited with code 23$/);
  });
});
