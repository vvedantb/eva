import { afterEach, describe, expect, mock, spyOn, test, vi } from "bun:test";
import type { LeaseTerminalReason } from "../runtime/turnLease.js";
import { freshModules } from "./freshModules";

const realClient = { ...(await import("../http/convexClient.js")) };
mock.module("../http/convexClient.js", () => ({
  ...realClient,
  callStreamingHeartbeat: async () => null,
}));

const persistTurnWork = mock();
mock.module("../runtime/turnPersist.js", () => ({ persistTurnWork }));

afterEach(() => {
  vi.useRealTimers();
  mock.restore();
  persistTurnWork.mockReset();
  freshModules();
});

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
