import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { authMutation, authQuery } from "./functions";
import { scheduleFinalizeStop } from "./_sessions/sandbox";
import { requestTaskSandboxStop } from "./_agentTasks/sandbox";
import { scheduleFinalizeStopProject } from "./_projects/sandbox";

const DAY_MS = 86_400_000;

/**
 * Parses an "HH:MM" 24-hour string into minutes-from-midnight, or null if it is
 * not a valid time. Used to compare the configured stop time against the
 * current wall-clock time in the configured timezone.
 */
function parseHHMM(value: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const hours = Number(value.slice(0, 2));
  const minutes = Number(value.slice(3, 5));
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Returns the local calendar date ("YYYY-MM-DD") and minutes-from-midnight for
 * `timestamp` as observed in `timeZone`. Formatting an absolute timestamp in
 * the IANA zone means DST transitions are handled automatically — the same
 * "22:00" fires at the correct instant in both summer and winter.
 */
function getLocalParts(
  timestamp: number,
  timeZone: string,
): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const find = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  const hour = Number(find("hour"));
  const minute = Number(find("minute"));
  return {
    date: `${find("year")}-${find("month")}-${find("day")}`,
    minutes: hour * 60 + minute,
  };
}

/**
 * Returns the app-wide sandbox auto-stop settings for the settings UI. Falls
 * back to sensible defaults (disabled, 22:00, UTC) when no row exists yet.
 */
export const getSandboxAutoStopSettings = authQuery({
  args: {},
  returns: v.union(
    v.object({
      enabled: v.boolean(),
      time: v.string(),
      timeZone: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const user = await ctx.db.get(ctx.userId);
    if (user?.isAdmin !== true) return null;
    const doc = await ctx.db.query("appSettings").first();
    return {
      enabled: doc?.sandboxAutoStopEnabled ?? false,
      time: doc?.sandboxAutoStopTime ?? "22:00",
      timeZone: doc?.sandboxAutoStopTimeZone ?? "UTC",
    };
  },
});

/**
 * Upserts the app-wide sandbox auto-stop settings. `timeZone` is the IANA zone
 * captured from the browser at save time so the entered time is interpreted as
 * the user's local time. Changing the schedule clears the last-run guard so the
 * new time can fire today.
 */
export const setSandboxAutoStopSettings = authMutation({
  args: {
    enabled: v.boolean(),
    time: v.string(),
    timeZone: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(ctx.userId);
    if (user?.isAdmin !== true) {
      throw new Error("Not authorized");
    }
    const existing = await ctx.db.query("appSettings").first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        sandboxAutoStopEnabled: args.enabled,
        sandboxAutoStopTime: args.time,
        sandboxAutoStopTimeZone: args.timeZone,
        sandboxAutoStopLastRunDate: undefined,
      });
    } else {
      await ctx.db.insert("appSettings", {
        sandboxAutoStopEnabled: args.enabled,
        sandboxAutoStopTime: args.time,
        sandboxAutoStopTimeZone: args.timeZone,
      });
    }
    return null;
  },
});

