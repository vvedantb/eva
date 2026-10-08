import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * Bulk delete of quick tasks got an Undo (2026-09-16), backed by
 * `agentTasks.restore`. Delete is a soft delete, so undo is a field clear — but
 * every list ranges over `by_repo_status_and_deleted` with `deletedAt` equal to
 * `undefined`, so the field has to be *removed*, not stamped with a falsy
 * value. Patched the wrong way the mutation still succeeds, the toast still
 * says it undid the delete, and the task never comes back.
 *
 * Run against the real mutation and the real list query for that reason: the
 * property is the row reappearing, which no source-level check can see.
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|quick-task-restore";
const OUTSIDER_CLERK_ID = "clerk|quick-task-restore-outsider";

/** One repo the caller owns, holding one quick task. */
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
      title: "Deleted by mistake",
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

describe("undoing a quick-task delete", () => {
  test(
    "puts the task back in the list it vanished from",
    async () => {
      const f = await fixture();
      await f.asUser.mutation(api.agentTasks.remove, { id: f.taskId });
      const afterDelete = await f.asUser.query(api.agentTasks.getAllTasks, {
        repoId: f.repoId,
      });
      expect(afterDelete.map((task) => task._id)).toEqual([]);

      await f.asUser.mutation(api.agentTasks.restore, { id: f.taskId });

      const afterRestore = await f.asUser.query(api.agentTasks.getAllTasks, {
        repoId: f.repoId,
      });
      expect(afterRestore.map((task) => task._id)).toEqual([f.taskId]);
      // The index is ranged on `deletedAt === undefined`, so a stamp of any
      // kind keeps the row hidden.
      const row = await f.t.run((ctx) => ctx.db.get(f.taskId));
      expect(row?.deletedAt).toBeUndefined();
    },
    TIMEOUT_MS,
  );

  test(
    "is a no-op on a task that was never deleted",
    async () => {
      const f = await fixture();
      await f.asUser.mutation(api.agentTasks.restore, { id: f.taskId });
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
      await f.asUser.mutation(api.agentTasks.remove, { id: f.taskId });
      // Undo is reachable from a toast, but the id says nothing about who may
      // press it: restore has to make the same access check delete makes.
      await expect(
        f.t
          .withIdentity({ subject: OUTSIDER_CLERK_ID })
          .mutation(api.agentTasks.restore, { id: f.taskId }),
      ).rejects.toThrow(/Task not found/);
    },
    TIMEOUT_MS,
  );
});
