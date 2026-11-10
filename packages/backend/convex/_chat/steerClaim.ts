import { v, type Infer } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { ChatEntityId } from "./surfaceAdapters";

/**
 * The daemon-claim half of steering (routing: `./steer.ts`). A leaf module:
 * the claim mutations spread `steerClaimArgs` at load time, and `./steer.ts`
 * imports the session workflow graph, which would make that spread undefined.
 */

/** Steer args every chat daemon claim accepts. */
export const steerClaimArgs = {
  /** The daemon has a live turn that can take a steer right now. */
  acceptSteer: v.optional(v.boolean()),
  /** Outcome of the steers the previous claim handed over. */
  steerAcks: v.optional(
    v.array(v.object({ id: v.string(), delivered: v.boolean() })),
  ),
};

const steerClaimValidator = v.object(steerClaimArgs);

type SteerHandoff = { id: string; text: string };

/**
 * The steer half of every daemon claim: applies the daemon's acks, then hands
 * over waiting steers when the daemon can take them. Reads the queue only when
 * `steerRequestedAt` is set or acks arrive, so the 50ms poll stays one read.
 */
export async function drainSteers(
  ctx: MutationCtx,
  entity: { _id: ChatEntityId; steerRequestedAt?: number },
  args: Infer<typeof steerClaimValidator>,
): Promise<SteerHandoff[]> {
  for (const ack of args.steerAcks ?? []) {
    const id = ctx.db.normalizeId("queuedMessages", ack.id);
    const row = id ? await ctx.db.get(id) : null;
    if (!row || row.parentId !== entity._id || row.steer !== "delivering") {
      continue;
    }
    // Native steers carry no attachments, so the row owns no blobs.
    if (ack.delivered) await ctx.db.delete(row._id);
    else await ctx.db.patch(row._id, { steer: undefined });
  }
  if (entity.steerRequestedAt === undefined || args.acceptSteer !== true) {
    return [];
  }
  await ctx.db.patch(entity._id, { steerRequestedAt: undefined });
  const queued = await ctx.db
    .query("queuedMessages")
    .withIndex("by_parent_and_order", (q) => q.eq("parentId", entity._id))
    .order("asc")
    .collect();
  const handoffs: SteerHandoff[] = [];
  for (const row of queued) {
    if (row.steer !== "requested") continue;
    await ctx.db.patch(row._id, { steer: "delivering" });
    handoffs.push({ id: row._id, text: row.content });
  }
  return handoffs;
}
