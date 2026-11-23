import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

/**
 * The plan's check for the project scheduler: a project with A, B (depends
 * on A) and C. Approve all: A and C start together, each on its own session.
 * B starts only after A's PR merges. A second call starts nothing.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|project-scheduler";

// Runs start workflows; keep their steps from running after the test.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
});

async function fixture() {
  const t = convexTest(schema, modules);
  workflow.register(t);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId,
      title: "Project",
      rawInput: "Project",
      phase: "business_review",
      numId: 1,
    });
    const insertTask = (title: string, taskNumber: number) =>
      ctx.db.insert("agentTasks", {
        repoId,
        projectId,
        title,
        taskNumber,
        status: "todo",
        numId: taskNumber,
        createdAt: 0,
        updatedAt: 0,
        createdBy: userId,
      });
    const a = await insertTask("A", 1);
    const b = await insertTask("B", 2);
    const c = await insertTask("C", 3);
    await ctx.db.insert("taskDependencies", { taskId: b, dependsOnId: a });
    return { userId, repoId, projectId, a, b, c };
  });
  return { t, asUser: t.withIdentity({ subject: CLERK_ID }), ...ids };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

const statuses = (f: Fixture) =>
  f.t.run(async (ctx) =>
    Promise.all(
      [f.a, f.b, f.c].map(async (id) => (await ctx.db.get(id))?.status),
    ),
  );

describe("project scheduler", () => {
  test(
    "starts independent tasks in parallel and a dependent only after its dependency merged",
    async () => {
      const f = await fixture();
      await f.asUser.mutation(api.buildWorkflow.approveProjectTasks, {
        projectId: f.projectId,
        taskIds: [f.a, f.b, f.c],
      });
      expect(await statuses(f)).toEqual(["in_progress", "todo", "in_progress"]);

      // Each started task runs on its own session, never the project's.
      const owners = await f.t.run(async (ctx) =>
        (await ctx.db.query("sessions").collect()).map((s) => s.owner),
      );
      expect(owners).toEqual(
        expect.arrayContaining([
          { kind: "task", taskId: f.a },
          { kind: "task", taskId: f.c },
        ]),
      );
      expect(owners).toHaveLength(2);

      // A is done but its PR is open: B waits, and a second call is a no-op.
      await finishTask(f, f.a, "open");
      await f.t.mutation(internal.buildWorkflow.scheduleReadyTasks, {
        projectId: f.projectId,
      });
      expect(await statuses(f)).toEqual(["done", "todo", "in_progress"]);

      // A's PR merged: B starts.
      await finishTask(f, f.a, "merged");
      await f.t.mutation(internal.buildWorkflow.scheduleReadyTasks, {
        projectId: f.projectId,
      });
      expect(await statuses(f)).toEqual(["done", "in_progress", "in_progress"]);
    },
    TIMEOUT_MS,
  );

  test(
    "refuses a batch whose dependencies make a cycle",
    async () => {
      const f = await fixture();
      await expect(
        f.asUser.mutation(api._agentTasks.mutations.createBatchWithDependencies, {
          repoId: f.repoId,
          tasks: [
            { title: "X", dependsOn: [1] },
            { title: "Y", dependsOn: [0] },
          ],
        }),
      ).rejects.toThrow("cycle");
    },
    TIMEOUT_MS,
  );
});

/** The run ended and the task sits done with its PR in `prState`. */
async function finishTask(
  f: Fixture,
  taskId: Id<"agentTasks">,
  prState: "open" | "merged",
) {
  await f.t.run(async (ctx) => {
    await ctx.db.patch(taskId, { status: "done", prState, run: undefined });
    for (const run of await ctx.db
      .query("agentRuns")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect()) {
      await ctx.db.patch(run._id, { status: "success" });
    }
  });
}
