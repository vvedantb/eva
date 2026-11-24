import { describe, expect, test } from "bun:test";
import {
  decideChildOutcome,
  DRAIN_IDLE_STATUS,
  REPLY_TAIL_CHARS,
} from "../convex/orchestratorShared";

/**
 * The orchestrator is told what happened to a child by the queue-drain hook,
 * which can only observe "it went idle" — so the child's own last assistant row
 * is what distinguishes a finished turn from a killed one. Getting this wrong
 * told the master a cancelled turn had succeeded, and quoted an unrelated older
 * reply as its result.
 */
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
    // sandboxError knows exactly what broke; flattening it loses the reason.
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
    // Head-first: an alert's meaning is its first line, not its stack trace.
    expect(alert.tail?.startsWith("A")).toBe(true);
    expect(alert.tail?.endsWith("…")).toBe(true);

    const reply = decideChildOutcome({ content: long("B") }, "success");
    // Tail-first: a reply's conclusion is at its end.
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
