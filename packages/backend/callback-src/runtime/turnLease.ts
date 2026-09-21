import { TURN_ID, TURN_LEASE_GENERATION } from "../config.js";
import type { JsonObject, JsonValue } from "../types.js";
import { log } from "../utils.js";

export type TurnLeaseIdentity = {
  turnId: string;
  leaseGeneration: number;
};

export type LeaseTerminalReason =
  | "unknown_turn"
  | "closed"
  | "superseded"
  | "timeout"
  | "cancelled";

/**
 * Who installed the current ownership. Only a claim can be completed through
 * `appendClaimedTurnCompletion`, and only a claim blocks a second claim from
 * starting; a synthetic turn or the boot lease owns the heartbeat without
 * occupying the claim slot.
 */
export type TurnOwner = "claim" | "provider";

/**
 * The single fact behind "does this process own a turn": ownership plus, for
 * durable turns, the lease that fences its writes. A legacy claim owns a turn
 * with no lease at all, so ownership cannot be inferred from the lease alone —
 * doing that is what silenced legacy daemons (fix 56530596d).
 */
export type TurnOwnership =
  | { status: "idle" }
  | {
      status: "owned";
      owner: TurnOwner;
      turnLease: TurnLeaseIdentity | null;
    };

let turnOwnership: TurnOwnership =
  TURN_ID !== null && TURN_LEASE_GENERATION !== null
    ? {
        status: "owned",
        owner: "provider",
        turnLease: { turnId: TURN_ID, leaseGeneration: TURN_LEASE_GENERATION },
      }
    : { status: "idle" };
let terminalReason: LeaseTerminalReason | null = null;

export function getTurnOwnership(): TurnOwnership {
  return turnOwnership;
}

/** Installs ownership before execution or heartbeat emission begins. */
export function beginTurnOwnership(
  owner: TurnOwner,
  turnLease: TurnLeaseIdentity | null,
): void {
  turnOwnership = { status: "owned", owner, turnLease };
  terminalReason = null;
}

/** Clears ownership between turns in a warm provider process. */
export function endTurnOwnership(): void {
  turnOwnership = { status: "idle" };
  terminalReason = null;
}

export function getCurrentTurnLease(): TurnLeaseIdentity | null {
  return turnOwnership.status === "owned" ? turnOwnership.turnLease : null;
}

/** Daemons must not heartbeat until a claim grants turn ownership. */
export function canSendTurnHeartbeat(input: {
  claimMutation: string | undefined;
  ownership: TurnOwnership;
}): boolean {
  return (
    input.claimMutation === undefined || input.ownership.status === "owned"
  );
}

/** Adds the current fence to any callback mutation payload when one is owned. */
export function appendCurrentTurnLease(args: JsonObject): void {
  const identity = getCurrentTurnLease();
  if (identity === null) return;
  args.turnId = identity.turnId;
  args.leaseGeneration = identity.leaseGeneration;
}

export function getLeaseTerminalReason(): LeaseTerminalReason | null {
  return terminalReason;
}

/** Two legacy (lease-less) owners compare equal; otherwise id and generation must match. */
export function isSameTurnLease(
  a: TurnLeaseIdentity | null,
  b: TurnLeaseIdentity | null,
): boolean {
  if (a === null || b === null) return a === b;
  return a.turnId === b.turnId && a.leaseGeneration === b.leaseGeneration;
}

export type TurnLeaseExitDecision =
  | { action: "continue" }
  | { action: "wait" }
  | { action: "exit"; reason: LeaseTerminalReason };

/**
 * A terminal lease means a successor owns this turn, so this process must stop
 * writing and exit. The scheduling latch is pure so the decision can be tested
 * without a real `process.exit`.
 */
export function decideTurnLeaseExit(input: {
  terminalReason: LeaseTerminalReason | null;
  exitScheduled: boolean;
}): TurnLeaseExitDecision {
  if (input.terminalReason === null) return { action: "continue" };
  if (input.exitScheduled) return { action: "wait" };
  return { action: "exit", reason: input.terminalReason };
}

function parseTerminalReason(value: JsonValue): LeaseTerminalReason | null {
  if (
    value === "unknown_turn" ||
    value === "closed" ||
    value === "superseded" ||
    value === "timeout" ||
    value === "cancelled"
  ) {
    return value;
  }
  return null;
}

/**
 * Records a terminal lease verdict, but only for the lease this process still
 * owns. `sentUnder` is the identity the heartbeat carried when it left: a
 * heartbeat can be answered after this daemon has itself completed that turn
 * (the server closes a synthetic turn inside `completeSyntheticTurn`, and the
 * workflow closes a real one moments after `handleCompletion`), and the reply
 * is then `terminal: closed` for a lease nobody here holds any more. Treating
 * that as "a rival owns this turn" exited the daemon 400ms after it had minted
 * the next synthetic turn, which stalled with no heartbeater (session 225,
 * 21 Sep 2026).
 */
export function noteHeartbeatResponse(
  response: string | JsonValue,
  sentUnder: TurnLeaseIdentity | null,
): boolean {
  if (terminalReason !== null) return true;
  let parsed: JsonValue;
  if (typeof response === "string") {
    try {
      parsed = JSON.parse(response);
    } catch {
      return false;
    }
  } else {
    parsed = response;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return false;
  }
  const responseValue = parsed.value;
  const payload =
    typeof responseValue === "object" &&
    responseValue !== null &&
    !Array.isArray(responseValue)
      ? responseValue
      : parsed;
  const lease = payload.lease;
  if (typeof lease !== "object" || lease === null || Array.isArray(lease)) {
    return false;
  }
  if (lease.status !== "terminal") return false;
  const reason = parseTerminalReason(lease.reason) ?? "closed";
  const current = getCurrentTurnLease();
  if (!isSameTurnLease(sentUnder, current)) {
    log(
      "stale turn lease verdict ignored (" +
        reason +
        ") sentUnder=" +
        String(sentUnder?.turnId) +
        " current=" +
        String(current?.turnId),
    );
    return false;
  }
  terminalReason = reason;
  log("turn lease terminal (" + reason + ") turnId=" + String(current?.turnId));
  return true;
}
