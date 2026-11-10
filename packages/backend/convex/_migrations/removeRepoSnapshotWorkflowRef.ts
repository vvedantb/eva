import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/**
 * Clears `repoSnapshots.workflowRef`. Snapshots build from the repo's default
 * branch (the branch `.eva/` syncs from), so nothing reads the field.
 *
 * Run once per deployment: `npx convex run migrations:removeRepoSnapshotWorkflowRef`
 * Then remove `workflowRef` from `repoSnapshotFields` and delete this function.
 */
export const removeRepoSnapshotWorkflowRef = internalMutation({
  args: {},
  returns: v.object({ snapshotsPatched: v.number() }),
  handler: async (ctx) => {
    let snapshotsPatched = 0;
    // A handful of rows (one per app with a snapshot config).
    const snapshots = await ctx.db.query("repoSnapshots").collect();
    for (const snapshot of snapshots) {
      if (snapshot.workflowRef === undefined) continue;
      await ctx.db.patch(snapshot._id, { workflowRef: undefined });
      snapshotsPatched++;
    }
    return { snapshotsPatched };
  },
});
