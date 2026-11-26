import { describe, expect, test } from "bun:test";
import {
  LAST_SEEN_MIN_INTERVAL_MS,
  mergeLastSeen,
  shouldWriteLastSeenAt,
} from "../convex/_users/lastSeen";

describe("mergeLastSeen", () => {
  test("presence row wins per field, leftover user fills the rest", () => {
    expect(
      mergeLastSeen(
        { lastSeenAt: 20 },
        { lastSeenAt: 10, lastSeenPath: "/old" },
      ),
    ).toEqual({ lastSeenAt: 20, lastSeenPath: "/old" });
  });

  test("no presence row uses the leftover user fields", () => {
    expect(
      mergeLastSeen(null, { lastSeenAt: 10, lastSeenPath: "/a" }),
    ).toEqual({ lastSeenAt: 10, lastSeenPath: "/a" });
  });
});

describe("shouldWriteLastSeenAt", () => {
  test("writes when missing or older than the interval", () => {
    expect(shouldWriteLastSeenAt(undefined, 1000)).toBe(true);
    expect(shouldWriteLastSeenAt(1, 1 + LAST_SEEN_MIN_INTERVAL_MS)).toBe(
      false,
    );
    expect(shouldWriteLastSeenAt(1, 2 + LAST_SEEN_MIN_INTERVAL_MS)).toBe(
      true,
    );
  });
});
