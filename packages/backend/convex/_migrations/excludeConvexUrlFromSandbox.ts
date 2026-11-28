import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";

const CONVEX_URL_KEYS = new Set([
  "NEXT_PUBLIC_CONVEX_URL",
  "VITE_CONVEX_URL",
  "CONVEX_URL",
  "PROD_CONVEX_URL",
]);

const BATCH_SIZE = 50;

/**
 * Backfills `sandboxExclude: true` on existing repo/team env-var rows whose key
 * is a Convex URL. The `sandboxExclude` flag is stored per value at save time,
 * so flipping the slot default only affects newly saved values — rows saved
 * earlier keep being injected into the sandbox until this runs.
 *
 * Paginates one table at a time: processes `repoEnvVars`, then chains into
 * `teamEnvVars` via the `table` arg. Run with no args to start.
 */
export const excludeConvexUrlFromSandbox = internalMutation({
  args: {
    table: v.optional(
      v.union(v.literal("repoEnvVars"), v.literal("teamEnvVars")),
    ),
    cursor: v.optional(v.string()),
    varsPatched: v.optional(v.number()),
  },
  returns: v.object({
    varsPatched: v.number(),
    done: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const table = args.table ?? "repoEnvVars";
    let varsPatched = args.varsPatched ?? 0;

    const page = await ctx.db.query(table).paginate({
      cursor: args.cursor ?? null,
      numItems: BATCH_SIZE,
    });

    for (const doc of page.page) {
      let changed = false;
      const nextVars = doc.vars.map((entry) => {
        if (CONVEX_URL_KEYS.has(entry.key) && entry.sandboxExclude !== true) {
          changed = true;
          varsPatched++;
          return { ...entry, sandboxExclude: true };
        }
        return entry;
      });
      if (changed) {
        await ctx.db.patch(doc._id, { vars: nextVars, updatedAt: Date.now() });
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.migrations.excludeConvexUrlFromSandbox,
        { table, cursor: page.continueCursor, varsPatched },
      );
      return { varsPatched, done: false };
    }

    if (table === "repoEnvVars") {
      await ctx.scheduler.runAfter(
        0,
        internal.migrations.excludeConvexUrlFromSandbox,
        { table: "teamEnvVars", varsPatched },
      );
      return { varsPatched, done: false };
    }

    console.log(
      `[migration] excludeConvexUrlFromSandbox: excluded ${varsPatched} Convex URL var(s) from the sandbox`,
    );
    return { varsPatched, done: true };
  },
});
