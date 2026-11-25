import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";

// Builds carry large logs, so page in small batches to stay under read limits.
const BUILD_BATCH_SIZE = 20;

/**
 * Clears two Daytona-era fields nothing reads any more:
 * - `repoSnapshots.snapshotName`: the `snapshot-<repoId>` image label.
 * - `snapshotBuilds.provider`: always "vercel" since Daytona was removed.
 *
 * Run once: `npx convex run migrations:removeDaytonaSnapshotFields`
 * Then drop both fields from the schema and delete this function.
 */
export const removeDaytonaSnapshotFields = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    buildsPatched: v.optional(v.number()),
  },
  returns: v.object({
    snapshotsPatched: v.number(),
    buildsPatched: v.number(),
    done: v.boolean(),
  }),
  handler: async (ctx, args) => {
    let snapshotsPatched = 0;
    // Few rows (one per app), so the first call clears them all at once.
    if (args.cursor === undefined) {
      for (const snapshot of await ctx.db.query("repoSnapshots").collect()) {
        if (snapshot.snapshotName === undefined) continue;
        await ctx.db.patch(snapshot._id, { snapshotName: undefined });
        snapshotsPatched++;
      }
    }

    let buildsPatched = args.buildsPatched ?? 0;
    const page = await ctx.db.query("snapshotBuilds").paginate({
      cursor: args.cursor ?? null,
      numItems: BUILD_BATCH_SIZE,
    });
    for (const build of page.page) {
      if (build.provider === undefined) continue;
      await ctx.db.patch(build._id, { provider: undefined });
      buildsPatched++;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.migrations.removeDaytonaSnapshotFields,
        { cursor: page.continueCursor, buildsPatched },
      );
      return { snapshotsPatched, buildsPatched, done: false };
    }
    console.log(
      `[migration] removeDaytonaSnapshotFields: cleared ${buildsPatched} snapshotBuilds`,
    );
    return { snapshotsPatched, buildsPatched, done: true };
  },
});
