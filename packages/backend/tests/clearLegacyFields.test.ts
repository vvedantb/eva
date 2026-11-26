import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "bun:test";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { modules } from "./_helpers/convexModules";

/**
 * `clearLegacyFields` empties every legacy field and table a follow-up drops
 * from the schema, keeps the behaviour the old rows had, and is safe to rerun.
 */

const TIMEOUT_MS = 30_000;

afterEach(() => {
  vi.useRealTimers();
});

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", { clerkId: "clerk|legacy" });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const aveSessionId = await ctx.db.insert("sessions", {
      owner: { kind: "standalone" },
      repoId,
      userId,
      title: "Old Ave",
      status: "active",
      isOrchestrator: true,
    });
    await ctx.db.patch(userId, { orchestratorSessionId: aveSessionId });
    await ctx.db.insert("queuedMessages", {
      parentId: aveSessionId,
      content: "wake up",
      userId,
      createdAt: now,
      orchestratorNotification: true,
    });
    const watchedSessionId = await ctx.db.insert("sessions", {
      owner: { kind: "standalone" },
      repoId,
      userId,
      title: "Watched",
      status: "active",
      watchedByOrchestrator: aveSessionId,
    });
    // A cancelled job still gives the row a real `_scheduled_functions` id.
    const jobId = await ctx.scheduler.runAfter(
      60_000,
      internal._migrations.clearLegacyFields.clearLegacyFields,
      {},
    );
    await ctx.scheduler.cancel(jobId);
    const taskId = await ctx.db.insert("agentTasks", {
      repoId,
      title: "Retry",
      status: "todo",
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      run: { state: "retry_pending", at: now + 60_000, jobId },
      watchedByOrchestrator: aveSessionId,
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId,
      title: "Project",
      rawInput: "project",
      updatedAt: now,
      watchedByOrchestrator: aveSessionId,
    });
    const settingsId = await ctx.db.insert("appSettings", {
      sandboxAutoStopEnabled: false,
      sandboxAutoStopTime: "22:00",
      sandboxAutoStopTimeZone: "UTC",
      sandboxIdleStopEnabled: false,
      sandboxIdleStopMinutes: 120,
    });
    const canonicalUsageId = await ctx.db.insert("agentUsageLimits", {
      provider: "claude",
      capturedAt: now,
    });
    await ctx.db.insert("agentUsageLimits", {
      provider: "claude",
      repoId,
      capturedAt: now,
    });
    await ctx.db.insert("sessionDaemonStates", {
      sessionId: watchedSessionId,
      repoId,
      userId,
    });
    await ctx.db.insert("taskSandboxEvents", {
      taskId,
      event: "started",
      createdAt: now,
    });
    return {
      userId,
      aveSessionId,
      watchedSessionId,
      taskId,
      projectId,
      settingsId,
      canonicalUsageId,
      jobId,
      at: now + 60_000,
    };
  });
  return { t, ...ids };
}

async function runMigration(t: ReturnType<typeof convexTest>): Promise<void> {
  await t.mutation(internal._migrations.clearLegacyFields.clearLegacyFields, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

test(
  "clears every legacy field and row, keeps old behaviour, reruns as a no-op",
  async () => {
    vi.useFakeTimers();
    const f = await fixture();
    await runMigration(f.t);

    const read = () =>
      f.t.run(async (ctx) => ({
        user: await ctx.db.get(f.userId),
        aveSession: await ctx.db.get(f.aveSessionId),
        watchedSession: await ctx.db.get(f.watchedSessionId),
        task: await ctx.db.get(f.taskId),
        project: await ctx.db.get(f.projectId),
        settings: await ctx.db.get(f.settingsId),
        queued: await ctx.db.query("queuedMessages").collect(),
        usage: await ctx.db.query("agentUsageLimits").collect(),
        daemonStates: await ctx.db.query("sessionDaemonStates").collect(),
        sandboxEvents: await ctx.db.query("taskSandboxEvents").collect(),
      }));

    const after = await read();
    expect(after.user?.orchestratorSessionId).toBeUndefined();
    expect(after.aveSession?.archive).toBeDefined();
    expect(after.aveSession?.isOrchestrator).toBeUndefined();
    expect(after.queued).toEqual([]);
    expect(after.watchedSession?.watchedByOrchestrator).toBeUndefined();
    expect(after.task?.watchedByOrchestrator).toBeUndefined();
    expect(after.task?.run).toEqual({
      state: "scheduled",
      at: f.at,
      jobId: f.jobId,
    });
    expect(after.project?.watchedByOrchestrator).toBeUndefined();
    expect(after.settings).toMatchObject({
      sandboxIdlePauseMode: "off",
      sandboxIdleAfterInteractionMinutes: 120,
    });
    expect(after.settings?.sandboxIdleStopEnabled).toBeUndefined();
    expect(after.settings?.sandboxIdleStopMinutes).toBeUndefined();
    expect(after.usage.map((row) => row._id)).toEqual([f.canonicalUsageId]);
    expect(after.daemonStates).toEqual([]);
    expect(after.sandboxEvents).toEqual([]);

    await runMigration(f.t);
    expect(await read()).toEqual(after);
  },
  TIMEOUT_MS,
);

test(
  "new idle settings win over the old ones",
  async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const settingsId = await t.run((ctx) =>
      ctx.db.insert("appSettings", {
        sandboxAutoStopEnabled: false,
        sandboxAutoStopTime: "22:00",
        sandboxAutoStopTimeZone: "UTC",
        sandboxIdlePauseMode: "on",
        sandboxIdleAfterInteractionMinutes: 20,
        sandboxIdleStopEnabled: false,
        sandboxIdleStopMinutes: 120,
      }),
    );
    await runMigration(t);
    const settings = await t.run((ctx) => ctx.db.get(settingsId));
    expect(settings).toMatchObject({
      sandboxIdlePauseMode: "on",
      sandboxIdleAfterInteractionMinutes: 20,
    });
    expect(settings?.sandboxIdleStopEnabled).toBeUndefined();
  },
  TIMEOUT_MS,
);
