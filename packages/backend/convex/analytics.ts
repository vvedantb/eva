import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { authQuery, hasRepoAccess, sessionVisibleToUser } from "./functions";
import { filterActiveEntities } from "./numId";
import { loadLastSeenAt } from "./_users/lastSeen";

/**
 * Sidebar cook-rate strip: done + cancelled task counts only.
 *
 * RepoStatsSummary used to subscribe to `getImpactStats` with no time window,
 * which collected every session, project, task, and fat agentRun (logs) for
 * the repo on every sidebar mount. This query only needs two status indexes.
 */
export const getShipRateStats = authQuery({
  args: {
    repoId: v.id("githubRepos"),
  },
  returns: v.object({
    tasksRan: v.number(),
    shipRate: v.number(),
  }),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      return { tasksRan: 0, shipRate: 0 };
    }
    const [doneDocs, cancelledDocs] = await Promise.all([
      ctx.db
        .query("agentTasks")
        .withIndex("by_repo_and_status", (q) =>
          q.eq("repoId", args.repoId).eq("status", "done"),
        )
        .collect(),
      ctx.db
        .query("agentTasks")
        .withIndex("by_repo_and_status", (q) =>
          q.eq("repoId", args.repoId).eq("status", "cancelled"),
        )
        .collect(),
    ]);
    const done = filterActiveEntities(doneDocs).length;
    const cancelled = filterActiveEntities(cancelledDocs).length;
    const tasksRan = done + cancelled;
    return {
      tasksRan,
      shipRate: tasksRan > 0 ? Math.round((done / tasksRan) * 100) : 0,
    };
  },
});

/**
 * Returns aggregate impact metrics for a repo, with optional period comparison.
 *
 * The comparison window is the caller's to supply. Deriving it here from
 * `Date.now()` looked simpler and was wrong: Convex invalidates a query on its
 * data, never on the clock, so the "previous period" stayed pinned to whenever
 * the result was first computed.
 */
