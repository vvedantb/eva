import { beforeEach, describe, expect, test } from "vitest";
import {
  beginTurnOwnership,
  decideTurnLeaseExit,
  endTurnOwnership,
  getLeaseTerminalReason,
  isSameTurnLease,
  noteHeartbeatResponse,
  releaseTurnLeaseForCompletion,
  type TurnLeaseIdentity,
} from "../runtime/turnLease.js";
import type { JsonValue } from "../types.js";

const LEASE: TurnLeaseIdentity = { turnId: "turn-1", leaseGeneration: 3 };

beforeEach(() => {
  // Ownership transitions clear the terminal fence, so this resets the module.
  endTurnOwnership();
});

/**
 * `noteHeartbeatResponse` is the only thing that stops a superseded daemon from
 * writing over its successor: the server answers a fenced heartbeat with a
 * terminal lease, and the daemon has to recognise it in every response shape it
 * can arrive in (HMAC endpoint JSON string, mutation envelope, bare object).
 */
describe("noteHeartbeatResponse", () => {
  beforeEach(() => {
    beginTurnOwnership("claim", LEASE);
  });

  test("records a terminal reason from a bare payload", () => {
    expect(
      noteHeartbeatResponse(
        {
          accepted: false,
          lease: { status: "terminal", reason: "superseded" },
        },
        LEASE,
      ),
    ).toBe(true);
    expect(getLeaseTerminalReason()).toBe("superseded");
  });

  test("unwraps the nested mutation `value` envelope", () => {
    expect(
      noteHeartbeatResponse(
        {
          status: "success",
          value: {
            accepted: false,
            lease: { status: "terminal", reason: "cancelled" },
          },
        },
        LEASE,
      ),
    ).toBe(true);
    expect(getLeaseTerminalReason()).toBe("cancelled");
  });

  test("parses a JSON string response", () => {
    expect(
      noteHeartbeatResponse(
        JSON.stringify({ lease: { status: "terminal", reason: "timeout" } }),
        LEASE,
      ),
    ).toBe(true);
    expect(getLeaseTerminalReason()).toBe("timeout");
  });

  test("falls back to closed for an unknown reason", () => {
    expect(
      noteHeartbeatResponse(
        { lease: { status: "terminal", reason: "something-new" } },
        LEASE,
      ),
    ).toBe(true);
    expect(getLeaseTerminalReason()).toBe("closed");
  });

  test("falls back to closed for a missing reason", () => {
    expect(
      noteHeartbeatResponse({ lease: { status: "terminal" } }, LEASE),
    ).toBe(true);
    expect(getLeaseTerminalReason()).toBe("closed");
  });

  const benign: [string, JsonValue][] = [
    ["a healthy renewal", { lease: { status: "renewed", expiresAt: 1 } }],
    ["an accepted legacy heartbeat", { accepted: true }],
    ["a non-object lease", { lease: "terminal" }],
    ["an array payload", ["terminal"]],
    ["unparseable text", "<html>502</html>"],
  ];

  test.each(benign)("leaves the fence clear for %s", (_label, response) => {
    expect(noteHeartbeatResponse(response, LEASE)).toBe(false);
    expect(getLeaseTerminalReason()).toBeNull();
  });

  test("keeps the first terminal reason once one has landed", () => {
    noteHeartbeatResponse(
      { lease: { status: "terminal", reason: "superseded" } },
      LEASE,
    );
    expect(
      noteHeartbeatResponse(
        { lease: { status: "terminal", reason: "timeout" } },
        LEASE,
      ),
    ).toBe(true);
    expect(getLeaseTerminalReason()).toBe("superseded");
  });

  test("a new turn's ownership clears the previous fence", () => {
    noteHeartbeatResponse(
      { lease: { status: "terminal", reason: "superseded" } },
      LEASE,
    );
    beginTurnOwnership("claim", { turnId: "turn-2", leaseGeneration: 1 });
    expect(getLeaseTerminalReason()).toBeNull();
  });
});

/**
 * Session 225 (21 Sep 2026): the daemon completed a synthetic turn, a heartbeat
 * that was still in flight under that turn's lease came back `terminal: closed`,
 * and the daemon treated it as a takeover — exiting 400ms after it had minted
 * the next synthetic turn, which then stalled with nobody heartbeating it. A
 * verdict only counts for the lease this process still holds.
 */
