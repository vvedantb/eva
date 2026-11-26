import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { api, internal } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import {
  projectTaskDisplayStatus,
  projectTaskNeedsYou,
} from "@eva/shared/projectStatus";
import { sessionSandboxProfile } from "../convex/_sessions/owner";
import { COORDINATOR_VCPUS } from "../convex/_sandbox/provider";
import { modules } from "./_helpers/convexModules";
import { handProjectTriageToEva } from "../convex/_migrations/handTriageToEva";

/**
 * The project as an orchestrator, through the real Convex functions: the
 * scheduler and its cap, the coordinator's tasks (start at once) against
 * a person's task (handed to the coordinator at once), the coordinator's one retry and its wake-ups,
 * the repos the coordinator may use, locked rows, the roll-up of docs, artifacts and
 * log, the copy of the project's model and account, the coordinator's
 * delete rule, project delete, and the coordinator's sandbox.
 */

const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|project-scheduler";
const OTHER_CLERK_ID = "clerk|project-scheduler-other";

// Runs start workflows; keep their steps from running after the test.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
});

async function fixture(taskCount: number) {
  const t = convexTest(schema, modules);
  workflow.register(t);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const otherUserId = await ctx.db.insert("users", { clerkId: OTHER_CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    // A repo the user can open that is not the project's home repo.
    const outsideRepoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "outside",
      installationId: 1,
      connectedBy: userId,
    });
    // Only the other user can open it.
    const lockedRepoId = await ctx.db.insert("githubRepos", {
      owner: "someone",
      name: "private",
      installationId: 2,
      connectedBy: otherUserId,
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId,
      title: "Project",
      rawInput: "Project",
      numId: 1,
    });
    const tasks: Id<"agentTasks">[] = [];
    for (let i = 1; i <= taskCount; i += 1) {
      tasks.push(
        await ctx.db.insert("agentTasks", {
          repoId,
          projectId,
          title: `Task ${i}`,
          taskNumber: i,
          status: "todo",
          approvedAt: 1,
          numId: i,
          createdAt: 0,
          updatedAt: 0,
          createdBy: userId,
        }),
      );
    }
    return { userId, otherUserId, repoId, outsideRepoId, lockedRepoId, projectId, tasks };
  });
  return { t, asUser: t.withIdentity({ subject: CLERK_ID }), ...ids };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

const schedule = (f: Fixture) =>
  f.t.mutation(internal.buildWorkflow.scheduleReadyTasks, {
    projectId: f.projectId,
  });

const taskDoc = (f: Fixture, id: Id<"agentTasks">) =>
  f.t.run(async (ctx) => {
    const task = await ctx.db.get(id);
    if (!task) throw new Error("task missing");
    return task;
  });

const statuses = (f: Fixture, ids: readonly Id<"agentTasks">[]) =>
  Promise.all(ids.map(async (id) => (await taskDoc(f, id)).status));

const factsOf = async (f: Fixture, taskId: Id<"agentTasks">) => {
  const rows = await f.asUser.query(api.agentTasks.listByProject, {
    projectId: f.projectId,
  });
  const facts = rows.find((row) => row._id === taskId)?.facts;
  if (!facts) throw new Error("facts missing");
  return facts;
};

/** The task's latest run ended in an error and it went back to todo. */
async function failLatestRun(f: Fixture, taskId: Id<"agentTasks">) {
  return f.t.run(async (ctx) => {
    const runs = await ctx.db
      .query("agentRuns")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
    let runId = runs.at(-1)?._id;
    if (runId === undefined) {
      runId = await ctx.db.insert("agentRuns", {
        taskId,
        repoId: f.repoId,
        status: "error",
        logs: [],
        startedAt: Date.now() - 1_000,
        error: "Tests failed",
      });
    }
    for (const run of runs) {
      await ctx.db.patch(run._id, { status: "error", error: "Tests failed" });
    }
    await ctx.db.patch(taskId, { status: "todo", run: undefined });
    return runId;
  });
}

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

