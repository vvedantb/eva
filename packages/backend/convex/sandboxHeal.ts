import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { findSandboxOwnerBySandboxId } from "./_sandbox/owner";

/** Proves that a sandbox is attached to an entity in the supplied repository. */
export const isBoundToRepo = internalQuery({
  args: { sandboxId: v.string(), repoId: v.id("githubRepos") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const owner = await findSandboxOwnerBySandboxId(ctx.db, args.sandboxId);
    return owner?.doc.repoId === args.repoId;
  },
});

/**
 * Minimum gap between background-heal execs for one sandbox. The preview
 * readiness poll asks to heal on every tick (~2s per open page); only one
 * claim per interval wins, so the heal keeps its purpose — restarting
 * background daemons that died while the sandbox stayed active — without
 * exec-storming the sandbox or flooding prod logs.
 */
export const BG_HEAL_MIN_INTERVAL_MS = 45_000;

const STAMP_GC_AGE_MS = 24 * 60 * 60 * 1000;
const STAMP_GC_BATCH = 5;

/**
 * Atomically claims the per-sandbox background-heal slot. Returns true when
 * the caller should run the heal now; false while a recent claim still holds
 * the slot, or while the owning session is still launching its services.
 * Mutation atomicity makes concurrent pollers (multiple tabs or viewers of the
 * same sandbox) race-free — exactly one wins per interval.
 */
export const claim = internalMutation({
  args: { sandboxId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const stamp = await ctx.db
      .query("sandboxHealStamps")
      .withIndex("by_sandbox", (q) => q.eq("sandboxId", args.sandboxId))
      .first();
    if (stamp && now - stamp.lastHealAt < BG_HEAL_MIN_INTERVAL_MS) {
      return false;
    }
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sandbox", (q) => q.eq("sandboxId", args.sandboxId))
      .first();
    if (session?.sandboxServicesPending === true) {
      console.log(
        `[sandbox] preview heal skipped: session services still starting sandbox=${args.sandboxId}`,
      );
      return false;
    }
    if (stamp) {
      await ctx.db.patch(stamp._id, { lastHealAt: now });
    } else {
      await ctx.db.insert("sandboxHealStamps", {
        sandboxId: args.sandboxId,
        lastHealAt: now,
      });
    }
    const dead = await ctx.db
      .query("sandboxHealStamps")
      .withIndex("by_last_heal", (q) =>
        q.lt("lastHealAt", now - STAMP_GC_AGE_MS),
      )
      .take(STAMP_GC_BATCH);
    for (const row of dead) {
      await ctx.db.delete(row._id);
    }
    return true;
  },
});
