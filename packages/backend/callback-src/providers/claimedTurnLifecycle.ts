import { unwrapConvexMutationPayload } from "../http/convexClient.js";
import type { JsonObject, JsonValue } from "../types.js";
import {
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

type ClaimedInteractionMode = "default" | "plan";

/** A claimed prompt and the durable lease that fences every write of its turn. */
export type ClaimedTurn = {
  prompt: string;
  attachmentUrls: string[];
  interactionMode: ClaimedInteractionMode;
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
  const interactionMode: ClaimedInteractionMode = "default";
  const turnLease = readTurnLeaseIdentity(result);
  if (turnLease === null) {
    throw new Error("Durable claimed turn did not include a lease identity");
  }
  return { prompt: payload.prompt, attachmentUrls, interactionMode, turnLease };
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
  args.turnId = ownership.turnLease.turnId;
  args.leaseGeneration = ownership.turnLease.leaseGeneration;
}

/** Clears ownership between turns in a warm provider process. */
export function finishClaimedTurn(): void {
  endTurnOwnership();
  resetTurnCheckpoint();
}

/** Whether a claim (not a synthetic or boot turn) holds the ownership slot. */
export function claimedTurnLifecycleStatus(): "idle" | "active" {
  const ownership = getTurnOwnership();
  return ownership.status === "owned" && ownership.owner === "claim"
    ? "active"
    : "idle";
}

function shouldParkClaimedTurn(input: {
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
  park: () => boolean;
  logPrefix: string;
}): "parked" | "duplicate" | "discarded" {
  const shouldPark = shouldParkClaimedTurn({
    hasActiveRealTurn: input.hasActiveRealTurn,
    isCancellationInFlight: input.isCancellationInFlight,
    currentLeaseTurnId: getCurrentTurnLease()?.turnId ?? null,
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
