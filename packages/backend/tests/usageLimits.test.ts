import { describe, expect, it } from "bun:test";
import {
  isAuthoritativeReading,
  mergeUsageLimitWindows,
} from "../convex/usageLimits";
import {
  isUsageLimitReadingFresh,
  parseUsageLimitRowKey,
  presentReading,
  USAGE_LIMIT_READING_MAX_AGE_MS,
} from "../convex/_usageLimits/rows";

const NOW = 1_800_000_000_000;

describe("usage limit report semantics", () => {
  it("merges a partial window without erasing fuller stored data", () => {
    expect(
      mergeUsageLimitWindows(
        [
          { key: "five_hour", label: "5h", utilization: 40 },
          { key: "seven_day", label: "Weekly", utilization: 60 },
        ],
        [{ key: "five_hour", label: "5h", utilization: 90 }],
      ),
    ).toEqual([
      { key: "five_hour", label: "5h", utilization: 90 },
      { key: "seven_day", label: "Weekly", utilization: 60 },
    ]);
  });

  it("only replaces the stored row for a complete provider reading", () => {
    expect(isAuthoritativeReading("complete", undefined)).toBe(true);
    // A refusal and a passing observation both merge: neither has seen the
    // whole picture, so neither may clear windows an earlier read established.
    expect(isAuthoritativeReading("refused", undefined)).toBe(false);
    expect(isAuthoritativeReading("partial", undefined)).toBe(false);
    // The discriminant wins over the legacy boolean when both arrive.
    expect(isAuthoritativeReading("refused", true)).toBe(false);
  });

  it("honours the pre-discriminant boolean from older callback bundles", () => {
    expect(isAuthoritativeReading(undefined, true)).toBe(true);
    expect(isAuthoritativeReading(undefined, false)).toBe(false);
    expect(isAuthoritativeReading(undefined, undefined)).toBe(false);
  });

  it("expires old readings at the shared 24-hour threshold", () => {
    expect(
      isUsageLimitReadingFresh(NOW - USAGE_LIMIT_READING_MAX_AGE_MS, NOW),
    ).toBe(true);
    expect(
      isUsageLimitReadingFresh(NOW - USAGE_LIMIT_READING_MAX_AGE_MS - 1, NOW),
    ).toBe(false);
  });
});

/** An ambiguous key would read one row and write another. */
describe("row keys name exactly one credential", () => {
  it("rejects a key that names both credentials, or neither", () => {
    expect(() => parseUsageLimitRowKey({ provider: "claude" })).toThrow();
  });
});

describe("presenting a stored reading", () => {
  const window = (resetsAt: number) => ({
    key: "five_hour",
    label: "5h",
    utilization: 40,
    resetsAt,
  });

  it("shows nothing for a missing or stale row", () => {
    expect(presentReading(null, NOW)).toBeNull();
    expect(
      presentReading(
        {
          provider: "claude",
          capturedAt: NOW - USAGE_LIMIT_READING_MAX_AGE_MS - 1,
          windows: [window(NOW + 1000)],
        },
        NOW,
      ),
    ).toBeNull();
  });

  it("drops only the windows that have already reset", () => {
    const live = window(NOW + 1000);
    expect(
      presentReading(
        {
          provider: "claude",
          capturedAt: NOW,
          status: "allowed",
          completeness: "complete",
          windows: [live, { ...window(NOW), key: "seven_day" }],
        },
        NOW,
      ),
    ).toEqual({
      provider: "claude",
      capturedAt: NOW,
      status: "allowed",
      completeness: "complete",
      windows: [live],
    });
  });

  /**
   * A status and a discriminant observed alongside windows expire with them:
   * "complete" with no windows left would have the card claim the plan has no
   * windows at all.
   */
  it("drops status and completeness once every window has reset", () => {
    expect(
      presentReading(
        {
          provider: "claude",
          capturedAt: NOW,
          subscriptionType: "max",
          status: "allowed",
          completeness: "complete",
          windows: [window(NOW)],
        },
        NOW,
      ),
    ).toEqual({ provider: "claude", capturedAt: NOW, subscriptionType: "max" });
  });

  /** The windowless case the discriminant exists for keeps it. */
  it("keeps a refusal that never carried windows", () => {
    expect(
      presentReading(
        {
          provider: "claude",
          capturedAt: NOW,
          completeness: "refused",
          windows: [],
        },
        NOW,
      ),
    ).toEqual({ provider: "claude", capturedAt: NOW, completeness: "refused" });
  });
});
