import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

/**
 * Fix #868: a quick task moved back to `todo` after it already ran keeps its
 * branch, so it previews like a reviewed task instead of offering "Run Eva"
 * again. The UI now shows the sandbox toggle for that case; if the backend gate
 * (`isPreviewSandboxAllowed`) drifts back to status-only, that toggle throws
 * on every click. The gate must also stay narrow: a `todo` task that never ran
 * has no branch to preview, and `in_progress` belongs to the running agent.
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|task-preview-gate";

async function fixture(task: {
  status: Doc<"agentTasks">["status"];
  hasRun: boolean;
  sandboxActive: boolean;
}) {
  const t = convexTest(schema, modules);
  const taskId = await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "task-preview-gate",
      installationId: 1,
      connectedBy: userId,
    });
    const id = await ctx.db.insert("agentTasks", {
      repoId,
      title: "Gate under test",
      status: task.status,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      ...(task.sandboxActive
        ? { sandboxId: "sbx_live", reviewTaskSandboxStatus: "active" as const }
        : {}),
    });
    // A run on a different task must never unlock this one.
    const otherTaskId = await ctx.db.insert("agentTasks", {
      repoId,
      title: "Someone else's run",
      status: "done",
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    });
    await ctx.db.insert("agentRuns", {
      taskId: task.hasRun ? id : otherTaskId,
      status: "success",
      logs: [],
    });
    return id;
  });
  return { t, taskId, asUser: t.withIdentity({ subject: CLERK_ID }) };
}

/** Keeps the zero-delay provider actions the mutations schedule from firing. */
async function withoutRunningScheduledWork<T>(
  body: () => Promise<T>,
): Promise<T> {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    return await body();
  } finally {
    vi.useRealTimers();
  }
}

describe("preview sandbox gate for quick tasks", () => {
  test(
    "a todo task that already ran can rerun its preview dev server",
    async () => {
      const f = await fixture({
        status: "todo",
        hasRun: true,
        sandboxActive: true,
      });
      await withoutRunningScheduledWork(() =>
        f.asUser.mutation(api.agentTasks.runDevServer, { taskId: f.taskId }),
      );
    },
    TIMEOUT_MS,
  );

  test(
    "a todo task that never ran cannot start a preview sandbox",
    async () => {
      const f = await fixture({
        status: "todo",
        hasRun: false,
        sandboxActive: false,
      });
      await expect(
        f.asUser.mutation(api.agentTasks.startTaskSandbox, {
          taskId: f.taskId,
        }),
      ).rejects.toThrow("or have run before");
      const after = await f.t.run((ctx) => ctx.db.get(f.taskId));
      expect(after?.reviewTaskSandboxStatus).toBeUndefined();
    },
    TIMEOUT_MS,
  );

  test(
    "a todo task that never ran cannot rerun the dev server, even with a live sandbox",
    async () => {
      const f = await fixture({
        status: "todo",
        hasRun: false,
        sandboxActive: true,
      });
      await expect(
        f.asUser.mutation(api.agentTasks.runDevServer, { taskId: f.taskId }),
      ).rejects.toThrow("or have run before");
    },
    TIMEOUT_MS,
  );

  test(
    "having run does not open the gate outside todo",
    async () => {
      const f = await fixture({
        status: "in_progress",
        hasRun: true,
        sandboxActive: true,
      });
      await expect(
        f.asUser.mutation(api.agentTasks.runDevServer, { taskId: f.taskId }),
      ).rejects.toThrow("Current status: in_progress");
    },
    TIMEOUT_MS,
  );
});