export const getImpactStats = authQuery({
  args: {
    repoId: v.id("githubRepos"),
    startTime: v.optional(v.number()),
    /** Start of the equal-length window before `startTime`. */
    previousStartTime: v.optional(v.number()),
  },
  returns: v.object({
    prsShipped: v.number(),
    /** Tasks in a terminal outcome (done/merged + cancelled). */
    tasksRan: v.number(),
    totalSessions: v.number(),
    sessionsWithPr: v.number(),
    /** done / (done + cancelled), as a percent. */
    shipRate: v.number(),
    tasksCompleted: v.number(),
    /** Distinct session PRs whose live state is "merged". */
    prsMerged: v.number(),
    /** prsMerged / distinct session PRs, as a percent. */
    mergeRate: v.number(),
    /**
     * Median task-created-to-PR latency. Absent when no task in the window
     * produced a PR from a finished run.
     */
    medianTimeToPrMs: v.optional(v.number()),
    /** Done tasks that needed exactly one run, as a percent of done tasks that ran. */
    firstTryRate: v.number(),
    /** Summed wall-clock time of runs that finished in the window. */
    agentWorkMs: v.number(),
    prevPrsShipped: v.optional(v.number()),
    prevTasksRan: v.optional(v.number()),
    prevTasksCompleted: v.optional(v.number()),
    prevShipRate: v.optional(v.number()),
    prevPrsMerged: v.optional(v.number()),
    prevFirstTryRate: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      return {
        prsShipped: 0,
        tasksRan: 0,
        totalSessions: 0,
        sessionsWithPr: 0,
        shipRate: 0,
        tasksCompleted: 0,
        prsMerged: 0,
        mergeRate: 0,
        medianTimeToPrMs: undefined,
        firstTryRate: 0,
        agentWorkMs: 0,
      };
    }
    const startTime = args.startTime;
    const rangeStart =
      args.previousStartTime !== undefined
        ? args.previousStartTime
        : args.startTime;

    const sessions = (
      rangeStart === undefined
        ? await ctx.db
            .query("sessions")
            .withIndex("by_repo", (q) => q.eq("repoId", args.repoId))
            .collect()
        : await ctx.db
            .query("sessions")
            .withIndex("by_repo", (q) =>
              q.eq("repoId", args.repoId).gte("_creationTime", rangeStart),
            )
            .collect()
    ).filter((session) => sessionVisibleToUser(session, ctx.userId));

    const allTasks =
      rangeStart === undefined
        ? await ctx.db
            .query("agentTasks")
            .withIndex("by_repo", (q) => q.eq("repoId", args.repoId))
            .collect()
        : await ctx.db
            .query("agentTasks")
            .withIndex("by_repo_and_updatedAt", (q) =>
              q.eq("repoId", args.repoId).gte("updatedAt", rangeStart),
            )
            .collect();

    const projects =
      rangeStart === undefined
        ? await ctx.db
            .query("projects")
            .withIndex("by_repo", (q) => q.eq("repoId", args.repoId))
            .collect()
        : await ctx.db
            .query("projects")
            .withIndex("by_repo", (q) =>
              q.eq("repoId", args.repoId).gte("_creationTime", rangeStart),
            )
            .collect();

    // Runs are only consulted for tasks that can appear in either the current
    // or previous window. Skip older tasks' runs — agentRuns carry large logs.
    const tasksNeedingRuns = allTasks.filter((task) => task.status !== "draft");
    const runsByTaskId = new Map<
      string,
      Array<{ prUrl?: string; startedAt?: number; finishedAt?: number }>
    >();
    await Promise.all(
      tasksNeedingRuns.map(async (task) => {
        const runs = await ctx.db
          .query("agentRuns")
          .withIndex("by_task", (q) => q.eq("taskId", task._id))
          .collect();
        runsByTaskId.set(
          task._id,
          runs.map((run) => ({
            prUrl: run.prUrl,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
          })),
        );
      }),
    );

    /** Middle value of `values`, averaging the two middles when even. */
    function median(values: number[]): number | undefined {
      if (values.length === 0) return undefined;
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 1
        ? sorted[mid]
        : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    }

    /** Computes stats for sessions/tasks/runs starting from an optional timestamp. */
    function computeStats(from: number | undefined) {
      const prUrls = new Set<string>();
      // Merge state only exists on sessions, so the merge rate is measured
      // against session PRs rather than every PR counted in `prsShipped`.
      const sessionPrUrls = new Set<string>();
      const mergedPrUrls = new Set<string>();
      const filtered =
        from !== undefined
          ? sessions.filter((s) => s._creationTime >= from)
          : sessions;
      let withPr = 0;
      for (const s of filtered) {
        if (s.prUrl) {
          withPr++;
          prUrls.add(s.prUrl);
          sessionPrUrls.add(s.prUrl);
          if (s.prState === "merged") mergedPrUrls.add(s.prUrl);
        }
      }
      let done = 0;
      let cancelled = 0;
      // Denominator for the first-try rate: a done task with no runs never
      // took a "try", so counting it would deflate the rate.
      let doneWithRuns = 0;
      let firstTryTasks = 0;
      let agentWorkMs = 0;
      const timeToPrMs: number[] = [];
      for (const task of allTasks) {
        if (from !== undefined && task.updatedAt < from) continue;
        const runs = runsByTaskId.get(task._id) ?? [];
        if (task.status === "done") {
          done++;
          if (runs.length > 0) {
            doneWithRuns++;
            if (runs.length === 1) firstTryTasks++;
          }
        } else if (task.status === "cancelled") cancelled++;
        let firstPrRunFinishedAt: number | undefined;
        for (const run of runs) {
          if (run.prUrl) {
            prUrls.add(run.prUrl);
            if (
              firstPrRunFinishedAt === undefined &&
              run.finishedAt !== undefined
            ) {
              firstPrRunFinishedAt = run.finishedAt;
            }
          }
          if (
            run.startedAt !== undefined &&
            run.finishedAt !== undefined &&
            (from === undefined || run.finishedAt >= from)
          ) {
            agentWorkMs += Math.max(0, run.finishedAt - run.startedAt);
          }
        }
        if (firstPrRunFinishedAt !== undefined) {
          timeToPrMs.push(Math.max(0, firstPrRunFinishedAt - task.createdAt));
        }
      }
      const filteredProjects =
        from !== undefined
          ? projects.filter((p) => p._creationTime >= from)
          : projects;
      for (const p of filteredProjects) {
        if (p.prUrl) prUrls.add(p.prUrl);
      }
      const tasksRan = done + cancelled;
      // Cook rate: finished successfully vs finished at all (done/merged + cancelled).
      const rate = tasksRan > 0 ? Math.round((done / tasksRan) * 100) : 0;
      return {
        prsShipped: prUrls.size,
        tasksRan,
        totalSessions: filtered.length,
        sessionsWithPr: withPr,
        shipRate: rate,
        tasksCompleted: done,
        prsMerged: mergedPrUrls.size,
        mergeRate:
          sessionPrUrls.size > 0
            ? Math.round((mergedPrUrls.size / sessionPrUrls.size) * 100)
            : 0,
        medianTimeToPrMs: median(timeToPrMs),
        firstTryRate:
          doneWithRuns > 0
            ? Math.round((firstTryTasks / doneWithRuns) * 100)
            : 0,
        agentWorkMs,
        /** Raw counters kept out of the response, used to derive prev rates. */
        internal: { doneWithRuns, firstTryTasks },
      };
    }

    const { internal: currentInternal, ...current } = computeStats(startTime);

    if (startTime !== undefined && args.previousStartTime !== undefined) {
      // computeStats is cumulative from a timestamp, so the previous period is
      // the wider window minus the current one — see the subtractions below.
      const prev = computeStats(args.previousStartTime);
      const prevTasksCompleted = prev.tasksCompleted - current.tasksCompleted;
      const prevTasksRan = prev.tasksRan - current.tasksRan;
      const prevDoneWithRuns =
        prev.internal.doneWithRuns - currentInternal.doneWithRuns;
      const prevFirstTryTasks =
        prev.internal.firstTryTasks - currentInternal.firstTryTasks;
      return {
        ...current,
        prevPrsShipped: prev.prsShipped - current.prsShipped,
        prevTasksRan,
        prevTasksCompleted,
        prevShipRate:
          prevTasksRan > 0
            ? Math.round((prevTasksCompleted / prevTasksRan) * 100)
            : 0,
        prevPrsMerged: prev.prsMerged - current.prsMerged,
        prevFirstTryRate:
          prevDoneWithRuns > 0
            ? Math.round((prevFirstTryTasks / prevDoneWithRuns) * 100)
            : 0,
      };
    }

    return current;
  },
});

