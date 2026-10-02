import { describe, expect, test } from "vitest";
import {
  ACTIVITY_TOUCH_MIN_INTERVAL_MS,
  IDLE_PAUSE_DEFAULTS,
  decideIdlePause,
  fallbackLastActivity,
  resolveIdleThresholds,
  shouldTouchActivity,
} from "../convex/_sandbox/idlePolicy";

/**
 * The idle-pause rule, Amp-orb style: pause once BOTH the agent grace (since
 * the last turn finished) and the interaction grace (since the last human
 * touch) have elapsed, and nothing is busy or present right now. A wrong
 * decision here either bills an idle VM for hours or pulls a sandbox out from
 * under someone mid-use, so every branch is pinned.
 */

const MIN = 60_000;
const NOW = 1_700_000_000_000;
const thresholds = { afterAgentMs: 5 * MIN, afterInteractionMs: 20 * MIN };

function input(
  overrides: Partial<Parameters<typeof decideIdlePause>[0]> = {},
): Parameters<typeof decideIdlePause>[0] {
  return {
    now: NOW,
    mode: "on",
    status: "active",
    busy: false,
    present: false,
    lastUserActivityAt: NOW - 60 * MIN,
    lastAgentFinishedAt: NOW - 60 * MIN,
    thresholds,
    ...overrides,
  };
}

describe("decideIdlePause", () => {
  test("mode off never pauses, whatever else is true", () => {
    expect(decideIdlePause(input({ mode: "off" }))).toEqual({
      action: "skip",
      reason: "off",
    });
  });

  test("only an active sandbox is a candidate", () => {
    for (const status of ["starting", "stopping", "closed", undefined]) {
      expect(decideIdlePause(input({ status }))).toEqual({
        action: "skip",
        reason: "not-active",
      });
    }
  });

  test("a running turn or build wins over any amount of idleness", () => {
    expect(decideIdlePause(input({ busy: true }))).toEqual({
      action: "skip",
      reason: "busy",
    });
  });

  test("someone with a sandbox tab open keeps it awake", () => {
    expect(decideIdlePause(input({ present: true }))).toEqual({
      action: "skip",
      reason: "present",
    });
  });

  test("agent finished 4 min ago holds the sandbox even when the user is long gone", () => {
    expect(
      decideIdlePause(input({ lastAgentFinishedAt: NOW - 4 * MIN })),
    ).toEqual({ action: "skip", reason: "within-grace" });
  });

  test("user touched 19 min ago holds the sandbox even when the agent is long done", () => {
    expect(
      decideIdlePause(input({ lastUserActivityAt: NOW - 19 * MIN })),
    ).toEqual({ action: "skip", reason: "within-grace" });
  });

  test("both graces elapsed → pause, with idle minutes since the later of the two", () => {
    expect(
      decideIdlePause(
        input({
          lastUserActivityAt: NOW - 45 * MIN,
          lastAgentFinishedAt: NOW - 25 * MIN,
        }),
      ),
    ).toEqual({ action: "pause", idleMinutes: 25 });
  });

  test("exactly at the deadline counts as elapsed", () => {
    expect(
      decideIdlePause(
        input({
          lastUserActivityAt: NOW - 20 * MIN,
          lastAgentFinishedAt: NOW - 5 * MIN,
        }),
      ),
    ).toEqual({ action: "pause", idleMinutes: 5 });
  });

  test("an entity whose agent never ran is governed by the interaction grace alone", () => {
    expect(
      decideIdlePause(
        input({
          lastUserActivityAt: NOW - 21 * MIN,
          lastAgentFinishedAt: undefined,
        }),
      ),
    ).toEqual({ action: "pause", idleMinutes: 21 });
    expect(
      decideIdlePause(
        input({
          lastUserActivityAt: NOW - 19 * MIN,
          lastAgentFinishedAt: undefined,
        }),
      ),
    ).toEqual({ action: "skip", reason: "within-grace" });
  });

  test("dry-run decides exactly like on (the sweep decides whether to act)", () => {
    expect(decideIdlePause(input({ mode: "dry-run" }))).toEqual({
      action: "pause",
      idleMinutes: 60,
    });
  });
});

describe("resolveIdleThresholds", () => {
  test("no settings row → off with the default graces", () => {
    expect(resolveIdleThresholds(null)).toEqual({
      mode: IDLE_PAUSE_DEFAULTS.mode,
      afterAgentMs: IDLE_PAUSE_DEFAULTS.afterAgentMinutes * MIN,
      afterInteractionMs: IDLE_PAUSE_DEFAULTS.afterInteractionMinutes * MIN,
    });
    expect(IDLE_PAUSE_DEFAULTS.mode).toBe("off");
  });

  test("a row without the idle fields (pre-feature deployment) is off", () => {
    expect(resolveIdleThresholds({}).mode).toBe("off");
  });

  test("configured minutes are used; sub-minute and NaN values clamp to defaults or 1", () => {
    const resolved = resolveIdleThresholds({
      sandboxIdlePauseMode: "on",
      sandboxIdleAfterAgentMinutes: 0.4,
      sandboxIdleAfterInteractionMinutes: 60,
    });
    expect(resolved).toEqual({
      mode: "on",
      afterAgentMs: 1 * MIN,
      afterInteractionMs: 60 * MIN,
    });
    expect(
      resolveIdleThresholds({ sandboxIdleAfterAgentMinutes: Number.NaN })
        .afterAgentMs,
    ).toBe(IDLE_PAUSE_DEFAULTS.afterAgentMinutes * MIN);
  });
});

describe("activity helpers", () => {
  test("shouldTouchActivity writes when unset or at least the interval old", () => {
    expect(shouldTouchActivity(undefined, NOW)).toBe(true);
    expect(shouldTouchActivity(NOW - ACTIVITY_TOUCH_MIN_INTERVAL_MS, NOW)).toBe(
      true,
    );
    expect(
      shouldTouchActivity(NOW - ACTIVITY_TOUCH_MIN_INTERVAL_MS + 1, NOW),
    ).toBe(false);
  });

  test("fallbackLastActivity takes the first defined candidate, else creation", () => {
    expect(fallbackLastActivity([undefined, 5, 9], 1)).toBe(5);
    expect(fallbackLastActivity([undefined, undefined], 1)).toBe(1);
  });
});