describe("noteHeartbeatResponse after the lease was released", () => {
  const closed: JsonValue = { lease: { status: "terminal", reason: "closed" } };

  test("ignores a verdict for a lease released before the reply landed", () => {
    beginTurnOwnership("provider", LEASE);
    releaseTurnLeaseForCompletion();
    expect(noteHeartbeatResponse(closed, LEASE)).toBe(false);
    expect(getLeaseTerminalReason()).toBeNull();
  });

  test("ignores a verdict for the previous turn once a new one is owned", () => {
    beginTurnOwnership("provider", LEASE);
    releaseTurnLeaseForCompletion();
    beginTurnOwnership("provider", { turnId: "turn-2", leaseGeneration: 1 });
    expect(noteHeartbeatResponse(closed, LEASE)).toBe(false);
    expect(getLeaseTerminalReason()).toBeNull();
  });

  test("ignores a verdict from an older generation of the same turn", () => {
    beginTurnOwnership("claim", { ...LEASE, leaseGeneration: 4 });
    expect(noteHeartbeatResponse(closed, LEASE)).toBe(false);
    expect(getLeaseTerminalReason()).toBeNull();
  });

  test("still fences a verdict for the lease currently held", () => {
    beginTurnOwnership("claim", LEASE);
    expect(noteHeartbeatResponse(closed, LEASE)).toBe(true);
    expect(getLeaseTerminalReason()).toBe("closed");
  });

  test("a legacy owner with no lease still honours a terminal reply", () => {
    // Legacy heartbeats carry no lease; the server can still answer
    // `superseded` when a durable turn has taken the session over.
    beginTurnOwnership("claim", null);
    expect(
      noteHeartbeatResponse(
        { accepted: false, lease: { status: "terminal", reason: "superseded" } },
        null,
      ),
    ).toBe(true);
    expect(getLeaseTerminalReason()).toBe("superseded");
  });

  test("a lease-less reply is stale once a durable turn is owned", () => {
    beginTurnOwnership("claim", LEASE);
    expect(noteHeartbeatResponse(closed, null)).toBe(false);
    expect(getLeaseTerminalReason()).toBeNull();
  });
});

describe("isSameTurnLease", () => {
  test("matches on turn id and generation", () => {
    expect(isSameTurnLease(LEASE, { ...LEASE })).toBe(true);
    expect(isSameTurnLease(LEASE, { ...LEASE, leaseGeneration: 4 })).toBe(false);
    expect(isSameTurnLease(LEASE, { ...LEASE, turnId: "turn-2" })).toBe(false);
  });

  test("two lease-less owners compare equal, a lease never equals none", () => {
    expect(isSameTurnLease(null, null)).toBe(true);
    expect(isSameTurnLease(LEASE, null)).toBe(false);
    expect(isSameTurnLease(null, LEASE)).toBe(false);
  });
});

/**
 * A terminal lease exits the process; the latch keeps a 10s heartbeat tick and
 * a 150ms flush tick from scheduling two exits for the same fence.
 */
describe("decideTurnLeaseExit", () => {
  test("keeps running while no terminal lease has landed", () => {
    expect(
      decideTurnLeaseExit({ terminalReason: null, exitScheduled: false }),
    ).toEqual({ action: "continue" });
  });

  test("schedules the exit on the first terminal tick", () => {
    expect(
      decideTurnLeaseExit({
        terminalReason: "superseded",
        exitScheduled: false,
      }),
    ).toEqual({ action: "exit", reason: "superseded" });
  });

  test("does not reschedule an exit that is already pending", () => {
    expect(
      decideTurnLeaseExit({ terminalReason: "closed", exitScheduled: true }),
    ).toEqual({ action: "wait" });
  });

  test("still reports terminal once the exit is scheduled", () => {
    // setFinalizingState returns this so callers skip posting a completion.
    const decision = decideTurnLeaseExit({
      terminalReason: "cancelled",
      exitScheduled: true,
    });
    expect(decision.action).not.toBe("continue");
  });
});
