import { describe, expect, test } from "bun:test";
import {
  STALL_ALERT_TEXT,
  countStallAlertsAfterLastUser,
  shouldRetryEmptyStall,
} from "../convex/_chat/stallRetry";

const user = { role: "user", content: "list the 38 task names" };
const stall = {
  role: "assistant",
  content: STALL_ALERT_TEXT,
  isSystemAlert: true,
};
const placeholder = { role: "assistant", content: "" };
const salvaged = {
  role: "assistant",
  content: "Dispatching stage 1.",
  activityLog: "read packages/app/src/foo.ts",
};

const retryable = {
  sandboxStopped: false,
  hasActiveWorkflow: false,
  stallAlertsAfterLastUser: 1,
  lastUserContent: user.content,
  hasSalvagedOutput: false,
};

describe("shouldRetryEmptyStall", () => {
  test("retries the first empty stall while the sandbox is still up", () => {
    expect(shouldRetryEmptyStall(retryable)).toBe(true);
  });

  test("does not retry before the stall alert exists", () => {
    expect(
      shouldRetryEmptyStall({ ...retryable, stallAlertsAfterLastUser: 0 }),
    ).toBe(false);
  });

  test("does not loop when that retry also stalls", () => {
    expect(
      shouldRetryEmptyStall({ ...retryable, stallAlertsAfterLastUser: 2 }),
    ).toBe(false);
  });

  test("does not replay a stall that already streamed", () => {
    expect(
      shouldRetryEmptyStall({ ...retryable, hasSalvagedOutput: true }),
    ).toBe(false);
  });

  test("does not retry when the VM itself is gone", () => {
    expect(
      shouldRetryEmptyStall({ ...retryable, sandboxStopped: true }),
    ).toBe(false);
  });

  test("does not steal a follow-up the queue already started", () => {
    expect(
      shouldRetryEmptyStall({ ...retryable, hasActiveWorkflow: true }),
    ).toBe(false);
  });

  test("does not invent a prompt when there is no user message", () => {
    expect(
      shouldRetryEmptyStall({ ...retryable, lastUserContent: undefined }),
    ).toBe(false);
  });
});

describe("countStallAlertsAfterLastUser", () => {
  test("sees the just-inserted stall on the first failure", () => {
    expect(countStallAlertsAfterLastUser([stall, user])).toEqual({
      stallAlertsAfterLastUser: 1,
      lastUserContent: user.content,
      hasSalvagedOutput: false,
    });
  });

  test("ignores an empty leftover placeholder above the stall", () => {
    expect(
      countStallAlertsAfterLastUser([placeholder, stall, user]),
    ).toEqual({
      stallAlertsAfterLastUser: 1,
      lastUserContent: user.content,
      hasSalvagedOutput: false,
    });
  });

  test("counts the first stall so the second failure stops", () => {
    expect(
      countStallAlertsAfterLastUser([stall, stall, user]),
    ).toEqual({
      stallAlertsAfterLastUser: 2,
      lastUserContent: user.content,
      hasSalvagedOutput: false,
    });
  });

  test("flags salvaged assistant output so mid-turn stalls are not replayed", () => {
    expect(
      countStallAlertsAfterLastUser([stall, salvaged, user]),
    ).toEqual({
      stallAlertsAfterLastUser: 1,
      lastUserContent: user.content,
      hasSalvagedOutput: true,
    });
  });
});
