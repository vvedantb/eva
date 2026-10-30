import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * The stranded-queue fixes for the session and project surfaces.
 * `chatQueueStuckCases` covers the task surface only, but each surface has its
 * own `mark*Closed` and ready mutation, so one can regress alone.
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;

const MINUTE_MS = 60 * 1000;

async function fixture(options: { orphanAgentAgeMs?: number } = {}) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: "clerk|runner" });
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
      title: "Stopping session",
      status: "stopping",
      sandboxId: "sbx-session",
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId,
      title: "Stopping project",
      phase: "in_progress",
      rawInput: "build it",
      updatedAt: now,
      sandboxId: "sbx-project",
      reviewProjectSandboxStatus: "stopping",
      ...(options.orphanAgentAgeMs !== undefined
        ? {
            backgroundAgents: [
              {
                toolUseId: "toolu_orphan",
                description: "explore the repo",
                status: "running",
                startedAt: now - options.orphanAgentAgeMs,
              },
            ],
          }
        : {}),
    });
    return { sessionId, projectId };
  });
  return { t, ...ids };
}

type TestConvex = Awaited<ReturnType<typeof fixture>>["t"];

function scheduledDrains(t: TestConvex) {
  return t.run(async (ctx) => {
    const rows = await ctx.db.system.query("_scheduled_functions").collect();
    return rows.filter((row) => row.name.includes("drainQueueQuietly"));
  });
}

describe("a stop that settles re-offers the queue", () => {
  // Keeps scheduled drains from firing after the test finishes.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test.each([
    ["closed", undefined],
    ["failed", "provider timeout"],
  ])(
    "session stop %s schedules a drain",
    async (_label, error) => {
      const { t, sessionId } = await fixture();

      await t.mutation(internal._sessions.sandbox.markSandboxClosed, {
        sessionId,
        error,
      });

      const drains = await scheduledDrains(t);
      expect(drains.map((row) => row.args[0])).toEqual([
        { parentId: sessionId },
      ]);
    },
    TIMEOUT_MS,
  );

  test.each([
    ["closed", undefined],
    ["failed", "provider timeout"],
  ])(
    "project stop %s schedules a drain",
    async (_label, error) => {
      const { t, projectId } = await fixture();

      await t.mutation(internal._projects.sandbox.markProjectSandboxClosed, {
        projectId,
        error,
      });

      const drains = await scheduledDrains(t);
      expect(drains.map((row) => row.args[0])).toEqual([
        { parentId: projectId },
      ]);
    },
    TIMEOUT_MS,
  );
});

describe("a project wake settles subagents the old VM never reported", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test(
    "projectSandboxReady marks the orphaned subagent stale",
    async () => {
      const { t, projectId } = await fixture({
        orphanAgentAgeMs: 10 * MINUTE_MS,
      });
      await t.run((ctx) =>
        ctx.db.patch(projectId, { reviewProjectSandboxStatus: "starting" }),
      );

      await t.mutation(internal._projects.sandbox.projectSandboxReady, {
        projectId,
        sandboxId: "sbx-project",
        isNew: false,
      });

      const project = await t.run((ctx) => ctx.db.get(projectId));
      expect(project?.backgroundAgents?.[0]?.status).toBe("stale");
      expect(await scheduledDrains(t)).toHaveLength(1);
    },
    TIMEOUT_MS,
  );
});
