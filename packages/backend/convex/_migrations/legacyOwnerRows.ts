import { v } from "convex/values";
import type { PaginationResult } from "convex/server";
import { internalQuery, type QueryCtx } from "../_generated/server";

/**
 * The gate before 3b narrows the schema: counts the rows that still hang off
 * a task or project in every table whose union 3b narrows. 3b may merge only
 * when every table reports 0 (`isDone` true, `left` 0 summed over the pages).
 * Read-only; one bounded page per call, so it runs in prod:
 *
 *   npx convex run --prod migrations:legacyOwnerRowsLeft '{"table":"messages"}'
 *   # repeat with "cursor": <continueCursor> until isDone, for each table
 */

const legacyOwnerTableValidator = v.union(
  v.literal("messages"),
  v.literal("queuedMessages"),
  v.literal("chatUiPanels"),
  v.literal("chatHtmlRenders"),
  v.literal("envVarRequests"),
  v.literal("feedback"),
  v.literal("turns"),
  v.literal("drafts"),
  v.literal("sandboxActivity"),
);

// Message rows carry activity logs: keep a page well under the read limit.
const PAGE_SIZE = 100;

/** True when `id` names a task or a project. */
function isOwnerId(ctx: QueryCtx, id: string): boolean {
  return (
    ctx.db.normalizeId("agentTasks", id) !== null ||
    ctx.db.normalizeId("projects", id) !== null
  );
}

export const legacyOwnerRowsLeft = internalQuery({
  args: {
    table: legacyOwnerTableValidator,
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({
    table: legacyOwnerTableValidator,
    left: v.number(),
    scanned: v.number(),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const opts = { cursor: args.cursor ?? null, numItems: PAGE_SIZE };
    const counted = <T>(page: PaginationResult<T>, left: number) => ({
      table: args.table,
      left,
      scanned: page.page.length,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    });
    switch (args.table) {
      case "messages": {
        const page = await ctx.db.query("messages").paginate(opts);
        return counted(
          page,
          page.page.filter((r) => isOwnerId(ctx, r.parentId)).length,
        );
      }
      case "queuedMessages": {
        const page = await ctx.db.query("queuedMessages").paginate(opts);
        return counted(
          page,
          page.page.filter((r) => isOwnerId(ctx, r.parentId)).length,
        );
      }
      case "chatUiPanels": {
        const page = await ctx.db.query("chatUiPanels").paginate(opts);
        return counted(
          page,
          page.page.filter((r) => isOwnerId(ctx, r.parentId)).length,
        );
      }
      case "chatHtmlRenders": {
        const page = await ctx.db.query("chatHtmlRenders").paginate(opts);
        return counted(
          page,
          page.page.filter((r) => isOwnerId(ctx, r.parentId)).length,
        );
      }
      case "envVarRequests": {
        const page = await ctx.db.query("envVarRequests").paginate(opts);
        return counted(
          page,
          page.page.filter((r) => isOwnerId(ctx, r.parentId)).length,
        );
      }
      case "feedback": {
        const page = await ctx.db.query("feedback").paginate(opts);
        return counted(
          page,
          page.page.filter((r) => isOwnerId(ctx, r.parentId)).length,
        );
      }
      case "turns": {
        // Projects keep their interview lane turns; only task turns are left over.
        const page = await ctx.db.query("turns").paginate(opts);
        return counted(
          page,
          page.page.filter(
            (r) => ctx.db.normalizeId("agentTasks", r.entityId) !== null,
          ).length,
        );
      }
      case "drafts": {
        const page = await ctx.db.query("drafts").paginate(opts);
        return counted(
          page,
          page.page.filter(
            (r) => r.kind === "taskChat" || r.kind === "projectChat",
          ).length,
        );
      }
      case "sandboxActivity": {
        const page = await ctx.db.query("sandboxActivity").paginate(opts);
        return counted(
          page,
          page.page.filter((r) => r.kind !== "session").length,
        );
      }
    }
  },
});
