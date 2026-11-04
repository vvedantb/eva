import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { requestTaskSandboxStart } from "../convex/_agentTasks/sandbox";

/**
 * Tasks and projects each carry their own copy of the sandbox start fencing
 * that `lifecycleTransitionGuards.test.ts` checks for sessions. A late or
 * stale start result must not close, re-point or revive a sandbox that a
 * newer attempt or a stop now owns, and a VM nothing tracks is cleaned up.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;

type SandboxStatus = Doc<"agentTasks">["reviewTaskSandboxStatus"];

async function seed(status: SandboxStatus, sandboxStartAttempt?: number) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: "clerk|ada" });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const taskId = await ctx.db.insert("agentTasks", {
      title: "Fix the login bug",
      status: "business_review",
      numId: 1,
      repoId,
      createdAt: 0,
      updatedAt: 0,
      createdBy: userId,
      reviewTaskSandboxStatus: status,
      sandboxId: "sbx_1",
      sandboxStartAttempt,
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId,
      title: "Billing rewrite",
      rawInput: "rewrite billing",
      phase: "business_review",
      numId: 1,
      reviewProjectSandboxStatus: status,
      sandboxId: "sbx_1",
      sandboxStartAttempt,
    });
    return { taskId, projectId };
  });
  const scheduledNames = () =>
    t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).map(
        (job) => job.name,
      ),
    );
  return { t, ...ids, scheduledNames };
}

type Seeded = Awaited<ReturnType<typeof seed>>;
type ReadyArgs = { sandboxId: string; isNew: boolean; startAttempt?: number };

/** The same lifecycle, reached through each entity's own mutations. */
const ENTITIES = [
  {
    kind: "task",
    status: (s: Seeded) =>
      s.t.run(
        async (ctx) => (await ctx.db.get(s.taskId))?.reviewTaskSandboxStatus,
      ),
    sandboxId: (s: Seeded) =>
      s.t.run(async (ctx) => (await ctx.db.get(s.taskId))?.sandboxId),
    fail: (s: Seeded, startAttempt?: number) =>
      s.t.mutation(internal.agentTasks.taskSandboxError, {
        taskId: s.taskId,
        error: "boom",
        startAttempt,
      }),
    ready: (s: Seeded, args: ReadyArgs) =>
      s.t.mutation(internal.agentTasks.taskSandboxReady, {
        taskId: s.taskId,
        ...args,
      }),
  },
  {
    kind: "project",
    status: (s: Seeded) =>
      s.t.run(
        async (ctx) =>
          (await ctx.db.get(s.projectId))?.reviewProjectSandboxStatus,
      ),
    sandboxId: (s: Seeded) =>
      s.t.run(async (ctx) => (await ctx.db.get(s.projectId))?.sandboxId),
    fail: (s: Seeded, startAttempt?: number) =>
      s.t.mutation(internal.projects.projectSandboxError, {
        projectId: s.projectId,
        error: "boom",
        startAttempt,
      }),
    ready: (s: Seeded, args: ReadyArgs) =>
      s.t.mutation(internal.projects.projectSandboxReady, {
        projectId: s.projectId,
        ...args,
      }),
  },
];

describe.each(ENTITIES)("$kind sandbox start fencing", (entity) => {
  // Ready and failure writes schedule follow-up jobs; fake timers keep them
  // from running after the test's transaction has closed.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test(
    "a late start failure leaves active, stopping and closed sandboxes alone",
    async () => {
      const late: SandboxStatus[] = ["active", "stopping", "closed"];
      for (const status of late) {
        const s = await seed(status);
        await entity.fail(s);
        expect(await entity.status(s)).toBe(status);
      }
    },
    TIMEOUT_MS,
  );

  test(
    "the current attempt's failure closes a sandbox that is still starting",
    async () => {
      const s = await seed("starting", 2);
      await entity.fail(s, 2);
      expect(await entity.status(s)).toBe("closed");
    },
    TIMEOUT_MS,
  );

  test(
    "an older attempt cannot fail or ready a newer start, and its VM is deleted",
    async () => {
      const s = await seed("starting", 2);
      await entity.fail(s, 1);
      expect(await entity.status(s)).toBe("starting");

      await entity.ready(s, {
        sandboxId: "sbx_stale",
        isNew: true,
        startAttempt: 1,
      });
      expect(await entity.status(s)).toBe("starting");
      expect(await entity.sandboxId(s)).toBe("sbx_1");
      expect(await s.scheduledNames()).toContain("sandbox:deleteSandbox");
    },
    TIMEOUT_MS,
  );

  test(
    "a stale ready on the tracked VM leaves that VM running",
    async () => {
      const s = await seed("starting", 2);
      await entity.ready(s, {
        sandboxId: "sbx_1",
        isNew: false,
        startAttempt: 1,
      });
      const jobs = await s.scheduledNames();
      expect(jobs).not.toContain("sandbox:deleteSandbox");
      expect(jobs).not.toContain("sandbox:stopSandbox");
    },
    TIMEOUT_MS,
  );

  test(
    "a tokened start that lands after stop deletes its fresh VM and stays closed",
    async () => {
      const s = await seed("closed", 3);
      await entity.ready(s, {
        sandboxId: "sbx_fresh",
        isNew: true,
        startAttempt: 3,
      });
      expect(await entity.status(s)).toBe("closed");
      expect(await s.scheduledNames()).toContain("sandbox:deleteSandbox");
    },
    TIMEOUT_MS,
  );

  test(
    "an untokened prepare after stop keeps its VM for the caller",
    async () => {
      const s = await seed("closed", 3);
      await entity.ready(s, { sandboxId: "sbx_execute", isNew: true });
      expect(await s.scheduledNames()).not.toContain("sandbox:deleteSandbox");
    },
    TIMEOUT_MS,
  );
});

describe("task sandbox start request", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test(
    "does not override a stop in flight",
    async () => {
      const s = await seed("stopping", 4);
      const after = await s.t.run(async (ctx) => {
        const task = await ctx.db.get(s.taskId);
        const repo = task?.repoId ? await ctx.db.get(task.repoId) : null;
        if (task && repo) await requestTaskSandboxStart(ctx, task, repo);
        return ctx.db.get(s.taskId);
      });
      expect(after?.reviewTaskSandboxStatus).toBe("stopping");
      expect(after?.sandboxStartAttempt).toBe(4);
    },
    TIMEOUT_MS,
  );
});
