import { describe, expect, test } from "vitest";
import {
  buildWakeupMessage,
  formatSpan,
  WAKEUP_LIFETIME_LIMIT,
  WAKEUP_MAX_DELAY_MS,
  WAKEUP_PENDING_LIMIT,
  WAKEUP_PROMPT_MAX_CHARS,
  wakeupLimitError,
} from "../convex/_wakeups/rules";

const HOUR = 60 * 60_000;
const ok = { pending: 0, total: 0, delayMs: 3 * HOUR, promptChars: 40 };

describe("wakeupLimitError", () => {
  test("a wake within every limit is allowed", () => {
    expect(wakeupLimitError(ok)).toBeNull();
    expect(
      wakeupLimitError({
        ...ok,
        pending: WAKEUP_PENDING_LIMIT - 1,
        total: WAKEUP_LIFETIME_LIMIT - 1,
        delayMs: WAKEUP_MAX_DELAY_MS,
      }),
    ).toBeNull();
  });

  test("the pending cap refuses a fourth live wake", () => {
    expect(
      wakeupLimitError({ ...ok, pending: WAKEUP_PENDING_LIMIT }),
    ).toMatch(/pending/);
  });

  test("the lifetime cap ends a re-arm loop", () => {
    expect(
      wakeupLimitError({ ...ok, total: WAKEUP_LIFETIME_LIMIT }),
    ).toMatch(/all 20/);
  });

  test("a delay past 30 days or in the past is refused", () => {
    expect(
      wakeupLimitError({ ...ok, delayMs: WAKEUP_MAX_DELAY_MS + 1 }),
    ).toMatch(/30 days/);
    expect(wakeupLimitError({ ...ok, delayMs: -1 })).toMatch(/30 days/);
  });

  test("an empty or oversized prompt is refused", () => {
    expect(wakeupLimitError({ ...ok, promptChars: 0 })).toMatch(/empty/);
    expect(
      wakeupLimitError({ ...ok, promptChars: WAKEUP_PROMPT_MAX_CHARS + 1 }),
    ).toMatch(/longer/);
  });
});

describe("formatSpan", () => {
  test("picks minutes, hours or days", () => {
    expect(formatSpan(45 * 60_000)).toBe("45m");
    expect(formatSpan(3 * HOUR)).toBe("3h");
    expect(formatSpan(48 * HOUR)).toBe("2d");
    expect(formatSpan(52 * HOUR)).toBe("2d 4h");
  });
});

describe("buildWakeupMessage", () => {
  test("a merge wake names the PR and keeps the prompt intact", () => {
    const message = buildWakeupMessage({
      prompt: "Check p95 latency on /api/chat.",
      createdAt: 0,
      now: 5 * HOUR,
      merged: {
        prUrl: "https://github.com/acme/app/pull/12",
        prNumber: 12,
        delayMs: 3 * HOUR,
      },
    });
    expect(message).toContain("you set 5h ago");
    expect(message).toContain("PR #12 (https://github.com/acme/app/pull/12)");
    expect(message).toContain("3h after the merge");
    expect(message).toContain("\nCheck p95 latency on /api/chat.\n");
    expect(message).toContain("schedule_wakeup again");
  });

  test("a time wake says its time came", () => {
    expect(
      buildWakeupMessage({ prompt: "Go.", createdAt: 0, now: HOUR }),
    ).toContain("the time you picked has come");
  });
});
