import { convexTest } from "convex-test";
import { describe, expect, test } from "bun:test";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { modules } from "./_helpers/convexModules";


const TIMEOUT_MS = 30_000;
const OWNER_CLERK_ID = "clerk|account-owner";

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const ownerUserId = await ctx.db.insert("users", {
      clerkId: OWNER_CLERK_ID,
      firstName: "Vedant",
    });
    const teammateUserId = await ctx.db.insert("users", {
      clerkId: "clerk|teammate",
      firstName: "Sam",
    });
    const teamId = await ctx.db.insert("teams", {
      name: "Eva",
      createdBy: ownerUserId,
      createdAt: now,
    });
    for (const userId of [ownerUserId, teammateUserId]) {
      await ctx.db.insert("teamMembers", {
        teamId,
        userId,
        role: "member",
        joinedAt: now,
      });
    }
    const account = async (
      userId: typeof ownerUserId,
      provider: "claude" | "codex",
      shared: boolean,
    ) =>
      await ctx.db.insert("userProviderAccounts", {
        userId,
        provider,
        label: "Personal",
        credentials: [{ key: "TOKEN", value: "encrypted" }],
        shared,
        createdAt: now,
        updatedAt: now,
      });
    return {
      ownerUserId,
      ownPrivate: await account(ownerUserId, "claude", false),
      ownShared: await account(ownerUserId, "codex", true),
      mateShared: await account(teammateUserId, "claude", true),
      matePrivate: await account(teammateUserId, "codex", false),
    };
  });
  return { t: t.withIdentity({ subject: OWNER_CLERK_ID }), ...ids };
}

describe("provider account ownership", () => {
  test(
    "listSelectable marks own accounts own and teammates' shares not",
    async () => {
      const f = await fixture();
      const accounts = await f.t.query(
        api.userProviderAccounts.listSelectable,
        {},
      );
      const byId = new Map(accounts.map((row) => [row._id, row]));

      expect(byId.get(f.ownPrivate)?.isOwn).toBe(true);
      expect(byId.get(f.ownShared)?.isOwn).toBe(true);
      expect(byId.get(f.mateShared)?.isOwn).toBe(false);
      expect(byId.has(f.matePrivate)).toBe(false);
    },
    TIMEOUT_MS,
  );

  test(
    "listSelectable puts own accounts ahead of teammates' shares",
    async () => {
      const f = await fixture();
      const accounts = await f.t.query(
        api.userProviderAccounts.listSelectable,
        {},
      );
      const firstShared = accounts.findIndex((row) => !row.isOwn);
      const lastOwn = accounts.map((row) => row.isOwn).lastIndexOf(true);
      expect(firstShared).toBeGreaterThan(lastOwn);
    },
    TIMEOUT_MS,
  );

  test(
    "list returns only the viewer's own accounts",
    async () => {
      const f = await fixture();
      const accounts = await f.t.query(api.userProviderAccounts.list, {});
      expect(accounts.map((row) => row._id).sort()).toEqual(
        [f.ownPrivate, f.ownShared].sort(),
      );
      expect(accounts.every((row) => row.isOwn)).toBe(true);
    },
    TIMEOUT_MS,
  );

  test(
    "MCP picks a teammate's shared account by first name",
    async () => {
      const f = await fixture();
      const repoId = await f.t.run(
        async (ctx) =>
          await ctx.db.insert("githubRepos", {
            owner: "vvedantb",
            name: "eva",
            installationId: 1,
            connectedBy: f.ownerUserId,
          }),
      );
      const resolve = (account: string) =>
        f.t.query(internal.mcp.queries.resolveMcpProviderAccount, {
          account,
          scope: { kind: "creator", userId: f.ownerUserId, repoId },
        });

      expect(await resolve("sam")).toEqual({
        ok: true,
        providerAccountId: f.mateShared,
      });
      expect(await resolve("Vedant")).toEqual({
        ok: true,
        providerAccountId: f.ownPrivate,
      });
      expect(await resolve("team")).toEqual({
        ok: true,
        providerAccountId: null,
      });
      expect((await resolve(String(f.matePrivate))).ok).toBe(false);
    },
    TIMEOUT_MS,
  );
});
