import { convexTest } from "convex-test";
import { describe, expect, test } from "bun:test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { modules } from "./_helpers/convexModules";

/**
 * Reported bug: "Delete draft in the quick task modal doesn't work" (fix
 * 613e5d8cc): a removed draft came straight back on the next subscription
 * push and the button looked dead. A draft is unsent text, so `deleteDraft`
 * deletes the row (drafts are never archived).
 *
 * These run the real mutation against the real queries, because the property
 * that broke is behavioural: the draft must leave the list and the count.
 */


/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|draft-delete";

/** One repo the caller owns, holding two of their drafts. */
async function fixture() {
  const t = convexTest(schema, modules);
  const repoId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    return ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "draft-delete-test",
      installationId: 1,
      connectedBy: userId,
    });
  });
  const asUser = t.withIdentity({ subject: CLERK_ID });
  const keptId = await asUser.mutation(api.agentTasks.saveDraft, {
    repoId,
    description: "Kept draft",
  });
  const removedId = await asUser.mutation(api.agentTasks.saveDraft, {
    repoId,
    description: "Removed draft",
  });
  return { t, asUser, repoId, keptId, removedId };
}

describe("deleting a quick-task draft", () => {
  test(
    "drops it from the modal list and the badge count",
    async () => {
      const f = await fixture();
      const before = await f.asUser.query(api.agentTasks.countDrafts, {
        repoId: f.repoId,
      });
      expect(before).toBe(2);

      await f.asUser.mutation(api.agentTasks.deleteDraft, { id: f.removedId });

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
    "deletes the row; archive refuses a draft",
    async () => {
      const f = await fixture();
      await expect(
        f.asUser.mutation(api.agentTasks.archive, { id: f.removedId }),
      ).rejects.toThrow("Delete the draft instead");
      await f.asUser.mutation(api.agentTasks.deleteDraft, { id: f.removedId });

      expect(await f.t.run((ctx) => ctx.db.get(f.removedId))).toBeNull();
    },
    TIMEOUT_MS,
  );
});
