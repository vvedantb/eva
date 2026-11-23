import { describe, expect, test } from "vitest";
import { DaemonSupervisor } from "../runtime/daemonSupervisor.js";

type Claim = { prompt: string };
type Turn = { kind: "real" } | { kind: "synthetic"; messageId: string };

describe("DaemonSupervisor", () => {
  test("runs one claimed turn through cancellation and settlement", () => {
    const supervisor = new DaemonSupervisor<Claim, Turn>();
    expect(supervisor.parkClaim({ prompt: "hello" })).toBe(true);
    expect(supervisor.hasWork).toBe(true);
    expect(supervisor.takeClaim()).toEqual({ prompt: "hello" });
    expect(supervisor.startTurn({ kind: "real" })).toBe(true);
    expect(supervisor.phase).toBe("running");
    expect(supervisor.beginCancellation()).toBe(true);
    expect(supervisor.phase).toBe("cancelling");
    expect(supervisor.beginFinalizing()).toBe(false);
    supervisor.settleTurn();
    expect(supervisor.phase).toBe("idle");
    expect(supervisor.hasWork).toBe(false);
  });

  test("cannot start two turns or park two claims", () => {
    const supervisor = new DaemonSupervisor<Claim, Turn>();
    expect(supervisor.startTurn({ kind: "real" })).toBe(true);
    expect(
      supervisor.startTurn({ kind: "synthetic", messageId: "message-1" }),
    ).toBe(false);
    expect(supervisor.parkClaim({ prompt: "one" })).toBe(true);
    expect(supervisor.parkClaim({ prompt: "two" })).toBe(false);
  });

  test("represents an asynchronous provider start explicitly", () => {
    const supervisor = new DaemonSupervisor<Claim, Turn>();
    expect(supervisor.beginStarting({ kind: "real" })).toBe(true);
    expect(supervisor.phase).toBe("starting");
    expect(supervisor.markRunning({ kind: "real" })).toBe(true);
    expect(supervisor.phase).toBe("running");
  });

  test("models synthetic opening as a real phase", () => {
    const supervisor = new DaemonSupervisor<Claim, Turn>();
    expect(supervisor.beginSyntheticOpen()).toBe(true);
    expect(supervisor.phase).toBe("opening_synthetic");
    expect(supervisor.beginSyntheticOpen()).toBe(false);
    expect(
      supervisor.startTurn({ kind: "synthetic", messageId: "message-1" }),
    ).toBe(true);
    expect(supervisor.currentTurn).toEqual({
      kind: "synthetic",
      messageId: "message-1",
    });
  });

  test("refresh waits for every independently live region", () => {
    const supervisor = new DaemonSupervisor<Claim, Turn>();
    const quiet = {
      watchedTurnActive: false,
      backgroundAgentCount: 0,
      sdkMessagePending: false,
    };
    expect(supervisor.decideRefresh(quiet)).toEqual({ action: "continue" });

    supervisor.noticeRefresh();
    expect(
      supervisor.decideRefresh({ ...quiet, watchedTurnActive: true }),
    ).toEqual({ action: "defer", blocker: "watched turn" });

    expect(supervisor.beginSyntheticOpen()).toBe(true);
    expect(supervisor.decideRefresh(quiet)).toEqual({
      action: "defer",
      blocker: "synthetic turn opening",
    });
    expect(
      supervisor.startTurn({ kind: "synthetic", messageId: "message-1" }),
    ).toBe(true);
    expect(supervisor.decideRefresh(quiet)).toEqual({
      action: "defer",
      blocker: "running",
    });
    supervisor.settleTurn();

    expect(supervisor.parkClaim({ prompt: "hello" })).toBe(true);
    expect(supervisor.decideRefresh(quiet)).toEqual({
      action: "defer",
      blocker: "claimed turn",
    });
    supervisor.takeClaim();

    expect(
      supervisor.decideRefresh({ ...quiet, backgroundAgentCount: 1 }),
    ).toEqual({ action: "defer", blocker: "background agent" });
    expect(
      supervisor.decideRefresh({ ...quiet, sdkMessagePending: true }),
    ).toEqual({ action: "defer", blocker: "queued SDK message" });
    expect(supervisor.decideRefresh(quiet)).toEqual({ action: "exit" });
  });

  test("explicit stop wins over all work", () => {
    const supervisor = new DaemonSupervisor<Claim, Turn>();
    supervisor.startTurn({ kind: "real" });
    supervisor.stop();
    expect(supervisor.isStopping).toBe(true);
    expect(
      supervisor.decideRefresh({
        watchedTurnActive: true,
        backgroundAgentCount: 1,
        sdkMessagePending: true,
      }),
    ).toEqual({ action: "exit" });
  });
});
