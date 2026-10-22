import { unwrapConvexMutationPayload } from "../http/convexClient.js";
import { pushSteerStep } from "../parse/canonical.js";
import type { JsonValue } from "../types.js";

/**
 * Daemon half of steering (server half: `convex/_chat/steer.ts`). A claim
 * hands over queued messages the user pressed Steer on; the daemon injects
 * each into its live turn and acks the outcome on its next claim. A rejected
 * ack leaves the message at the front of the queue, so it runs next.
 */
export type SteerHandoff = { id: string; text: string };
type SteerAck = { id: string; delivered: boolean };

const pendingAcks: SteerAck[] = [];

/** Reads the steers a claimPendingTurn response handed over. */
export function readSteers(result: JsonValue): SteerHandoff[] {
  const payload = unwrapConvexMutationPayload(result);
  const field = payload?.steers;
  if (!Array.isArray(field)) return [];
  const steers: SteerHandoff[] = [];
  for (const item of field) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const { id, text } = item;
    if (typeof id === "string" && typeof text === "string") {
      steers.push({ id, text });
    }
  }
  return steers;
}

/**
 * Steer args for the next claim. Acks stay pending until `confirmSteerAcks`
 * runs after that claim succeeds, so a failed claim resends them.
 */
export function steerClaimArgs(acceptSteer: boolean): {
  acceptSteer: boolean;
  steerAcks?: SteerAck[];
} {
  return pendingAcks.length > 0
    ? { acceptSteer, steerAcks: [...pendingAcks] }
    : { acceptSteer };
}

/** Drops the acks a successful claim carried. */
export function confirmSteerAcks(
  sent: ReturnType<typeof steerClaimArgs>,
): void {
  pendingAcks.splice(0, sent.steerAcks?.length ?? 0);
}

/**
 * Delivers each steer with `inject` and records its ack. A delivered steer
 * also leaves a "Steered" row in the turn's activity timeline, at the point
 * the agent received it.
 */
export async function deliverSteers(
  steers: SteerHandoff[],
  inject: (text: string) => Promise<boolean>,
): Promise<void> {
  for (const steer of steers) {
    const delivered = await inject(steer.text).catch(() => false);
    if (delivered) pushSteerStep(steer.text);
    pendingAcks.push({ id: steer.id, delivered });
  }
}
