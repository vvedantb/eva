import { describe, expect, test } from "vitest";
import {
  pollPreviewReadiness,
  type PreviewPollIo,
} from "../convex/_sandbox_runtime/previewPoll";

/**
 * The preview readiness poll fires every ~2s per open page and is the only
 * thing watching a running preview. Three prod incidents shaped its ordering:
 * polls resumed sandboxes the user had just stopped, the un-throttled heal
 * flooded logs with per-daemon pid execs, and an OOM-killed dev server stayed
 * dead because nothing relaunched it. These run the poll with fake I/O and
 * assert what it did, in order.
 */

const APP_PORT = 13000;

/** Records every sandbox call the poll makes, in order. */
function spyIo(
  overrides: Partial<{
    healClaimed: boolean;
    ready: boolean;
    healError: unknown;
  }> = {},
): PreviewPollIo & { calls: string[]; healErrors: unknown[] } {
  const calls: string[] = [];
  const healErrors: unknown[] = [];
  return {
    calls,
    healErrors,
    claimHeal: async () => {
      calls.push("claimHeal");
      return overrides.healClaimed ?? true;
    },
    healBackgroundCommands: async () => {
      calls.push("heal");
      if (overrides.healError !== undefined) throw overrides.healError;
    },
    probeReady: async () => {
      calls.push("probe");
      return overrides.ready ?? true;
    },
    scheduleRecovery: async () => {
      calls.push("scheduleRecovery");
    },
    onHealFailed: (error) => healErrors.push(error),
  };
}

const APP_POLL = { sandboxRunning: true, customTabPort: undefined, port: APP_PORT };

describe("the poll never touches a sandbox that is not running", () => {
  test("a stopped sandbox is reported not-ready with no calls at all", async () => {
    // Every exec goes through the SDK's withResume, so a single probe would
    // wake a sandbox the user had just stopped.
    const io = spyIo();
    const result = await pollPreviewReadiness(
      { ...APP_POLL, sandboxRunning: false },
      io,
    );

    expect(result).toEqual({ kind: "sandbox-not-running" });
    expect(io.calls).toEqual([]);
  });
});

describe("the background heal is claimed, not probed for", () => {
  test("the heal runs before the probe, only after winning the claim", async () => {
    // The app port can serve while a background daemon (local convex,
    // supabase) is dead — which is exactly the case the heal exists for — so
    // the heal must not be gated on readiness.
    const io = spyIo({ healClaimed: true, ready: true });
    await pollPreviewReadiness(APP_POLL, io);

    expect(io.calls).toEqual(["claimHeal", "heal", "probe"]);
  });

  test("losing the claim skips the heal but still probes", async () => {
    const io = spyIo({ healClaimed: false, ready: true });
    await pollPreviewReadiness(APP_POLL, io);

    expect(io.calls).toEqual(["claimHeal", "probe"]);
  });

  test("a failed heal is reported and the poll carries on", async () => {
    const healError = new Error("exec failed");
    const io = spyIo({ healClaimed: true, ready: true, healError });

    expect(await pollPreviewReadiness(APP_POLL, io)).toEqual({
      kind: "probed",
      ready: true,
    });
    expect(io.healErrors).toEqual([healError]);
    expect(io.calls).toEqual(["claimHeal", "heal", "probe"]);
  });

  test("a custom tab neither claims nor heals", async () => {
    // A stopped Supabase tab must not restart the app's dev server.
    const io = spyIo({ ready: false });
    await pollPreviewReadiness({ ...APP_POLL, customTabPort: 54323 }, io);

    expect(io.calls).toEqual(["probe"]);
  });
});

describe("a dead dev server recovers through the Console launcher", () => {
  test("a failed probe on a claimed heal schedules recovery", async () => {
    const io = spyIo({ healClaimed: true, ready: false });

    expect(await pollPreviewReadiness(APP_POLL, io)).toEqual({
      kind: "probed",
      ready: false,
    });
    expect(io.calls).toEqual(["claimHeal", "heal", "probe", "scheduleRecovery"]);
  });

  test("a passing probe never schedules recovery", async () => {
    const io = spyIo({ healClaimed: true, ready: true });
    await pollPreviewReadiness(APP_POLL, io);

    expect(io.calls).not.toContain("scheduleRecovery");
  });

  test("a failed probe without the claim waits for the next interval", async () => {
    // Reusing the heal claim is what rate-limits recovery to one attempt per
    // interval instead of one per ~2s poll per open page.
    const io = spyIo({ healClaimed: false, ready: false });
    await pollPreviewReadiness(APP_POLL, io);

    expect(io.calls).not.toContain("scheduleRecovery");
  });

  test.each([
    { surface: "desktop", port: 6080 },
    { surface: "editor", port: 8080 },
  ])("$surface has its own lifecycle and is never recovered", async ({ port }) => {
    const io = spyIo({ healClaimed: true, ready: false });
    await pollPreviewReadiness({ ...APP_POLL, port }, io);

    expect(io.calls).not.toContain("scheduleRecovery");
  });
});