/** Internal: reads the full auto-stop config for the cron, or null if unset. */
export const getSettingsInternal = internalQuery({
  args: {},
  returns: v.union(
    v.object({
      enabled: v.boolean(),
      time: v.string(),
      timeZone: v.string(),
      lastRunDate: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const doc = await ctx.db.query("appSettings").first();
    if (!doc) return null;
    return {
      enabled: doc.sandboxAutoStopEnabled,
      time: doc.sandboxAutoStopTime,
      timeZone: doc.sandboxAutoStopTimeZone,
      lastRunDate: doc.sandboxAutoStopLastRunDate ?? null,
    };
  },
});

/** Internal: records the local date of the occurrence the cron just swept. */
export const recordRun = internalMutation({
  args: { date: v.string() },
  returns: v.null(),
  handler: async (ctx, { date }) => {
    const existing = await ctx.db.query("appSettings").first();
    if (existing) {
      await ctx.db.patch(existing._id, { sandboxAutoStopLastRunDate: date });
    }
    return null;
  },
});

/**
 * Internal: collects the ids of every sandbox currently in the `active` state
 * across the four user-facing sandbox surfaces. A full scan is fine here — this
 * runs at most once per day and these tables are small.
 */
export const listActiveSandboxes = internalQuery({
  args: {},
  returns: v.object({
    taskIds: v.array(v.id("agentTasks")),
    projectIds: v.array(v.id("projects")),
    sessionIds: v.array(v.id("sessions")),
  }),
  handler: async (ctx) => {
    const tasks = await ctx.db.query("agentTasks").collect();
    const projects = await ctx.db.query("projects").collect();
    const sessions = await ctx.db.query("sessions").collect();
    return {
      taskIds: tasks
        .filter((t) => t.reviewTaskSandboxStatus === "active" && t.sandboxId)
        .map((t) => t._id),
      projectIds: projects
        .filter((p) => p.reviewProjectSandboxStatus === "active" && p.sandboxId)
        .map((p) => p._id),
      sessionIds: sessions
        .filter((s) => s.status === "active" && s.sandboxId)
        .map((s) => s._id),
    };
  },
});

/**
 * Internal: stops one task preview sandbox. Delegates to the shared
 * `requestTaskSandboxStop` helper (same path as the Stop button, minus the auth
 * check) and only re-validates `active` first, so a sandbox a user restarted
 * between the scan and this call is left alone.
 */
export const stopTask = internalMutation({
  args: { taskId: v.id("agentTasks") },
  returns: v.null(),
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (!task || task.reviewTaskSandboxStatus !== "active") return null;
    await requestTaskSandboxStop(ctx, taskId);
    return null;
  },
});

/** Internal: stops one project preview sandbox. See `stopTask`. */
export const stopProject = internalMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project || !project.sandboxId) return null;
    if (project.reviewProjectSandboxStatus !== "active") return null;
    await scheduleFinalizeStopProject(ctx, {
      projectId,
      sandboxId: project.sandboxId,
      repoId: project.repoId,
    });
    await ctx.db.patch(projectId, { reviewProjectSandboxStatus: "stopping" });
    return null;
  },
});

/** Internal: stops one session sandbox. See `stopTask`. */
export const stopSession = internalMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session || !session.sandboxId) return null;
    if (session.status !== "active") return null;
    await scheduleFinalizeStop(ctx, {
      sessionId,
      sandboxId: session.sandboxId,
      repoId: session.repoId,
    });
    await ctx.db.patch(sessionId, {
      ptySessionId: undefined,
      status: "stopping",
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Cron entry point. Runs every 15 minutes and stops every active sandbox once
 * per day, at (or just after) the configured local time.
 *
 * It resolves the most recent scheduled occurrence rather than matching an
 * exact tick: if the current local time is past the target, the occurrence is
 * today; otherwise it is yesterday's target. Firing only when the occurrence's
 * date differs from the recorded last-run date makes the sweep idempotent
 * per day, recovers a missed tick (e.g. a deploy gap), and correctly handles
 * targets in the final minutes before midnight.
 */
export const run = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const settings = await ctx.runQuery(
      internal.sandboxAutoStop.getSettingsInternal,
      {},
    );
    if (!settings || !settings.enabled) return null;

    const target = parseHHMM(settings.time);
    if (target === null) return null;

    const now = Date.now();
    const today = getLocalParts(now, settings.timeZone);
    const occurrenceDate =
      today.minutes >= target
        ? today.date
        : getLocalParts(now - DAY_MS, settings.timeZone).date;

    if (settings.lastRunDate === occurrenceDate) return null;

    // Claim the occurrence before sweeping so a later tick cannot double-fire.
    await ctx.runMutation(internal.sandboxAutoStop.recordRun, {
      date: occurrenceDate,
    });

    const active = await ctx.runQuery(
      internal.sandboxAutoStop.listActiveSandboxes,
      {},
    );
    for (const taskId of active.taskIds) {
      await ctx.runMutation(internal.sandboxAutoStop.stopTask, { taskId });
    }
    for (const projectId of active.projectIds) {
      await ctx.runMutation(internal.sandboxAutoStop.stopProject, {
        projectId,
      });
    }
    for (const sessionId of active.sessionIds) {
      await ctx.runMutation(internal.sandboxAutoStop.stopSession, {
        sessionId,
      });
    }
    return null;
  },
});