/**
 * Returns the count of users with active sessions in the repo within the last
 * five minutes of `now`.
 *
 * `now` is an argument because a query that reads the clock keeps serving the
 * first answer it computed — the count would freeze while still claiming to
 * cover the last five minutes. Callers pass a timestamp quantized to a minute,
 * which keeps the result cacheable for that minute.
 */
export const getActiveUsers = authQuery({
  args: {
    repoId: v.id("githubRepos"),
    now: v.number(),
  },
  returns: v.object({
    count: v.number(),
  }),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      return { count: 0 };
    }
    const fiveMinAgo = args.now - 300_000;
    const activeSessions = (
      await ctx.db
        .query("sessions")
        .withIndex("by_repo_and_status", (q) =>
          q.eq("repoId", args.repoId).eq("status", "active"),
        )
        .collect()
    ).filter((session) => sessionVisibleToUser(session, ctx.userId));

    const repoUserIds = [
      ...new Set<Id<"users">>(activeSessions.map((session) => session.userId)),
    ];
    const lastSeenAts = await Promise.all(
      repoUserIds.map((id) => loadLastSeenAt(ctx.db, id)),
    );
    const activeCount = lastSeenAts.filter(
      (lastSeenAt) => lastSeenAt !== undefined && lastSeenAt >= fiveMinAgo,
    ).length;
    return { count: activeCount };
  },
});

/**
 * Returns time-bucketed activity data (tasks, runs, sessions, PRs, active
 * users) for charting, covering `startTime` through `endTime`.
 *
 * `endTime` is the caller's rather than `Date.now()`: the bucket list is part of
 * the cached result, so a clock read here would keep returning the buckets that
 * existed when the chart was first drawn.
 */
