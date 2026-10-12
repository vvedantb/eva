import { convexTest } from "convex-test";
import presenceTest from "@convex-dev/presence/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { sandboxPausedAlertText } from "@eva/shared";

/**
 * The idle-pause sweep must be a strict no-op while the setting is off (every
 * existing deployment), log-only in dry-run, and when on must only ever stop a
 * sandbox that is active, idle past both graces, not busy and not being looked
 * at. Each guard is pinned here with real Convex rows.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const HOUR = 60 * 60 * 1000;

async function fixture() {
  const t = convexTest(schema, modules);
  presenceTest.register(t);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: "clerk|idle" });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const now = Date.now();
    const sessionId = await ctx.db.insert("sessions", {
      repoId,
      userId,
      title: "Idle session",
      status: "active",
      sandboxId: "sbx-session",
      // Pre-feature session: no activity row, old updatedAt is the fallback.
      updatedAt: now - 3 * HOUR,
    });
    const taskId = await ctx.db.insert("agentTasks", {
      repoId,
      title: "Idle task",
      status: "code_review",
      sandboxId: "sbx-task",
      reviewTaskSandboxStatus: "active",
      createdAt: now - 3 * HOUR,
      updatedAt: now - 3 * HOUR,
      createdBy: userId,
    });
    return { userId, repoId, sessionId, taskId };
  });
  return { t, ...ids };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function setMode(
  t: Fixture["t"],
  mode: "off" | "dry-run" | "on",
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("appSettings", {
      sandboxAutoStopEnabled: false,
      sandboxAutoStopTime: "22:00",
      sandboxAutoStopTimeZone: "UTC",
      sandboxIdlePauseMode: mode,
      sandboxIdleAfterAgentMinutes: 5,
      sandboxIdleAfterInteractionMinutes: 20,
    });
  });
}

function sessionStatus(t: Fixture["t"], id: Id<"sessions">) {
  return t.run(async (ctx) => (await ctx.db.get(id))?.status);
}

function taskStatus(t: Fixture["t"], id: Id<"agentTasks">) {
  return t.run(async (ctx) => (await ctx.db.get(id))?.reviewTaskSandboxStatus);
}

describe("idle pause sweep", () => {
  // The stop helpers schedule zero-delay provider actions (finalize + stuck
  // recovery). Faking setTimeout keeps them from firing after a test ends.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test(
    "no settings row means on at 60 min: hours-idle sandboxes pause, a fresh one does not",
    async () => {
      const { t, sessionId, taskId } = await fixture();
      const settings = await t.query(
        internal.sandboxIdlePause.getSettingsInternal,
        {},
      );
      expect(settings).toEqual({
        mode: "on",
        afterAgentMs: 5 * 60_000,
        afterInteractionMs: 60 * 60_000,
      });
      await t.mutation(internal._sandbox.activity.touchUser, {
        kind: "task",
        entityId: String(taskId),
        source: "chat",
      });
      await t.action(internal.sandboxIdlePause.run, {});
      expect(await sessionStatus(t, sessionId)).toBe("stopping");
      expect(await taskStatus(t, taskId)).toBe("active");
    },
    TIMEOUT_MS,
  );

  test(
    "the earlier idle-stop toggle still switches the sweep off",
    async () => {
      const { t, sessionId } = await fixture();
      await t.run(async (ctx) => {
        await ctx.db.insert("appSettings", {
          sandboxAutoStopEnabled: false,
          sandboxAutoStopTime: "22:00",
          sandboxAutoStopTimeZone: "UTC",
          sandboxIdleStopEnabled: false,
        });
      });
      await t.action(internal.sandboxIdlePause.run, {});
      expect(await sessionStatus(t, sessionId)).toBe("active");
    },
    TIMEOUT_MS,
  );

  test(
    "dry-run decides but never stops",
    async () => {
      const { t, sessionId, taskId } = await fixture();
      await setMode(t, "dry-run");
      await t.action(internal.sandboxIdlePause.run, {});
      expect(await sessionStatus(t, sessionId)).toBe("active");
      expect(await taskStatus(t, taskId)).toBe("active");
    },
    TIMEOUT_MS,
  );

  test(
    "on: an hours-idle session and task are moved to stopping with their sandbox ids kept",
    async () => {
      const { t, sessionId, taskId } = await fixture();
      await setMode(t, "on");
      await t.action(internal.sandboxIdlePause.run, {});
      expect(await sessionStatus(t, sessionId)).toBe("stopping");
      expect(await taskStatus(t, taskId)).toBe("stopping");
      const task = await t.run((ctx) => ctx.db.get(taskId));
      expect(task?.sandboxId).toBe("sbx-task");
    },
    TIMEOUT_MS,
  );

  test(
    "a recent interaction holds the sandbox even when the agent finished long ago",
    async () => {
      const { t, sessionId } = await fixture();
      await setMode(t, "on");
      await t.mutation(internal._sandbox.activity.touchUser, {
        kind: "session",
        entityId: String(sessionId),
        source: "chat",
      });
      await t.action(internal.sandboxIdlePause.run, {});
      expect(await sessionStatus(t, sessionId)).toBe("active");
    },
    TIMEOUT_MS,
  );

  test(
    "an open turn makes a session busy, however idle its timestamps look",
    async () => {
      const { t, sessionId, repoId } = await fixture();
      await setMode(t, "on");
      await t.run(async (ctx) => {
        await ctx.db.insert("turns", {
          entityId: sessionId,
          streamingEntityId: String(sessionId),
          state: "running",
          open: true,
          turnStartedAt: Date.now(),
          leaseExpiresAt: Date.now() + 60_000,
          leaseGeneration: 1,
          model: "claude:sonnet",
          repoId,
        });
      });
      const candidate = await t.query(
        internal.sandboxIdlePause.inspectCandidate,
        { kind: "session", entityId: String(sessionId) },
      );
      expect(candidate?.busy).toBe(true);
      await t.action(internal.sandboxIdlePause.run, {});
      expect(await sessionStatus(t, sessionId)).toBe("active");
    },
    TIMEOUT_MS,
  );

  test(
    "a fresh streaming row makes a session busy",
    async () => {
      const { t, sessionId } = await fixture();
      await setMode(t, "on");
      await t.run(async (ctx) => {
        await ctx.db.insert("streamingActivity", {
          entityId: String(sessionId),
          currentActivity: "[]",
        });
      });
      const candidate = await t.query(
        internal.sandboxIdlePause.inspectCandidate,
        { kind: "session", entityId: String(sessionId) },
      );
      expect(candidate?.busy).toBe(true);
      await t.action(internal.sandboxIdlePause.run, {});
      expect(await sessionStatus(t, sessionId)).toBe("active");
    },
    TIMEOUT_MS,
  );

  test(
    "a queued run makes a task busy",
    async () => {
      const { t, taskId } = await fixture();
      await setMode(t, "on");
      await t.run(async (ctx) => {
        await ctx.db.insert("agentRuns", {
          taskId,
          status: "queued",
          logs: [],
        });
      });
      await t.action(internal.sandboxIdlePause.run, {});
      expect(await taskStatus(t, taskId)).toBe("active");
    },
    TIMEOUT_MS,
  );

  test(
    "the pause mutation re-checks busy state and refuses when a turn appeared",
    async () => {
      const { t, sessionId, repoId } = await fixture();
      await setMode(t, "on");
      await t.run(async (ctx) => {
        await ctx.db.insert("turns", {
          entityId: sessionId,
          streamingEntityId: String(sessionId),
          state: "running",
          open: true,
          turnStartedAt: Date.now(),
          leaseExpiresAt: Date.now() + 60_000,
          leaseGeneration: 1,
          model: "claude:sonnet",
          repoId,
        });
      });
      const paused = await t.mutation(internal.sandboxIdlePause.pause, {
        kind: "session",
        entityId: String(sessionId),
        idleMinutes: 120,
      });
      expect(paused).toBe(false);
      expect(await sessionStatus(t, sessionId)).toBe("active");
    },
    TIMEOUT_MS,
  );

  test(
    "a paused stop settles with the idle divider, not the generic one",
    async () => {
      const { t, taskId } = await fixture();
      await setMode(t, "on");
      const paused = await t.mutation(internal.sandboxIdlePause.pause, {
        kind: "task",
        entityId: String(taskId),
        idleMinutes: 42,
      });
      expect(paused).toBe(true);
      await t.mutation(internal._agentTasks.sandbox.markTaskSandboxClosed, {
        taskId,
        stopReason: { kind: "idle", idleMinutes: 42 },
      });
      expect(await taskStatus(t, taskId)).toBe("closed");
      const alerts = await t.run(async (ctx) =>
        (await ctx.db.query("messages").collect()).map((m) => m.content),
      );
      expect(alerts).toContain(sandboxPausedAlertText(42));
    },
    TIMEOUT_MS,
  );

  test(
    "a manual stop still settles with the plain divider",
    async () => {
      const { t, taskId } = await fixture();
      await t.run(async (ctx) => {
        await ctx.db.patch(taskId, { reviewTaskSandboxStatus: "stopping" });
      });
      await t.mutation(internal._agentTasks.sandbox.markTaskSandboxClosed, {
        taskId,
      });
      const alerts = await t.run(async (ctx) =>
        (await ctx.db.query("messages").collect()).map((m) => m.content),
      );
      expect(alerts).toContain("Sandbox stopped");
    },
    TIMEOUT_MS,
  );
});
