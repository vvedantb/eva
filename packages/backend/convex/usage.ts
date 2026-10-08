import { v } from "convex/values";
import { authQuery, hasRepoAccess } from "./functions";
import {
  DAY_MS,
  HOUR_MS,
  summariseUsage,
} from "./_logs/usageSummary";

/** Rows read per summary; beyond this the response is flagged `truncated`. */
const MAX_ROWS = 5000;

const usageTotalsFields = {
  costUsd: v.number(),
  cacheSavingsUsd: v.number(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  cacheReadTokens: v.number(),
  cacheCreationTokens: v.number(),
  completions: v.number(),
  unpricedCompletions: v.number(),
};

const emptySummary = {
  totals: {
    costUsd: 0,
    cacheSavingsUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    completions: 0,
    unpricedCompletions: 0,
  },
  byModel: [],
  buckets: [],
  truncated: false,
};

/**
 * Spend and token usage for a repo over `[startTime, endTime)`, aggregated
 * from the denormalised usage columns only. The client passes both bounds
 * (quantised) so the query never reads the clock; `tzOffsetMinutes` follows
 * `Date.prototype.getTimezoneOffset` so buckets align to the user's local
 * day or hour.
 */
export const summary = authQuery({
  args: {
    repoId: v.id("githubRepos"),
    startTime: v.number(),
    endTime: v.number(),
    bucket: v.union(v.literal("hour"), v.literal("day")),
    tzOffsetMinutes: v.optional(v.number()),
  },
  returns: v.object({
    totals: v.object(usageTotalsFields),
    byModel: v.array(
      v.object({
        model: v.string(),
        provider: v.optional(v.string()),
        ...usageTotalsFields,
      }),
    ),
    buckets: v.array(
      v.object({
        bucketStart: v.number(),
        model: v.string(),
        costUsd: v.number(),
        completions: v.number(),
        inputTokens: v.number(),
        outputTokens: v.number(),
      }),
    ),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      return emptySummary;
    }

    const rows = await ctx.db
      .query("logs")
      .withIndex("by_repo_and_created", (q) =>
        q
          .eq("repoId", args.repoId)
          .gte("createdAt", args.startTime)
          .lt("createdAt", args.endTime),
      )
      .order("desc")
      .take(MAX_ROWS);

    const aggregated = summariseUsage(rows, {
      bucketMs: args.bucket === "hour" ? HOUR_MS : DAY_MS,
      tzOffsetMs: (args.tzOffsetMinutes ?? 0) * 60_000,
    });

    return { ...aggregated, truncated: rows.length >= MAX_ROWS };
  },
});
