import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import {
  IDLE_STOP_DEFAULT_MINUTES,
  idleStopAlertText,
  idleStopDecision,
  isValidIdleStopMinutes,
  resolveIdleStopSettings,
} from "../convex/_sandbox/idleStop";

/**
 * The idle sweep is the only thing standing between a forgotten sandbox and a
 * full day of provisioned-memory billing, so both failure modes matter: a
 * sandbox stopped under someone mid-turn, and a sandbox never stopped at all.
 * The pure rules are pinned directly; the Convex mutations are exercised end to
 * end so the status flip the UI watches is what actually gets written.
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;

const HOUR_MS = 3_600_000;
const SANDBOX = "sbx-idle";

// A stop schedules the provider finalize action at zero delay. Faking
// setTimeout keeps convex-test from running it after the test's transaction
// has closed; the tests assert the "stopping" write the mutation itself makes.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("idleStopDecision", () => {
  const idleMs = 60 * 60_000;

  test("stops once the last activity is older than the threshold", () => {
    const now = 10 * HOUR_MS;
    expect(
      idleStopDecision({ now, lastActivityAt: now - idleMs, busy: false, idleMs }),
    ).toEqual({ stop: true, idleForMs: idleMs });
  });

  test("keeps a sandbox with recent activity", () => {
    const now = 10 * HOUR_MS;
    expect(
      idleStopDecision({
        now,
        lastActivityAt: now - idleMs + 1,
        busy: false,
        idleMs,
      }).stop,
    ).toBe(false);
  });

  test("never stops a busy sandbox, however stale its last message", () => {
    const now = 10 * HOUR_MS;
    expect(
      idleStopDecision({ now, lastActivityAt: 0, busy: true, idleMs }),
    ).toEqual({ stop: false, idleForMs: 0 });
  });

  test("treats a clock skewed into the future as not idle", () => {
    expect(
      idleStopDecision({ now: 5, lastActivityAt: 10, busy: false, idleMs }),
    ).toEqual({ stop: false, idleForMs: 0 });
  });
});

describe("resolveIdleStopSettings", () => {
  test("a row from before the feature means on at the default", () => {
    expect(resolveIdleStopSettings(null)).toEqual({
      enabled: true,
      minutes: IDLE_STOP_DEFAULT_MINUTES,
    });
    expect(resolveIdleStopSettings({})).toEqual({
      enabled: true,
      minutes: IDLE_STOP_DEFAULT_MINUTES,
    });
  });

  test("saved values win", () => {
    expect(
      resolveIdleStopSettings({
        sandboxIdleStopEnabled: false,
        sandboxIdleStopMinutes: 120,
      }),
    ).toEqual({ enabled: false, minutes: 120 });
  });

  test("an out-of-range stored threshold falls back to the default", () => {
    expect(resolveIdleStopSettings({ sandboxIdleStopMinutes: 1 }).minutes).toBe(
      IDLE_STOP_DEFAULT_MINUTES,
    );
  });

  test.each([
    [5, true],
    [60, true],
    [1440, true],
    [4, false],
    [1441, false],
    [30.5, false],
  ])("isValidIdleStopMinutes(%s) is %s", (minutes, valid) => {
    expect(isValidIdleStopMinutes(minutes)).toBe(valid);
  });
});

describe("idleStopAlertText", () => {
  test("reads in hours when the threshold is a whole number of hours", () => {
    expect(idleStopAlertText(60)).toContain("after 1 hour without activity");
    expect(idleStopAlertText(120)).toContain("after 2 hours without activity");
  });

  test("reads in minutes otherwise", () => {
    expect(idleStopAlertText(30)).toContain("after 30 minutes without activity");
  });
});

async function fixture() {
  const t = convexTest(schema, modules);
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
      title: "Left open overnight",
      status: "active",
      sandboxId: SANDBOX,
      updatedAt: now - 3 * HOUR_MS,
    });
    const taskId = await ctx.db.insert("agentTasks", {
      title: "Reviewed and forgotten",
      status: "business_review",
      repoId,
      sandboxId: SANDBOX,
      reviewTaskSandboxStatus: "active",
      createdAt: now - 3 * HOUR_MS,
      updatedAt: now - 3 * HOUR_MS,
      createdBy: userId,
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId,
      title: "Billing revamp",
      phase: "in_progress",
      rawInput: "revamp billing",
      sandboxId: SANDBOX,
      reviewProjectSandboxStatus: "active",
      updatedAt: now - 3 * HOUR_MS,
    });
    return { userId, repoId, sessionId, taskId, projectId };
  });
  return { t, ...ids };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function addMessage(
  f: Fixture,
  parentId: Id<"sessions"> | Id<"agentTasks"> | Id<"projects">,
  ageMs: number,
) {
  await f.t.run((ctx) =>
    ctx.db.insert("messages", {
      parentId,
      role: "assistant",
      content: "Sandbox started",
      timestamp: Date.now() - ageMs,
      isSystemAlert: true,
    }),
  );
}

async function alerts(f: Fixture, parentId: Id<"sessions">) {
  return f.t.run(async (ctx) => {
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", parentId))
      .collect();
    return rows.map((row) => row.content);
  });
}

describe("stopIdleSession", () => {
  test(
    "an hour-old last message flips the session to stopping and says why",
    async () => {
      const f = await fixture();
      await addMessage(f, f.sessionId, 2 * HOUR_MS);

      const stopped = await f.t.mutation(
        internal.sandboxIdleStop.stopIdleSession,
        { sessionId: f.sessionId, idleMinutes: 60 },
      );

      expect(stopped).toBe(true);
      const session = await f.t.run((ctx) => ctx.db.get(f.sessionId));
      // "stopping" is the same intermediate state the Stop button writes; the
      // finalize action moves it to "closed" once Vercel confirms.
      expect(session?.status).toBe("stopping");
      // The paused filesystem must stay resumable.
      expect(session?.sandboxId).toBe(SANDBOX);
      expect(await alerts(f, f.sessionId)).toContain(idleStopAlertText(60));
    },
    TIMEOUT_MS,
  );

  test(
    "a recent message keeps it up",
    async () => {
      const f = await fixture();
      await addMessage(f, f.sessionId, 10 * 60_000);

      const stopped = await f.t.mutation(
        internal.sandboxIdleStop.stopIdleSession,
        { sessionId: f.sessionId, idleMinutes: 60 },
      );

      expect(stopped).toBe(false);
      const session = await f.t.run((ctx) => ctx.db.get(f.sessionId));
      expect(session?.status).toBe("active");
    },
    TIMEOUT_MS,
  );

  test(
    "a running turn is never interrupted",
    async () => {
      const f = await fixture();
      await addMessage(f, f.sessionId, 5 * HOUR_MS);
      await f.t.run((ctx) =>
        ctx.db.patch(f.sessionId, { activeWorkflowId: "wf-live" }),
      );

      const stopped = await f.t.mutation(
        internal.sandboxIdleStop.stopIdleSession,
        { sessionId: f.sessionId, idleMinutes: 60 },
      );

      expect(stopped).toBe(false);
    },
    TIMEOUT_MS,
  );

  test(
    "a queued follow-up counts as work about to start",
    async () => {
      const f = await fixture();
      await addMessage(f, f.sessionId, 5 * HOUR_MS);
      await f.t.run((ctx) =>
        ctx.db.insert("queuedMessages", {
          parentId: f.sessionId,
          userId: f.userId,
          content: "and then fix the tests",
          createdAt: Date.now(),
          order: Date.now(),
        }),
      );

      const stopped = await f.t.mutation(
        internal.sandboxIdleStop.stopIdleSession,
        { sessionId: f.sessionId, idleMinutes: 60 },
      );

      expect(stopped).toBe(false);
    },
    TIMEOUT_MS,
  );

  test(
    "with no messages at all the entity's own timestamp is the baseline",
    async () => {
      const f = await fixture();

      const stopped = await f.t.mutation(
        internal.sandboxIdleStop.stopIdleSession,
        { sessionId: f.sessionId, idleMinutes: 60 },
      );

      expect(stopped).toBe(true);
    },
    TIMEOUT_MS,
  );

  test(
    "a session already closed is left alone",
    async () => {
      const f = await fixture();
      await f.t.run((ctx) => ctx.db.patch(f.sessionId, { status: "closed" }));

      const stopped = await f.t.mutation(
        internal.sandboxIdleStop.stopIdleSession,
        { sessionId: f.sessionId, idleMinutes: 60 },
      );

      expect(stopped).toBe(false);
      expect(await alerts(f, f.sessionId)).toEqual([]);
    },
    TIMEOUT_MS,
  );
});

describe("stopIdleTask", () => {
  test(
    "stops an idle review sandbox through the task stop path",
    async () => {
      const f = await fixture();
      await addMessage(f, f.taskId, 2 * HOUR_MS);

      const stopped = await f.t.mutation(internal.sandboxIdleStop.stopIdleTask, {
        taskId: f.taskId,
        idleMinutes: 60,
      });

      expect(stopped).toBe(true);
      const task = await f.t.run((ctx) => ctx.db.get(f.taskId));
      expect(task?.reviewTaskSandboxStatus).toBe("stopping");
      expect(task?.sandboxId).toBe(SANDBOX);
    },
    TIMEOUT_MS,
  );

  test(
    "a task mid-run keeps its sandbox",
    async () => {
      const f = await fixture();
      await addMessage(f, f.taskId, 5 * HOUR_MS);
      await f.t.run((ctx) =>
        ctx.db.patch(f.taskId, { status: "in_progress" }),
      );

      const stopped = await f.t.mutation(internal.sandboxIdleStop.stopIdleTask, {
        taskId: f.taskId,
        idleMinutes: 60,
      });

      expect(stopped).toBe(false);
    },
    TIMEOUT_MS,
  );
});

describe("stopIdleProject", () => {
  test(
    "stops an idle project sandbox",
    async () => {
      const f = await fixture();
      await addMessage(f, f.projectId, 2 * HOUR_MS);

      const stopped = await f.t.mutation(
        internal.sandboxIdleStop.stopIdleProject,
        { projectId: f.projectId, idleMinutes: 60 },
      );

      expect(stopped).toBe(true);
      const project = await f.t.run((ctx) => ctx.db.get(f.projectId));
      expect(project?.reviewProjectSandboxStatus).toBe("stopping");
    },
    TIMEOUT_MS,
  );

  test(
    "a project build in flight keeps the shared sandbox",
    async () => {
      const f = await fixture();
      await addMessage(f, f.projectId, 5 * HOUR_MS);
      await f.t.run((ctx) =>
        ctx.db.patch(f.projectId, { activeBuildWorkflowId: "wf-build" }),
      );

      const stopped = await f.t.mutation(
        internal.sandboxIdleStop.stopIdleProject,
        { projectId: f.projectId, idleMinutes: 60 },
      );

      expect(stopped).toBe(false);
    },
    TIMEOUT_MS,
  );
});

describe("the sweep", () => {
  test(
    "does nothing while the setting is off",
    async () => {
      const f = await fixture();
      await addMessage(f, f.sessionId, 5 * HOUR_MS);
      await f.t.run((ctx) =>
        ctx.db.insert("appSettings", {
          sandboxAutoStopEnabled: false,
          sandboxAutoStopTime: "22:00",
          sandboxAutoStopTimeZone: "UTC",
          sandboxIdleStopEnabled: false,
        }),
      );

      await f.t.action(internal.sandboxIdleStop.run, {});

      const session = await f.t.run((ctx) => ctx.db.get(f.sessionId));
      expect(session?.status).toBe("active");
    },
    TIMEOUT_MS,
  );

  test(
    "is on by default and reaps every idle surface",
    async () => {
      const f = await fixture();
      await addMessage(f, f.sessionId, 5 * HOUR_MS);
      await addMessage(f, f.taskId, 5 * HOUR_MS);
      await addMessage(f, f.projectId, 5 * HOUR_MS);

      await f.t.action(internal.sandboxIdleStop.run, {});

      const [session, task, project] = await f.t.run((ctx) =>
        Promise.all([
          ctx.db.get(f.sessionId),
          ctx.db.get(f.taskId),
          ctx.db.get(f.projectId),
        ]),
      );
      expect(session?.status).toBe("stopping");
      expect(task?.reviewTaskSandboxStatus).toBe("stopping");
      expect(project?.reviewProjectSandboxStatus).toBe("stopping");
    },
    TIMEOUT_MS,
  );
});
