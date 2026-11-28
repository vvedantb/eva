import { describe, expect, test } from "bun:test";
import {
  decideChildOutcome,
  DRAIN_IDLE_STATUS,
  REPLY_TAIL_CHARS,
} from "../convex/orchestratorShared";

describe("decideChildOutcome", () => {
  test("keeps the reported status and tails a normal reply", () => {
    const result = decideChildOutcome(
      { content: "Done — shipped the fix." },
      DRAIN_IDLE_STATUS,
    );
    expect(result).toEqual({
      status: "completed",
      tail: "Done — shipped the fix.",
    });
  });

  test("a system alert overrides the drain's optimistic label", () => {
    const result = decideChildOutcome(
      {
        content: "Eva stopped working on this",
        isSystemAlert: true,
        errorDetail: "cancelled by user",
      },
      DRAIN_IDLE_STATUS,
    );
    expect(result.status).toBe("interrupted");
    expect(result.tail).toBe("Eva stopped working on this: cancelled by user");
  });

  test("a caller's specific failure status survives an alert", () => {
    const result = decideChildOutcome(
      { content: "Failed to start sandbox", isSystemAlert: true },
      "sandbox failed to start",
    );
    expect(result.status).toBe("sandbox failed to start");
  });

  test("alerts quote their head, replies quote their tail", () => {
    const long = (marker: string) =>
      `${marker}${"x".repeat(REPLY_TAIL_CHARS * 2)}${marker}END`;
    const alert = decideChildOutcome(
      { content: long("A"), isSystemAlert: true },
      DRAIN_IDLE_STATUS,
    );
    expect(alert.tail?.startsWith("A")).toBe(true);
    expect(alert.tail?.endsWith("…")).toBe(true);

    const reply = decideChildOutcome({ content: long("B") }, "success");
    expect(reply.tail?.endsWith("END")).toBe(true);
    expect(reply.tail?.length).toBe(REPLY_TAIL_CHARS);
  });

  test("a child with no assistant reply yet reports the caller's status", () => {
    expect(decideChildOutcome(undefined, "error")).toEqual({
      status: "error",
      tail: undefined,
    });
  });
});