export const getActivityTimeline = authQuery({
  args: {
    repoId: v.id("githubRepos"),
    startTime: v.number(),
    /** Right edge of the chart — the last bucket is the one containing it. */
    endTime: v.number(),
    bucketSizeMs: v.number(),
  },
  returns: v.array(
    v.object({
      date: v.number(),
      tasks: v.number(),
      tasksCompleted: v.number(),
      runs: v.number(),
      sessions: v.number(),
      sessionsWithPr: v.number(),
      activeUsers: v.number(),
      prsShipped: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const buckets: Record<
      number,
      {
        tasks: number;
        tasksCompleted: number;
        runs: number;
        sessions: number;
        sessionsWithPr: number;
        prsShipped: number;
      }
    > = {};
    const activeUsersByBucket: Record<number, Set<Id<"users">>> = {};
    for (let t = args.startTime; t <= args.endTime; t += args.bucketSizeMs) {
      buckets[t] = {
        tasks: 0,
        tasksCompleted: 0,
        runs: 0,
        sessions: 0,
        sessionsWithPr: 0,
        prsShipped: 0,
      };
      activeUsersByBucket[t] = new Set<Id<"users">>();
    }
    /** Maps a timestamp to its corresponding bucket start time. */
    const getBucket = (timestamp: number) => {
      const bucketStart =
        Math.floor((timestamp - args.startTime) / args.bucketSizeMs) *
          args.bucketSizeMs +
        args.startTime;
      return bucketStart;
    };
    const tasks = await ctx.db
      .query("agentTasks")
      .withIndex("by_repo", (q) => q.eq("repoId", args.repoId))
      .collect();
    for (const task of tasks) {
      if (task.createdAt >= args.startTime) {
        const bucket = getBucket(task.createdAt);
        if (buckets[bucket]) buckets[bucket].tasks++;
      }
      if (task.status === "done" && task.updatedAt >= args.startTime) {
        const bucket = getBucket(task.updatedAt);
        if (buckets[bucket]) buckets[bucket].tasksCompleted++;
      }
    }
    const allTaskRuns = await Promise.all(
      tasks.map((task) =>
        ctx.db
          .query("agentRuns")
          .withIndex("by_task", (q) => q.eq("taskId", task._id))
          .collect(),
      ),
    );
    for (const runs of allTaskRuns) {
      for (const run of runs) {
        if (run.startedAt && run.startedAt >= args.startTime) {
          const bucket = getBucket(run.startedAt);
          if (buckets[bucket]) {
            buckets[bucket].runs++;
            if (run.prUrl) buckets[bucket].prsShipped++;
          }
        }
      }
    }
    const sessions = (
      await ctx.db
        .query("sessions")
        .withIndex("by_repo", (q) => q.eq("repoId", args.repoId))
        .collect()
    ).filter((session) => sessionVisibleToUser(session, ctx.userId));
    const usersInActiveSessions = new Set<Id<"users">>();
    for (const session of sessions) {
      if (session._creationTime >= args.startTime) {
        const bucket = getBucket(session._creationTime);
        if (buckets[bucket]) {
          buckets[bucket].sessions++;
          if (session.prUrl) {
            buckets[bucket].prsShipped++;
            buckets[bucket].sessionsWithPr++;
          }
        }
      }
      if (session.status === "active") {
        usersInActiveSessions.add(session.userId);
      }
    }
    const activeSessionUserIds = [...usersInActiveSessions];
    const lastSeenAts = await Promise.all(
      activeSessionUserIds.map((id) => loadLastSeenAt(ctx.db, id)),
    );
    for (let i = 0; i < activeSessionUserIds.length; i++) {
      const lastSeenAt = lastSeenAts[i];
      if (lastSeenAt !== undefined && lastSeenAt >= args.startTime) {
        const bucket = getBucket(lastSeenAt);
        const bucketUsers = activeUsersByBucket[bucket];
        if (bucketUsers) {
          bucketUsers.add(activeSessionUserIds[i]);
        }
      }
    }
    return Object.entries(buckets)
      .map(([date, data]) => ({
        date: Number(date),
        ...data,
        activeUsers: activeUsersByBucket[Number(date)]?.size ?? 0,
      }))
      .sort((a, b) => a.date - b.date);
  },
});

/**
 * Returns daily completed-task and successful-run counts for rendering an
 * activity heatmap, from `startTime` onwards.
 *
 * `startTime` is required because the default it replaced was `Date.now()` less
 * a year: a cached result kept the window anchored to the day it was first
 * computed, so the heatmap silently stopped advancing.
 */
export const getActivityHeatmap = authQuery({
  args: {
    repoId: v.id("githubRepos"),
    startTime: v.number(),
  },
  returns: v.array(
    v.object({
      date: v.string(),
      count: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];

    const cutoff = args.startTime;

    const tasks = await ctx.db
      .query("agentTasks")
      .withIndex("by_repo_and_updatedAt", (q) =>
        q.eq("repoId", args.repoId).gte("updatedAt", cutoff),
      )
      .collect();

    const dailyCounts = new Map<string, number>();
    for (const task of tasks) {
      if (task.status !== "done") continue;
      const day = new Date(task.updatedAt).toISOString().slice(0, 10);
      dailyCounts.set(day, (dailyCounts.get(day) ?? 0) + 1);
    }

    const runs = await Promise.all(
      tasks.map((task) =>
        ctx.db
          .query("agentRuns")
          .withIndex("by_task", (q) => q.eq("taskId", task._id))
          .collect(),
      ),
    );
    for (const taskRuns of runs) {
      for (const run of taskRuns) {
        if (
          run.status === "success" &&
          run.finishedAt &&
          run.finishedAt >= cutoff
        ) {
          const day = new Date(run.finishedAt).toISOString().slice(0, 10);
          dailyCounts.set(day, (dailyCounts.get(day) ?? 0) + 1);
        }
      }
    }

    return [...dailyCounts.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  },
});

/** Returns the top 5 users ranked by PRs created and tasks completed for a repo. */
export const getLeaderboard = authQuery({
  args: {
    repoId: v.id("githubRepos"),
    startTime: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      userId: v.id("users"),
      fullName: v.optional(v.string()),
      tasksCompleted: v.number(),
      prsCreated: v.number(),
      sessionsWithPr: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const tasks = await ctx.db
      .query("agentTasks")
      .withIndex("by_repo", (q) => q.eq("repoId", args.repoId))
      .collect();
    const userStats = new Map<
      Id<"users">,
      { tasksCompleted: number; prsCreated: number; sessionsWithPr: number }
    >();
    const startTime = args.startTime;
    const filteredTasks =
      startTime !== undefined
        ? tasks.filter((t) => t.updatedAt >= startTime)
        : tasks;
    const tasksWithCreator = filteredTasks.filter((t) => t.createdBy);
    const leaderboardRuns = await Promise.all(
      tasksWithCreator.map((task) =>
        ctx.db
          .query("agentRuns")
          .withIndex("by_task", (q) => q.eq("taskId", task._id))
          .collect(),
      ),
    );
    for (let i = 0; i < tasksWithCreator.length; i++) {
      const task = tasksWithCreator[i];
      if (!task.createdBy) continue;
      const cur = userStats.get(task.createdBy) ?? {
        tasksCompleted: 0,
        prsCreated: 0,
        sessionsWithPr: 0,
      };
      if (task.status === "done") cur.tasksCompleted++;
      const runs = leaderboardRuns[i];
      const filteredRuns =
        startTime !== undefined
          ? runs.filter((r) => r.finishedAt && r.finishedAt >= startTime)
          : runs;
      cur.prsCreated += filteredRuns.filter((r) => r.prUrl).length;
      userStats.set(task.createdBy, cur);
    }
    const sessions = (
      await ctx.db
        .query("sessions")
        .withIndex("by_repo", (q) => q.eq("repoId", args.repoId))
        .collect()
    ).filter((session) => sessionVisibleToUser(session, ctx.userId));
    const filteredSessions =
      startTime !== undefined
        ? sessions.filter((s) => s._creationTime >= startTime)
        : sessions;
    for (const session of filteredSessions) {
      if (session.prUrl) {
        const cur = userStats.get(session.userId) ?? {
          tasksCompleted: 0,
          prsCreated: 0,
          sessionsWithPr: 0,
        };
        cur.sessionsWithPr++;
        userStats.set(session.userId, cur);
      }
    }
    const userStatEntries = [...userStats.entries()];
    const leaderboardUsers = await Promise.all(
      userStatEntries.map(([userId]) => ctx.db.get(userId)),
    );
    const leaderboard = userStatEntries
      .map(([, stats], i) => {
        const user = leaderboardUsers[i];
        if (!user) return null;
        return {
          userId: user._id,
          fullName: user.fullName ?? undefined,
          ...stats,
        };
      })
      .filter((entry): entry is Exclude<typeof entry, null> => entry !== null);
    return leaderboard
      .sort(
        (a, b) =>
          b.prsCreated - a.prsCreated || b.tasksCompleted - a.tasksCompleted,
      )
      .slice(0, 5);
  },
});
