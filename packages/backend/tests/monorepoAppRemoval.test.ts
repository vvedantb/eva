import { convexTest } from "convex-test";
import { expect, test } from "bun:test";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { modules } from "./_helpers/convexModules";

/**
 * GitHub sync used to add every app it found in a monorepo, so an app the user
 * did not want came back on every sync. A removed app now stays out of lists
 * and out of sync, and adding it again restores the same row.
 */

const REPO = { owner: "a", name: "mono", installationId: 1, githubId: 42 };

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const ann = await ctx.db.insert("users", {
      clerkId: "clerk|ann",
      email: "ann@a.example",
      firstName: "Ann",
    });
    const team = await ctx.db.insert("teams", {
      name: "A",
      createdBy: ann,
      createdAt: 0,
    });
    await ctx.db.insert("teamMembers", {
      teamId: team,
      userId: ann,
      role: "owner",
      joinedAt: 0,
    });
    const app = await ctx.db.insert("githubRepos", {
      ...REPO,
      teamId: team,
      connectedBy: ann,
      rootDirectory: "apps/extension",
    });
    return { userId: ann, team, app };
  });
  return { t, ann: t.withIdentity({ subject: "clerk|ann" }), ...ids };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

const listedPaths = async (ann: Fixture["ann"]) =>
  (await ann.query(api.githubRepos.list, { includeHidden: true })).map(
    (repo) => repo.rootDirectory,
  );

test("a removed app leaves lists, stays out of sync, and comes back on add", async () => {
  const { t, ann, team, app, userId } = await fixture();
  const detected = { ...REPO, teamId: team, rootDirectory: "apps/extension" };

  expect(await t.mutation(internal.githubRepos.syncDetectedApp, detected)).toBe(
    "kept",
  );

  await ann.mutation(api.githubRepos.removeApp, { repoId: app });
  expect(await listedPaths(ann)).toEqual([]);
  expect(await t.mutation(internal.githubRepos.syncDetectedApp, detected)).toBe(
    "removed",
  );

  const restored = await t.mutation(
    internal._githubRepos.mutations.createForInstallation,
    { ...REPO, teamId: team, userId, rootDirectory: "apps/extension" },
  );
  expect(restored).toBe(app);
  expect(await listedPaths(ann)).toEqual(["apps/extension"]);
});

test("sync reports an unknown app as new without adding it; unticking records it as removed", async () => {
  const { t, ann, team, userId } = await fixture();
  const fresh = { ...REPO, teamId: team, rootDirectory: "apps/admin" };

  expect(await t.mutation(internal.githubRepos.syncDetectedApp, fresh)).toBe(
    "new",
  );
  expect(await listedPaths(ann)).toEqual(["apps/extension"]);

  await t.mutation(internal._githubRepos.mutations.createForInstallation, {
    ...fresh,
    userId,
    removed: true,
    ifMissing: true,
  });
  expect(await listedPaths(ann)).toEqual(["apps/extension"]);
  expect(await t.mutation(internal.githubRepos.syncDetectedApp, fresh)).toBe(
    "removed",
  );
});
