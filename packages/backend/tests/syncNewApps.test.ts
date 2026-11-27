import { convexTest } from "convex-test";
import { expect, test } from "bun:test";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { modules } from "./_helpers/convexModules";

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
    await ctx.db.insert("githubRepos", {
      ...REPO,
      teamId: team,
      connectedBy: ann,
      rootDirectory: "apps/web",
    });
    return { userId: ann, team };
  });
  return { t, ann: t.withIdentity({ subject: "clerk|ann" }), ...ids };
}

test("sync reports an unknown app as new; unticked it is added hidden and stays hidden", async () => {
  const { t, ann, team, userId } = await fixture();
  const fresh = { ...REPO, teamId: team, rootDirectory: "apps/extension" };
  const visiblePaths = async () =>
    (await ann.query(api.githubRepos.list, {})).map((r) => r.rootDirectory);

  expect(await t.mutation(internal.githubRepos.syncDetectedApp, fresh)).toBe(
    "new",
  );
  expect(await visiblePaths()).toEqual(["apps/web"]);

  await t.mutation(internal._githubRepos.mutations.createForInstallation, {
    ...fresh,
    userId,
    hidden: true,
    ifMissing: true,
  });
  expect(await t.mutation(internal.githubRepos.syncDetectedApp, fresh)).toBe(
    "kept",
  );
  expect(await visiblePaths()).toEqual(["apps/web"]);
});
