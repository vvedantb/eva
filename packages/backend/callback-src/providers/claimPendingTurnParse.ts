import { unwrapConvexMutationPayload } from "../http/convexClient.js";
import type { JsonValue } from "../types.js";
import type { TurnLeaseIdentity } from "../runtime/turnLease.js";

/** Reads stop-task toolUseIds from a claimPendingTurn mutation HTTP response. */
export function readStopTaskToolUseIds(result: JsonValue): string[] {
  const payload = unwrapConvexMutationPayload(result);
  if (!payload) {
    return [];
  }
  const field = payload.stopTaskToolUseIds;
  if (!Array.isArray(field)) {
    return [];
  }
  return field.filter((id): id is string => typeof id === "string");
}

/**
 * Reads the `cancelRequested` flag from a claimPendingTurn mutation HTTP
 * response. The server drains this field server-side, so it arrives `true`
 * exactly once per user cancel. Missing (including on servers that predate
 * this field) reads as `false` — same envelope unwrapping as the other
 * claim-payload readers (the value may live under `.value`).
 */
export function readCancelRequested(result: JsonValue): boolean {
  const payload = unwrapConvexMutationPayload(result);
  if (!payload) return false;
  return payload.cancelRequested === true;
}

/**
 * Reads the plan-usage refresh flag. Level-triggered until the refresh
 * action clears it. Missing (old servers) is `false`.
 */
export function readUsageRefreshRequested(result: JsonValue): boolean {
  const payload = unwrapConvexMutationPayload(result);
  if (!payload) return false;
  return payload.usageRefreshRequested === true;
}

/** Reads the durable turn lease identity returned by claimPendingTurn. */
export function readTurnLeaseIdentity(
  result: JsonValue,
): TurnLeaseIdentity | null {
  const payload = unwrapConvexMutationPayload(result);
  if (!payload) return null;
  const turnId = payload.turnId;
  const leaseGeneration = payload.leaseGeneration;
  if (
    typeof turnId !== "string" ||
    typeof leaseGeneration !== "number" ||
    !Number.isSafeInteger(leaseGeneration) ||
    leaseGeneration <= 0
  ) {
    return null;
  }
  return { turnId, leaseGeneration };
}
