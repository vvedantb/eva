import { convexTest } from "convex-test";
import { describe, expect, test } from "bun:test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { modules } from "./_helpers/convexModules";


const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|quick-task-restore";
const OUTSIDER_CLERK_ID = "clerk|quick-task-restore-outsider";

async function fixture() {
  const t = convexTest(schema, modules);
  const { repoId, taskId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    await ctx.db.insert("users", { clerkId: OUTSIDER_CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "quick-task-restore-test",
      installationId: 1,
      connectedBy: userId,
    });
    const now = Date.now();
    const taskId = await ctx.db.insert("agentTasks", {
      title: "Archived by mistake",
      status: "todo",
      repoId,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    });
    return { repoId, taskId };
  });
  return { t, asUser: t.withIdentity({ subject: CLERK_ID }), repoId, taskId };
}

describe("unarchiving a quick task", () => {
  test(
    "puts the task back in the list it vanished from",
    async () => {
      const f = await fixture();
      await f.asUser.mutation(api.agentTasks.archive, { id: f.taskId });
      const afterArchive = await f.asUser.query(api.agentTasks.getAllTasks, {
        repoId: f.repoId,
      });
      expect(afterArchive.map((task) => task._id)).toEqual([]);
      const archived = await f.asUser.query(api.agentTasks.listArchived, {
        repoId: f.repoId,
      });
      expect(archived.map((task) => task._id)).toEqual([f.taskId]);

      await f.asUser.mutation(api.agentTasks.unarchive, { id: f.taskId });

      const afterRestore = await f.asUser.query(api.agentTasks.getAllTasks, {
        repoId: f.repoId,
      });
      expect(afterRestore.map((task) => task._id)).toEqual([f.taskId]);
      const row = await f.t.run((ctx) => ctx.db.get(f.taskId));
      expect(row?.archivedAt).toBeUndefined();
    },
    TIMEOUT_MS,
  );

  test(
    "is a no-op on a task that was never archived",
    async () => {
      const f = await fixture();
      await f.asUser.mutation(api.agentTasks.unarchive, { id: f.taskId });
      const tasks = await f.asUser.query(api.agentTasks.getAllTasks, {
        repoId: f.repoId,
      });
      expect(tasks.map((task) => task._id)).toEqual([f.taskId]);
    },
    TIMEOUT_MS,
  );

  test(
    "refuses a task the caller has no access to",
    async () => {
      const f = await fixture();
      await f.asUser.mutation(api.agentTasks.archive, { id: f.taskId });
      await expect(
        f.t
          .withIdentity({ subject: OUTSIDER_CLERK_ID })
          .mutation(api.agentTasks.unarchive, { id: f.taskId }),
      ).rejects.toThrow(/Task not found/);
    },
    TIMEOUT_MS,
  );
});

describe("an archived task", () => {
  test(
    "refuses edits and comments until it is unarchived",
    async () => {
      const f = await fixture();
      await f.asUser.mutation(api.agentTasks.archive, { id: f.taskId });
      await expect(
        f.asUser.mutation(api.agentTasks.updateStatus, {
          id: f.taskId,
          status: "done",
        }),
      ).rejects.toThrow("Unarchive the task first");
      await expect(
        f.asUser.mutation(api.agentTasks.update, {
          id: f.taskId,
          title: "Renamed",
        }),
      ).rejects.toThrow("Unarchive the task first");
      await expect(
        f.asUser.mutation(api.taskComments.create, {
          taskId: f.taskId,
          content: "One more thing",
        }),
      ).rejects.toThrow("Unarchive the task first");
      const row = await f.t.run((ctx) => ctx.db.get(f.taskId));
      expect(row?.status).toBe("todo");
      expect(row?.title).toBe("Archived by mistake");
    },
    TIMEOUT_MS,
  );
});
