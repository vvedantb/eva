import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * Reported bug: "Delete draft in the quick task modal doesn't work" (fix
 * 613e5d8cc). `remove` only stamps `deletedAt` and keeps the row, but
 * listDrafts/countDrafts ranged over the status-only index, so the deleted
 * draft came straight back on the next subscription push and the trash button
 * looked dead. Both now range over by_repo_status_and_deleted.
 *
 * These run the real mutation against the real queries, because the property
 * that broke is behavioural: the row must leave the list while staying on
 * disk. A source-level check of the index name would not catch a future
 * `remove` that stops stamping `deletedAt`.
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|draft-soft-delete";

/** One repo the caller owns, holding two of their drafts. */
async function fixture() {
  const t = convexTest(schema, modules);
  const repoId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    return ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "draft-soft-delete-test",
      installationId: 1,
      connectedBy: userId,
    });
  });
  const asUser = t.withIdentity({ subject: CLERK_ID });
  const keptId = await asUser.mutation(api.agentTasks.saveDraft, {
    repoId,
    title: "Kept draft",
  });
  const removedId = await asUser.mutation(api.agentTasks.saveDraft, {
    repoId,
    title: "Removed draft",
  });
  return { t, asUser, repoId, keptId, removedId };
}

describe("removing a quick-task draft", () => {
  test(
    "drops it from the modal list and the badge count",
    async () => {
      const f = await fixture();
      const before = await f.asUser.query(api.agentTasks.countDrafts, {
        repoId: f.repoId,
      });
      expect(before).toBe(2);

      await f.asUser.mutation(api.agentTasks.remove, { id: f.removedId });

      const drafts = await f.asUser.query(api.agentTasks.listDrafts, {
        repoId: f.repoId,
      });
      expect(drafts.map((draft) => draft._id)).toEqual([f.keptId]);
      expect(
        await f.asUser.query(api.agentTasks.countDrafts, {
          repoId: f.repoId,
        }),
      ).toBe(1);
    },
    TIMEOUT_MS,
  );

  test(
    "keeps the row as a soft delete rather than dropping it",
    async () => {
      const f = await fixture();
      await f.asUser.mutation(api.agentTasks.remove, { id: f.removedId });

      // The row surviving is why the queries have to filter: a hard delete
      // would hide this regression and lose the draft for good.
      const removed = await f.t.run((ctx) => ctx.db.get(f.removedId));
      expect(removed?.deletedAt).toBeTypeOf("number");
      expect(removed?.status).toBe("draft");
    },
    TIMEOUT_MS,
  );
});