describe("project scheduler", () => {
  test(
    "starts every approved task at once, each on its own session",
    async () => {
      const f = await fixture(5);
      await schedule(f);
      expect(await statuses(f, f.tasks)).toEqual(
        Array.from({ length: 5 }, () => "in_progress"),
      );
      const owners = await f.t.run(async (ctx) =>
        (await ctx.db.query("sessions").collect()).map((s) => s.owner),
      );
      expect(owners).toHaveLength(5);
      expect(owners.every((owner) => owner.kind === "task")).toBe(true);

      // A second call on the same state starts nothing new.
      await schedule(f);
      const again = await f.t.run(async (ctx) =>
        (await ctx.db.query("sessions").collect()).length,
      );
      expect(again).toBe(5);
    },
    TIMEOUT_MS,
  );

  test(
    "a task run copies the project's model and account at its start",
    async () => {
      const f = await fixture(1);
      const accountId = await f.t.run(async (ctx) => {
        const accountId = await ctx.db.insert("userProviderAccounts", {
          userId: f.userId,
          provider: "claude",
          label: "Project account",
          credentials: [],
          createdAt: 0,
          updatedAt: 0,
        });
        await ctx.db.patch(f.projectId, {
          model: "claude:opus",
          providerAccountId: accountId,
        });
        await ctx.db.patch(f.tasks[0], { model: "claude:sonnet" });
        return accountId;
      });
      await schedule(f);
      const task = await taskDoc(f, f.tasks[0]);
      expect(task.status).toBe("in_progress");
      expect(task.model).toBe("claude:opus");
      expect(task.providerAccountId).toBe(accountId);
    },
    TIMEOUT_MS,
  );
});

