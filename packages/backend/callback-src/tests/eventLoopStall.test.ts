import { describe, expect, test } from "vitest";
import {
  EVENT_LOOP_STALL_LOG_MS,
  measureTickStallMs,
} from "../runtime/eventLoopStall.js";

/**
 * A frozen daemon (VM swap thrash) misses every heartbeat and loses its lease
 * server-side. The only daemon-side evidence is how late its next tick fired,
 * so this measurement is what turns "no logs for six minutes" into a diagnosis.
 */
describe("measureTickStallMs", () => {
  const interval = 10_000;
  const base = {
    previousTickAt: 1_000_000,
    intervalMs: interval,
    toleranceMs: EVENT_LOOP_STALL_LOG_MS,
  };

  test("reports nothing for a tick that is only mildly late", () => {
    expect(
      measureTickStallMs({ ...base, now: base.previousTickAt + interval + 250 }),
    ).toBe(0);
  });

  test("reports nothing exactly at the tolerance boundary", () => {
    expect(
      measureTickStallMs({
        ...base,
        now: base.previousTickAt + interval + EVENT_LOOP_STALL_LOG_MS,
      }),
    ).toBe(0);
  });

  test("reports the excess once the tolerance is exceeded", () => {
    expect(
      measureTickStallMs({
        ...base,
        now: base.previousTickAt + interval + EVENT_LOOP_STALL_LOG_MS + 1,
      }),
    ).toBe(EVENT_LOOP_STALL_LOG_MS + 1);
  });

  test("reports the full excess for a multi-minute freeze", () => {
    expect(
      measureTickStallMs({ ...base, now: base.previousTickAt + 366_000 }),
    ).toBe(356_000);
  });

  test("reports nothing when the clock skewed backwards", () => {
    expect(
      measureTickStallMs({ ...base, now: base.previousTickAt - 60_000 }),
    ).toBe(0);
  });
});
