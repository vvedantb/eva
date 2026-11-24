import { afterEach, describe, expect, mock, spyOn, test, vi } from "bun:test";
import type { LeaseTerminalReason } from "../runtime/turnLease.js";
import { freshModules } from "./freshModules";

// The heartbeat request is the network boundary; the verdict it carried is
// recorded through the real `noteHeartbeatResponse` below.
const realClient = { ...(await import("../http/convexClient.js")) };
mock.module("../http/convexClient.js", () => ({
  ...realClient,
  callStreamingHeartbeat: async () => null,
}));

// Persisting runs git in the worktree; only whether it runs matters here.
const persistTurnWork = mock();
mock.module("../runtime/turnPersist.js", () => ({ persistTurnWork }));

afterEach(() => {
  vi.useRealTimers();
  mock.restore();
  persistTurnWork.mockReset();
  freshModules();
});

/**
 * A terminal lease means the server already closed this turn. The daemon must
 * exit, and save the agent's edits first, unless a rival daemon now owns the
 * same worktree (`superseded`): a commit from the loser could race the winner.
 */
describe("a terminal lease at finalize", () => {
  async function finalizeUnder(reason: LeaseTerminalReason) {
    freshModules();
    vi.useFakeTimers();
    const { beginTurnOwnership, noteHeartbeatResponse } =
      await import("../runtime/turnLease.js");
    const { setFinalizingState } = await import("../runtime/heartbeats.js");
    const lease = { turnId: "turn-1", leaseGeneration: 1 };
    beginTurnOwnership("claim", lease);
    noteHeartbeatResponse({ lease: { status: "terminal", reason } }, lease);
    const exit = spyOn(process, "exit").mockImplementation((code) => {
      throw new Error("process.exit(" + String(code) + ")");
    });
    expect(await setFinalizingState()).toBe(true);
    // The exit waits out a grace period so the last log lines flush.
    expect(exit).not.toHaveBeenCalled();
    expect(() => vi.runAllTimers()).toThrow("process.exit(0)");
    return { persistTurnWork };
  }

  test.each<LeaseTerminalReason>(["closed", "timeout", "cancelled"])(
    "saves the turn's work, then exits: %s",
    async (reason) => {
      const { persistTurnWork } = await finalizeUnder(reason);
      expect(persistTurnWork).toHaveBeenCalledTimes(1);
    },
  );

  test("exits without touching the worktree once superseded", async () => {
    const { persistTurnWork } = await finalizeUnder("superseded");
    expect(persistTurnWork).not.toHaveBeenCalled();
  });
});
