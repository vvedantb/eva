import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * Rows with the same GitHub owner/name are "siblings" (monorepo apps) that
 * share settings. A stranger's row for the same owner/name in another team
 * must not join the group, or the stranger could see the victim's apps.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const VICTIM = "clerk|sibling-victim";
const STRANGER = "clerk|sibling-stranger";

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const victimId = await ctx.db.insert("users", { clerkId: VICTIM });
    const strangerId = await ctx.db.insert("users", { clerkId: STRANGER });
    const victimTeam = await ctx.db.insert("teams", {
      name: "Victim",
      createdBy: victimId,
      createdAt: now,
    });
    const strangerTeam = await ctx.db.insert("teams", {
      name: "Stranger",
      createdBy: strangerId,
      createdAt: now,
    });
    await ctx.db.insert("teamMembers", {
      teamId: victimTeam,
      userId: victimId,
      role: "owner",
      joinedAt: now,
    });
    await ctx.db.insert("teamMembers", {
      teamId: strangerTeam,
      userId: strangerId,
      role: "owner",
      joinedAt: now,
    });
    const repo = { owner: "acme", name: "mono", installationId: 1 };
    const webApp = await ctx.db.insert("githubRepos", {
      ...repo,
      rootDirectory: "apps/web",
      connectedBy: victimId,
      teamId: victimTeam,
    });
    const apiApp = await ctx.db.insert("githubRepos", {
      ...repo,
      rootDirectory: "apps/api",
      connectedBy: victimId,
      teamId: victimTeam,
    });
    const strangerApp = await ctx.db.insert("githubRepos", {
      ...repo,
      rootDirectory: "apps/admin",
      connectedBy: strangerId,
      teamId: strangerTeam,
    });
    return { webApp, apiApp, strangerApp };
  });
  return { t, ids };
}

describe("repo siblings stay inside one team", () => {
  test("listSiblingApps lists same-team apps only and needs access", async () => {
    const { t, ids } = await fixture();
    const victim = t.withIdentity({ subject: VICTIM });
    const stranger = t.withIdentity({ subject: STRANGER });

    const victimApps = await victim.query(api.githubRepos.listSiblingApps, {
      repoId: ids.webApp,
    });
    expect(victimApps).toEqual([{ _id: ids.apiApp, appName: "api" }]);

    const strangerApps = await stranger.query(
      api.githubRepos.listSiblingApps,
      { repoId: ids.strangerApp },
    );
    expect(strangerApps).toEqual([]);

    const peek = await stranger.query(api.githubRepos.listSiblingApps, {
      repoId: ids.webApp,
    });
    expect(peek).toEqual([]);
  });
});
