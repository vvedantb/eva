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
      owner: { kind: "standalone" },
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
      createdAt: now - 3 * HOUR,
      updatedAt: now - 3 * HOUR,
      createdBy: userId,
    });
    // A quick task's sandbox is its owned session's.
    const taskSessionId = await ctx.db.insert("sessions", {
      owner: { kind: "task", taskId },
      repoId,
      userId,
      title: "Idle task",
      status: "active",
      sandboxId: "sbx-task",
      updatedAt: now - 3 * HOUR,
    });
    return { userId, repoId, sessionId, taskId, taskSessionId };
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
      const { t, sessionId, taskSessionId } = await fixture();
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
        kind: "session",
        entityId: String(taskSessionId),
        source: "chat",
      });
      await t.action(internal.sandboxIdlePause.run, {});
      expect(await sessionStatus(t, sessionId)).toBe("stopping");
      expect(await sessionStatus(t, taskSessionId)).toBe("active");
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
      const { t, sessionId, taskSessionId } = await fixture();
      await setMode(t, "dry-run");
      await t.action(internal.sandboxIdlePause.run, {});
      expect(await sessionStatus(t, sessionId)).toBe("active");
      expect(await sessionStatus(t, taskSessionId)).toBe("active");
    },
    TIMEOUT_MS,
  );

  test(
    "on: an hours-idle session and task are moved to stopping with their sandbox ids kept",
    async () => {
      const { t, sessionId, taskSessionId } = await fixture();
      await setMode(t, "on");
      await t.action(internal.sandboxIdlePause.run, {});
      expect(await sessionStatus(t, sessionId)).toBe("stopping");
      expect(await sessionStatus(t, taskSessionId)).toBe("stopping");
      const taskSession = await t.run((ctx) => ctx.db.get(taskSessionId));
      expect(taskSession?.sandboxId).toBe("sbx-task");
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
      const { t, taskSessionId } = await fixture();
      await setMode(t, "on");
      const paused = await t.mutation(internal.sandboxIdlePause.pause, {
        kind: "session",
        entityId: String(taskSessionId),
        idleMinutes: 42,
      });
      expect(paused).toBe(true);
      await t.mutation(internal._sessions.sandbox.markSandboxClosed, {
        sessionId: taskSessionId,
        stopReason: { kind: "idle", idleMinutes: 42 },
      });
      expect(await sessionStatus(t, taskSessionId)).toBe("closed");
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
      const { t, taskSessionId } = await fixture();
      await t.run(async (ctx) => {
        await ctx.db.patch(taskSessionId, { status: "stopping" });
      });
      await t.mutation(internal._sessions.sandbox.markSandboxClosed, {
        sessionId: taskSessionId,
      });
      const alerts = await t.run(async (ctx) =>
        (await ctx.db.query("messages").collect()).map((m) => m.content),
      );
      expect(alerts).toContain("Sandbox stopped");
    },
    TIMEOUT_MS,
  );
});

/**
 * A background exec after Stop resumes the VM (Vercel SDK `withResume`) while
 * the owner row stays `closed`. The leak sweep must flag exactly those VMs and
 * never one Eva still wants or does not own.
 */
describe("sandbox owner state (leak sweep)", () => {
  test(
    "closed and idle is a leak; active, stopping, busy and unowned are not",
    async () => {
      const { t, sessionId, taskId, taskSessionId, repoId } = await fixture();
      const state = (sandboxId: string) =>
        t.query(internal.sandboxIdlePause.getSandboxOwnerState, { sandboxId });

      expect(await state("sbx-session")).toBe("wanted");
      expect(await state("sbx-unknown")).toBe("unknown");

      await t.run(async (ctx) => {
        await ctx.db.patch(sessionId, { status: "stopping" });
        // A quick-task run's open turn holds its session's VM.
        await ctx.db.patch(taskSessionId, { status: "closed" });
        await ctx.db.insert("turns", {
          entityId: await ctx.db.insert("agentRuns", {
            taskId,
            status: "running",
            logs: [],
          }),
          sessionId: taskSessionId,
          streamingEntityId: "task-run",
          state: "running",
          open: true,
          turnStartedAt: Date.now(),
          leaseExpiresAt: Date.now() + 60_000,
          leaseGeneration: 1,
          model: "claude:sonnet",
          repoId,
        });
      });
      expect(await state("sbx-session")).toBe("stopping");
      expect(await state("sbx-task")).toBe("wanted");

      await t.run(async (ctx) => {
        await ctx.db.patch(sessionId, { status: "closed" });
        for (const turn of await ctx.db.query("turns").collect()) {
          await ctx.db.patch(turn._id, { open: false, state: "done" });
        }
      });
      const leaked = await t.query(
        internal.sandboxIdlePause.listLeakedSandboxes,
        { sandboxIds: ["sbx-session", "sbx-task", "sbx-unknown"] },
      );
      expect(leaked).toEqual([
        { sandboxId: "sbx-session", repoId },
        { sandboxId: "sbx-task", repoId },
      ]);
    },
    TIMEOUT_MS,
  );

  test(
    "a shared VM is a leak only once every owner is closed",
    async () => {
      const { t, sessionId, taskSessionId } = await fixture();
      const leaked = () =>
        t.query(internal.sandboxIdlePause.listLeakedSandboxes, {
          sandboxIds: ["sbx-session"],
        });

      // A closed session and an active quick task share one VM: the sweep
      // must not stop the VM the task still uses.
      await t.run(async (ctx) => {
        await ctx.db.patch(sessionId, { status: "closed" });
        await ctx.db.patch(taskSessionId, { sandboxId: "sbx-session" });
      });
      expect(
        await t.query(internal.sandboxIdlePause.getSandboxOwnerState, {
          sandboxId: "sbx-session",
        }),
      ).toBe("wanted");
      expect(await leaked()).toEqual([]);

      await t.run(async (ctx) => {
        await ctx.db.patch(taskSessionId, { status: "closed" });
      });
      expect((await leaked()).map((row) => row.sandboxId)).toEqual([
        "sbx-session",
      ]);
    },
    TIMEOUT_MS,
  );
});
