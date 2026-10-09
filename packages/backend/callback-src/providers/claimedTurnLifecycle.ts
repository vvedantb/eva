import { unwrapConvexMutationPayload } from "../utils.js";
import type { JsonObject, JsonValue } from "../types.js";
import {
  appendCurrentTurnLease,
  beginTurnOwnership,
  endTurnOwnership,
  getCurrentTurnLease,
  getTurnOwnership,
  type TurnLeaseIdentity,
} from "../runtime/turnLease.js";
import { log } from "../utils.js";
import { readTurnLeaseIdentity } from "./claimPendingTurnParse.js";
import {
  beginTurnCheckpoint,
  resetTurnCheckpoint,
} from "../runtime/turnCheckpoint.js";

/** A claimed prompt and the durable lease that fences every write of its turn. */
export type ClaimedTurn = {
  prompt: string;
  attachmentUrls: string[];
  turnLease: TurnLeaseIdentity;
};

/**
 * Parses the one shared claim contract used by every persistent provider.
 * Every chat turn is durable, so a prompt without a lease is no claim.
 */
export function readClaimedTurn(result: JsonValue): ClaimedTurn | null {
  const payload = unwrapConvexMutationPayload(result);
  if (!payload || typeof payload.prompt !== "string") return null;
  const lifecycle = payload.turnLifecycle;
  if (lifecycle !== "durable") return null;
  const attachmentUrls = Array.isArray(payload.attachmentUrls)
    ? payload.attachmentUrls.filter(
        (url): url is string => typeof url === "string",
      )
    : [];
  const turnLease = readTurnLeaseIdentity(result);
  if (turnLease === null) {
    throw new Error("Durable claimed turn did not include a lease identity");
  }
  return { prompt: payload.prompt, attachmentUrls, turnLease };
}

/**
 * Installs ownership before provider execution or heartbeat emission begins.
 * Ownership is one shared fact (see `TurnOwnership`).
 */
export function startClaimedTurn(turn: ClaimedTurn): void {
  if (claimedTurnLifecycleStatus() === "active") {
    throw new Error(
      "Cannot start a claimed turn while another claim is active",
    );
  }
  beginTurnOwnership("claim", turn.turnLease);
  beginTurnCheckpoint();
}

/** Fences every real-turn completion through the ownership installed at start. */
export function appendClaimedTurnCompletion(args: JsonObject): void {
  const ownership = getTurnOwnership();
  if (ownership.status !== "owned" || ownership.owner !== "claim") {
    throw new Error("Cannot complete a claimed turn before it starts");
  }
  appendCurrentTurnLease(args);
}

/** Clears ownership between turns in a warm provider process. */
export function finishClaimedTurn(): void {
  endTurnOwnership();
  resetTurnCheckpoint();
}

/**
 * Shared idle/active view of claim ownership, used by startClaimedTurn and
 * tests; carries no provider or prompt data.
 */
export function claimedTurnLifecycleStatus(): "idle" | "active" {
  const ownership = getTurnOwnership();
  return ownership.status === "owned" && ownership.owner === "claim"
    ? "active"
    : "idle";
}

/**
 * Whether a just-claimed prompt should be parked for the run loop instead of
 * discarded. New daemons pass acceptTurn=false until idle, so claimPendingTurn
 * leaves pendingTurn intact and this park path should not see a follow-up.
 * Old sandboxes still acquire the 2-minute running lease on every claim, so
 * discard is only safe for a same-turn restage of the prompt already in flight.
 *
 * A follow-up send during post-completion bookkeeping ("finalizing") never
 * reaches this guard, because the daemon polls with acceptTurn=false until
 * idle. If it did, it is a different turn, so the lease mismatch parks it
 * (discarding it stalled session 65 with a live lease nobody heartbeated).
 */
export function shouldParkClaimedTurn(input: {
  hasActiveRealTurn: boolean;
  isCancellationInFlight: boolean;
  currentLeaseTurnId: string | null;
  claimedLeaseTurnId: string | null;
}): boolean {
  if (!input.hasActiveRealTurn || input.isCancellationInFlight) return true;
  return (
    input.claimedLeaseTurnId !== null &&
    input.claimedLeaseTurnId !== input.currentLeaseTurnId
  );
}

/**
 * Routes a just-claimed turn for every persistent daemon. claimPendingTurn
 * already cleared the staged prompt server-side, so any branch that neither
 * parks nor starts the claim loses that prompt. A cancel response can carry
 * the next queued prompt, and a follow-up send is a different turn: both park.
 * Only a same-turn restage of the prompt already running is discarded, because
 * parking it replays the same prompt twice once the turn ends.
 */
export function routeClaimedTurn(input: {
  turn: ClaimedTurn;
  hasActiveRealTurn: boolean;
  isCancellationInFlight: boolean;
  /** Parks `turn` for the run loop; false when the park slot is taken. */
  park: () => boolean;
  logPrefix: string;
}): "parked" | "duplicate" | "discarded" {
  const currentLease = getCurrentTurnLease();
  const shouldPark = shouldParkClaimedTurn({
    hasActiveRealTurn: input.hasActiveRealTurn,
    isCancellationInFlight: input.isCancellationInFlight,
    currentLeaseTurnId: currentLease?.turnId ?? null,
    claimedLeaseTurnId: input.turn.turnLease.turnId,
  });
  if (!shouldPark) {
    log(
      `${input.logPrefix}: claim discarded while real turn active (prompt lost; pendingTurn was already cleared)`,
    );
    return "discarded";
  }
  if (input.park()) return "parked";
  log(`${input.logPrefix}: duplicate claimed turn ignored`);
  return "duplicate";
}
