import { unwrapConvexMutationPayload } from "../http/convexClient.js";
import type { JsonObject, JsonValue } from "../types.js";
import {
  beginTurnOwnership,
  endTurnOwnership,
  getTurnOwnership,
  type TurnLeaseIdentity,
} from "../runtime/turnLease.js";
import { readTurnLeaseIdentity } from "./claimPendingTurnParse.js";
import {
  beginTurnCheckpoint,
  resetTurnCheckpoint,
} from "../runtime/turnCheckpoint.js";

export type ClaimedInteractionMode = "default" | "plan";

type ClaimedTurnBase = {
  prompt: string;
  attachmentUrls: string[];
  interactionMode: ClaimedInteractionMode;
};

export type ClaimedTurn =
  | (ClaimedTurnBase & {
      lifecycle: "legacy";
      turnLease: null;
    })
  | (ClaimedTurnBase & {
      lifecycle: "durable";
      turnLease: TurnLeaseIdentity;
    });

/** Parses the one shared claim contract used by every persistent provider. */
export function readClaimedTurn(result: JsonValue): ClaimedTurn | null {
  const payload = unwrapConvexMutationPayload(result);
  if (!payload || typeof payload.prompt !== "string") return null;
  const lifecycle = payload.turnLifecycle;
  if (
    lifecycle !== undefined &&
    lifecycle !== "legacy" &&
    lifecycle !== "durable"
  ) {
    throw new Error("Claimed turn returned an invalid lifecycle discriminator");
  }
  const attachmentUrls = Array.isArray(payload.attachmentUrls)
    ? payload.attachmentUrls.filter(
        (url): url is string => typeof url === "string",
      )
    : [];
  const interactionMode: ClaimedInteractionMode = "default";
  const turnLease = readTurnLeaseIdentity(result);
  if (lifecycle === "durable" && turnLease === null) {
    throw new Error("Durable claimed turn did not include a lease identity");
  }
  if (lifecycle === "legacy" && turnLease !== null) {
    throw new Error("Legacy claimed turn unexpectedly included a lease identity");
  }
  if (turnLease !== null) {
    return {
      lifecycle: "durable",
      prompt: payload.prompt,
      attachmentUrls,
      interactionMode,
      turnLease,
    };
  }
  return {
    lifecycle: "legacy",
    prompt: payload.prompt,
    attachmentUrls,
    interactionMode,
    turnLease: null,
  };
}

/**
 * Installs ownership before provider execution or heartbeat emission begins.
 * Ownership is one shared fact (see `TurnOwnership`): a legacy claim owns the
 * turn with no lease, a durable claim owns it with one.
 */
export function startClaimedTurn(turn: ClaimedTurn): void {
  if (claimedTurnLifecycleStatus() === "active") {
    throw new Error("Cannot start a claimed turn while another claim is active");
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
  if (ownership.turnLease !== null) {
    args.turnId = ownership.turnLease.turnId;
    args.leaseGeneration = ownership.turnLease.leaseGeneration;
  }
}

/** Clears ownership between turns in a warm provider process. */
export function finishClaimedTurn(): void {
  endTurnOwnership();
  resetTurnCheckpoint();
}

/** Test-only lifecycle view; carries no provider or prompt data. */
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
 * A follow-up send during post-completion bookkeeping is a different turn:
 * finishClaimedTurn has already dropped the old lease, the supervisor is still
 * "finalizing", and discarding leaves the new lease with nobody heartbeating
 * it. That is the session-65 stall (exactly 2 minutes, generation 1, no
 * result log).
 */
export function shouldParkClaimedTurn(input: {
  hasActiveRealTurn: boolean;
  isCancellationInFlight: boolean;
  isFinalizing: boolean;
  currentLeaseTurnId: string | null;
  claimedLeaseTurnId: string | null;
}): boolean {
  if (!input.hasActiveRealTurn || input.isCancellationInFlight) return true;
  if (input.isFinalizing) return true;
  return (
    input.claimedLeaseTurnId !== null &&
    input.claimedLeaseTurnId !== input.currentLeaseTurnId
  );
}
