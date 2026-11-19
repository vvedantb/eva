import { describe, expect, test } from "vitest";
import {
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_EXHAUSTED_MESSAGE,
  isTerminalLoading,
  reduceTerminalConnection,
  type TerminalConnection,
  type TerminalConnectionEvent,
} from "./terminalConnection";

function run(
  events: TerminalConnectionEvent[],
  from: TerminalConnection = { status: "initialising" },
): TerminalConnection {
  return events.reduce(reduceTerminalConnection, from);
}

describe("terminal connection lifecycle", () => {
  test("stays loading after the PTY resolves until the handshake", () => {
    const ptyReady = run([{ type: "ptyReady" }]);
    expect(ptyReady).toEqual({ status: "connecting" });
    expect(isTerminalLoading(ptyReady)).toBe(true);

    const connected = run([{ type: "ptyReady" }, { type: "handshake" }]);
    expect(connected).toEqual({ status: "connected" });
    expect(isTerminalLoading(connected)).toBe(false);
  });

  test("a reconnect is not loading and stays reconnecting until its handshake", () => {
    const state = run([
      { type: "ptyReady" },
      { type: "handshake" },
      { type: "socketLost" },
      { type: "ptyReady" },
    ]);
    expect(state).toEqual({ status: "reconnecting", attempt: 1 });
    expect(isTerminalLoading(state)).toBe(false);
  });

  test("a socket that dies before its handshake still spends an attempt", () => {
    expect(run([{ type: "ptyReady" }, { type: "socketLost" }])).toEqual({
      status: "reconnecting",
      attempt: 1,
    });
  });

  test("exhausting the reconnect budget fails with a retryable message", () => {
    const lost: TerminalConnectionEvent[] = Array.from(
      { length: MAX_RECONNECT_ATTEMPTS },
      () => ({ type: "socketLost" }),
    );
    const last = run([{ type: "ptyReady" }, ...lost]);
    expect(last).toEqual({
      status: "reconnecting",
      attempt: MAX_RECONNECT_ATTEMPTS,
    });
    expect(run([{ type: "socketLost" }], last)).toEqual({
      status: "failed",
      message: RECONNECT_EXHAUSTED_MESSAGE,
    });
  });

  test("a handshake resets the reconnect budget", () => {
    const state = run([
      { type: "ptyReady" },
      { type: "socketLost" },
      { type: "socketLost" },
      { type: "handshake" },
      { type: "socketLost" },
    ]);
    expect(state).toEqual({ status: "reconnecting", attempt: 1 });
  });

  test("shell exit is final: a later socket close does not reconnect", () => {
    const state = run([
      { type: "ptyReady" },
      { type: "handshake" },
      { type: "shellExited", code: 130 },
      { type: "socketLost" },
      { type: "handshake" },
    ]);
    expect(state).toEqual({ status: "exited", code: 130 });
  });

  test("init leaves a final state for a fresh attempt", () => {
    expect(
      run([{ type: "init" }], { status: "failed", message: "boom" }),
    ).toEqual({ status: "initialising" });
  });
});
