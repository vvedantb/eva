import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";

const PAGE_SIZE = 200;

/**
 * Deletes every turn whose owner is an `agentRuns` row: the durable turns of
 * runs from before runs became chat turns. All are closed, and nothing reads
 * them; they are the last rows that name the run table, so once this has run
 * the `agentRuns` table and its id in `turnEntityIdValidator` can be dropped.
 * Pages through `turns`, scheduling itself; safe to run again. Delete this
 * file with the table.
 */
export const deleteRunTurns = internalMutation({
  args: { cursor: v.optional(v.string()), deleted: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("turns")
      .paginate({ cursor: args.cursor ?? null, numItems: PAGE_SIZE });
    let deleted = args.deleted ?? 0;
    for (const turn of page.page) {
      if (ctx.db.normalizeId("agentRuns", turn.entityId) === null) continue;
      await ctx.db.delete(turn._id);
      deleted += 1;
    }
    if (page.isDone) {
      console.log(`[deleteRunTurns] done: ${deleted} run turns deleted`);
      return null;
    }
    await ctx.scheduler.runAfter(
      0,
      internal._migrations.deleteRunTurns.deleteRunTurns,
      { cursor: page.continueCursor, deleted },
    );
    return null;
  },
});