describe("who starts project tasks", () => {
  test(
    "the coordinator's tasks are approved and the scheduler runs at once; a person's goes to the coordinator",
    async () => {
      const f = await fixture(0);
      const created = await f.t.mutation(
        internal._projects.batches.createTasksFromCoordinator,
        {
          projectId: f.projectId,
          userId: f.userId,
          tasks: [{ title: "API" }, { title: "UI" }],
        },
      );
      const coordinatorTasks = await Promise.all(
        created.taskIds.map((id) => taskDoc(f, id)),
      );
      expect(coordinatorTasks.every((task) => task.approvedAt !== undefined)).toBe(true);
      const scheduled = await f.t.run((ctx) =>
        ctx.db.system.query("_scheduled_functions").collect(),
      );
      expect(scheduled.map((job) => job.name)).toContain(
        "buildWorkflow:scheduleReadyTasks",
      );
      await schedule(f);
      expect(await statuses(f, created.taskIds)).toEqual([
        "in_progress",
        "in_progress",
      ]);

      // A person's task without "Start now" goes to the coordinator, and
      // only the coordinator starts it.
      const personTaskId = await f.asUser.mutation(api.agentTasks.createQuickTask, {
        repoId: f.repoId,
        projectId: f.projectId,
        description: "The button is hard to find",
      });
      await schedule(f);
      expect((await taskDoc(f, personTaskId)).status).toBe("todo");
      await f.t.mutation(internal.buildWorkflow.startTaskAsCoordinator, {
        projectId: f.projectId,
        taskId: personTaskId,
      });
      expect((await taskDoc(f, personTaskId)).status).toBe("in_progress");
    },
    TIMEOUT_MS,
  );

  test(
    "the coordinator cannot create a task in a repo the user has no access to",
    async () => {
      const f = await fixture(0);
      await expect(
        f.t.mutation(internal._projects.batches.createTasksFromCoordinator, {
          projectId: f.projectId,
          userId: f.userId,
          tasks: [{ title: "Home" }, { title: "Elsewhere", repoId: f.lockedRepoId }],
        }),
      ).rejects.toThrow("has no access to its repository");
      // Checked before any task is written.
      const tasks = await f.t.run((ctx) => ctx.db.query("agentTasks").collect());
      expect(tasks).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "the coordinator may create a task in another repo the user can access",
    async () => {
      const f = await fixture(0);
      const { taskIds } = await f.t.mutation(
        internal._projects.batches.createTasksFromCoordinator,
        {
          projectId: f.projectId,
          userId: f.userId,
          tasks: [{ title: "Home" }, { title: "Elsewhere", repoId: f.outsideRepoId }],
        },
      );
      const repos = await Promise.all(
        taskIds.map(async (id) => (await taskDoc(f, id)).repoId),
      );
      expect(repos).toEqual([f.repoId, f.outsideRepoId]);
    },
    TIMEOUT_MS,
  );
});

describe("the coordinator's retry and wake-ups", () => {
  test(
    "a first failure wakes the coordinator, which may retry once; a second failure needs a person",
    async () => {
      const f = await fixture(1);
      const [taskId] = f.tasks;
      const runId = await failLatestRun(f, taskId);
      await schedule(f);
      expect(projectTaskNeedsYou(await factsOf(f, taskId))).toBeUndefined();
      const wakes = await f.t.run((ctx) =>
        ctx.db.query("projectCoordinatorWakes").collect(),
      );
      expect(wakes.map((wake) => [wake.reason, wake.key])).toEqual([
        ["failed", `failed:${runId}`],
      ]);

      await f.t.mutation(internal.buildWorkflow.retryFailedTaskAsCoordinator, {
        projectId: f.projectId,
        taskId,
        note: "Fix the flaky test first.",
      });
      const retried = await taskDoc(f, taskId);
      expect(retried.status).toBe("in_progress");
      expect(retried.coordinatorRetries).toBe(1);

      await failLatestRun(f, taskId);
      await schedule(f);
      expect(projectTaskNeedsYou(await factsOf(f, taskId))).toBe("failed");
      // No wake-up for a failure the coordinator may not retry.
      const after = await f.t.run((ctx) =>
        ctx.db.query("projectCoordinatorWakes").collect(),
      );
      expect(after).toHaveLength(1);
      await expect(
        f.t.mutation(internal.buildWorkflow.retryFailedTaskAsCoordinator, {
          projectId: f.projectId,
          taskId,
          note: "Again.",
        }),
      ).rejects.toThrow("already retried");
    },
    TIMEOUT_MS,
  );

  test(
    "a batch whose tasks all ended wakes the coordinator once",
    async () => {
      const f = await fixture(2);
      const batchId = await f.t.run((ctx) =>
        ctx.db.insert("projectTaskBatches", {
          projectId: f.projectId,
          taskIds: f.tasks,
          createdAt: 0,
        }),
      );
      await schedule(f);
      await finishTask(f, f.tasks[0], "merged");
      await schedule(f);
      const batchWakes = async () =>
        (await f.t.run((ctx) => ctx.db.query("projectCoordinatorWakes").collect()))
          .filter((wake) => wake.reason === "batch_done")
          .map((wake) => wake.key);
      expect(await batchWakes()).toEqual([]);

      await finishTask(f, f.tasks[1], "merged");
      await schedule(f);
      await schedule(f);
      expect(await batchWakes()).toEqual([`batch:${batchId}`]);
    },
    TIMEOUT_MS,
  );
});

describe("the project's rows across repos", () => {
  test(
    "a task in a repo the reader cannot open is a locked row",
    async () => {
      const f = await fixture(1);
      const lockedTaskId = await f.t.run((ctx) =>
        ctx.db.insert("agentTasks", {
          repoId: f.lockedRepoId,
          projectId: f.projectId,
          title: "Secret",
          taskNumber: 2,
          status: "todo",
          approvedAt: 1,
          numId: 1,
          createdAt: 0,
          updatedAt: 0,
          createdBy: f.otherUserId,
        }),
      );
      const rows = await f.t.query(internal.mcp.projectQueries.projectTaskTable, {
        projectId: f.projectId,
        userId: f.userId,
      });
      expect(rows).toEqual([
        expect.objectContaining({ locked: false, taskId: f.tasks[0], title: "Task 1" }),
        { locked: true, taskId: lockedTaskId },
      ]);
    },
    TIMEOUT_MS,
  );

  test(
    "the project's docs, artifacts and log roll up its child tasks' rows the reader can open",
    async () => {
      const f = await fixture(1);
      const [childId] = f.tasks;
      await f.t.run(async (ctx) => {
        const lockedTaskId = await ctx.db.insert("agentTasks", {
          repoId: f.lockedRepoId,
          projectId: f.projectId,
          title: "Secret",
          taskNumber: 2,
          status: "todo",
          numId: 1,
          createdAt: 0,
          updatedAt: 0,
          createdBy: f.otherUserId,
        });
        const sources: Array<
          [string, Pick<Doc<"docs">, "sourceKind" | "sourceProjectId" | "sourceTaskId">]
        > = [
          ["project", { sourceKind: "project", sourceProjectId: f.projectId }],
          ["child", { sourceKind: "task", sourceTaskId: childId }],
          ["locked", { sourceKind: "task", sourceTaskId: lockedTaskId }],
        ];
        const teamId = await ctx.db.insert("teams", {
          name: "Team",
          createdBy: f.userId,
          createdAt: 0,
        });
        await ctx.db.insert("teamMembers", {
          teamId,
          userId: f.userId,
          role: "owner",
          joinedAt: 0,
        });
        const htmlStorageId = await ctx.storage.store(new Blob(["<p>hi</p>"]));
        for (const [name, source] of sources) {
          await ctx.db.insert("docs", {
            repoId: f.repoId,
            title: `${name} doc`,
            content: "",
            createdBy: f.userId,
            createdAt: 0,
            updatedAt: 0,
            ...source,
          });
          await ctx.db.insert("chatLogEntries", {
            repoId: f.repoId,
            kind: "decision",
            author: "agent",
            title: `${name} entry`,
            createdAt: 0,
            ...source,
          });
          await ctx.db.insert("artifacts", {
            name: `${name} artifact`,
            boundTeamId: teamId,
            declaredTools: [],
            htmlStorageId,
            uploadedBy: f.userId,
            createdAt: 0,
            ...source,
          });
        }
      });
      const source: { kind: "project"; projectId: Id<"projects"> } = {
        kind: "project",
        projectId: f.projectId,
      };
      const [docs, log, artifacts] = await Promise.all([
        f.asUser.query(api.docs.listForSource, { source }),
        f.asUser.query(api.chatLog.listForSource, { source }),
        f.asUser.query(api.artifacts.listForSource, { source }),
      ]);
      expect(docs.map((row) => row.title).sort()).toEqual(["child doc", "project doc"]);
      expect(log.map((row) => row.title).sort()).toEqual(["child entry", "project entry"]);
      expect(artifacts.map((row) => row.name).sort()).toEqual([
        "child artifact",
        "project artifact",
      ]);
    },
    TIMEOUT_MS,
  );
});

describe("archiving project work", () => {
  test(
    "the coordinator may archive only a task that has not started",
    async () => {
      const f = await fixture(3);
      const [notStarted, running, inReview] = f.tasks;
      await f.t.run(async (ctx) => {
        await ctx.db.patch(running, { status: "in_progress" });
        await ctx.db.patch(inReview, { status: "code_review" });
      });
      const check = (taskId: Id<"agentTasks">) =>
        f.t.query(internal.mcp.projectQueries.assertCoordinatorMayArchiveTask, {
          projectId: f.projectId,
          taskId,
        });
      await expect(check(notStarted)).resolves.toBeNull();
      await expect(check(running)).rejects.toThrow("has started");
      await expect(check(inReview)).rejects.toThrow("has started");

      // A todo task with a run pending has started too.
      await f.t.run((ctx) =>
        ctx.db.patch(running, {
          status: "todo",
          run: { state: "running", workflowId: "wf-1" },
        }),
      );
      await expect(check(running)).rejects.toThrow("has started");
    },
    TIMEOUT_MS,
  );

  test(
    "a project archive is refused while a task runs; otherwise its tasks stay in it",
    async () => {
      const f = await fixture(2);
      await schedule(f);
      await expect(
        f.asUser.mutation(api.projects.archive, { id: f.projectId }),
      ).rejects.toThrow("is running");
      expect((await f.t.run((ctx) => ctx.db.get(f.projectId)))?.archivedAt).toBeUndefined();

      await finishTask(f, f.tasks[0], "open");
      await finishTask(f, f.tasks[1], "merged");
      const before = await Promise.all(f.tasks.map((id) => taskDoc(f, id)));
      await f.asUser.mutation(api.projects.archive, { id: f.projectId });
      expect((await f.t.run((ctx) => ctx.db.get(f.projectId)))?.archivedAt).toBeDefined();
      expect(
        (await f.asUser.query(api.projects.list, { repoId: f.repoId })).map((p) => p._id),
      ).not.toContain(f.projectId);
      expect(
        (await f.asUser.query(api.projects.listArchived, { repoId: f.repoId })).map((p) => p._id),
      ).toEqual([f.projectId]);
      for (const [index, id] of f.tasks.entries()) {
        const task = await taskDoc(f, id);
        expect(task.projectId).toBe(f.projectId);
        expect(task.taskNumber).toBe(before[index]?.taskNumber);
        expect(task.archivedAt).toBeUndefined();
      }
      // Unarchive brings the project back with the same tasks.
      await f.asUser.mutation(api.projects.unarchive, { id: f.projectId });
      expect((await f.t.run((ctx) => ctx.db.get(f.projectId)))?.archivedAt).toBeUndefined();
      expect(
        (await f.asUser.query(api.agentTasks.listByProject, { projectId: f.projectId })).map((t) => t._id),
      ).toEqual(f.tasks);
      // Their sessions stay theirs.
      const owners = await f.t.run(async (ctx) =>
        (await ctx.db.query("sessions").collect()).map((s) => s.owner),
      );
      expect(owners).toEqual(
        expect.arrayContaining(f.tasks.map((taskId) => ({ kind: "task", taskId }))),
      );
    },
    TIMEOUT_MS,
  );
});

test(
  "a coordinator's sandbox is 2 vCPU and runs no dev server or background commands; a task's runs them",
  async () => {
    const f = await fixture(1);
    expect(
      sessionSandboxProfile({ kind: "project", projectId: f.projectId }),
    ).toEqual({ vcpus: COORDINATOR_VCPUS, runsServices: false });
    expect(COORDINATOR_VCPUS).toBe(2);
    expect(sessionSandboxProfile({ kind: "task", taskId: f.tasks[0] })).toEqual({
      vcpus: undefined,
      runsServices: true,
    });
  },
  TIMEOUT_MS,
);

describe("people's tasks go to the coordinator", () => {
  /** A person's project task: handed to the coordinator at creation. */
  const personTask = (f: Fixture, title: string) =>
    f.asUser.mutation(api.agentTasks.createQuickTask, {
      repoId: f.repoId,
      projectId: f.projectId,
      description: title,
    });

  const wakes = (f: Fixture) =>
    f.t.run((ctx) => ctx.db.query("projectCoordinatorWakes").collect());

  test(
    "a person's task is approved and handed at once, with one wake-up, and starts nothing",
    async () => {
      const f = await fixture(0);
      const a = await personTask(f, "Promo box is hard to find");
      await schedule(f);
      expect(await statuses(f, [a])).toEqual(["todo"]);
      const handed = await taskDoc(f, a);
      expect(handed.approvedAt).toBeDefined();
      expect(handed.handedToCoordinatorAt).toBeDefined();
      const facts = await factsOf(f, a);
      expect(facts.withCoordinator).toBe(true);
      expect(projectTaskDisplayStatus(facts)).toBe("idle");
      expect(projectTaskNeedsYou(facts)).toBeUndefined();
      const rows = await wakes(f);
      expect(rows.map((row) => row.reason)).toEqual(["triage"]);
      expect(rows[0]?.text).toContain("Promo box is hard to find");

      // A second ask is its own wake-up.
      await personTask(f, "Rename Basket to Cart");
      expect(await wakes(f)).toHaveLength(2);
    },
    TIMEOUT_MS,
  );

  test(
    "the migration hands old Triage tasks over with one wake-up per project, once",
    async () => {
      const f = await fixture(0);
      const old = (title: string, projectId: Id<"projects">) =>
        f.t.run((ctx) =>
          ctx.db.insert("agentTasks", {
            repoId: f.repoId,
            projectId,
            title,
            status: "todo",
            numId: 100,
            createdAt: 0,
            updatedAt: 0,
            createdBy: f.userId,
          }),
        );
      const otherProject = await f.t.run((ctx) =>
        ctx.db.insert("projects", {
          repoId: f.repoId,
          userId: f.userId,
          title: "Other",
          rawInput: "Other",
          numId: 2,
        }),
      );
      const a = await old("Old ask A", f.projectId);
      const b = await old("Old ask B", f.projectId);
      const c = await old("Old ask C", otherProject);
      const migrate = () =>
        f.t.run(async (ctx) => {
          const projects = await ctx.db.query("projects").collect();
          for (const project of projects) {
            await handProjectTriageToEva(ctx, project);
          }
        });
      await migrate();
      for (const id of [a, b, c]) {
        const task = await taskDoc(f, id);
        expect(task.approvedAt).toBeDefined();
        expect(task.handedToCoordinatorAt).toBeDefined();
      }
      const rows = await wakes(f);
      expect(rows.map((row) => String(row.projectId)).sort()).toEqual(
        [String(f.projectId), String(otherProject)].sort(),
      );
      expect(rows.find((row) => row.projectId === f.projectId)?.text).toContain(
        "Old ask B",
      );

      // A re-run, even with the stamps cleared, wakes no one again.
      await migrate();
      await f.t.run((ctx) =>
        ctx.db.patch(a, { approvedAt: undefined, handedToCoordinatorAt: undefined }),
      );
      await migrate();
      expect(await wakes(f)).toHaveLength(2);
    },
    TIMEOUT_MS,
  );

  test(
    "merge_task_into closes the item as added to an open task, and refuses bad targets",
    async () => {
      const f = await fixture(1);
      const open = f.tasks[0];
      if (open === undefined) throw new Error("fixture task missing");
      const item = await personTask(f, "Copy fix");
      const other = await personTask(f, "Another fix");
      const merge = (taskId: Id<"agentTasks">, intoTaskId: Id<"agentTasks">) =>
        f.t.mutation(internal.buildWorkflow.mergeTaskIntoAsCoordinator, {
          projectId: f.projectId,
          taskId,
          intoTaskId,
        });

      // Not into itself, not into a finished task.
      await expect(merge(item, item)).rejects.toThrow("into itself");
      await f.t.run((ctx) => ctx.db.patch(open, { status: "done" }));
      await expect(merge(item, open)).rejects.toThrow("finished");
      await f.t.run((ctx) => ctx.db.patch(open, { status: "in_progress" }));

      expect(await merge(item, open)).toEqual({ intoTaskNumber: 1 });
      const merged = await taskDoc(f, item);
      expect(merged.status).toBe("cancelled");
      expect(merged.mergedIntoTaskId).toBe(open);
      expect(merged.handedToCoordinatorAt).toBeUndefined();
      // A merged item cannot be merged or started again.
      await expect(merge(item, open)).rejects.toThrow("not started");
      // Nor into a merged (cancelled) item.
      await expect(merge(other, item)).rejects.toThrow("finished");
    },
    TIMEOUT_MS,
  );

  test(
    "the coordinator's tools refuse a task of another project",
    async () => {
      const f = await fixture(0);
      const otherProject = await f.t.run((ctx) =>
        ctx.db.insert("projects", {
          repoId: f.repoId,
          userId: f.userId,
          title: "Other",
          rawInput: "Other",
          numId: 2,
        }),
      );
      const item = await personTask(f, "Copy fix");
      await expect(
        f.t.mutation(internal.buildWorkflow.startTaskAsCoordinator, {
          projectId: otherProject,
          taskId: item,
        }),
      ).rejects.toThrow("not part of this project");
    },
    TIMEOUT_MS,
  );
});
