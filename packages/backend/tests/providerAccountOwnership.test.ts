import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * The picker lists the viewer's own accounts alongside every teammate's shared
 * ones, and only `isOwn` tells them apart — `shared` cannot, because an own
 * account can be shared too. The clients default to an own account and never a
 * teammate's, so a wrong `isOwn` silently bills a teammate's credential for
 * every new session and quick task (fix 4b948b101).
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the whole convex module graph costs seconds on a cold worker. */
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
      // An own account that is also shared out: `shared` is true, but it still
      // bills the viewer, so it stays own.
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
      // A teammate's unshared account is not selectable at all.
      expect(byId.has(f.matePrivate)).toBe(false);
    },
    TIMEOUT_MS,
  );

  // Own accounts come first so a caller scanning for the first provider match
  // cannot land on a teammate's share.
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

  // The settings page list is owner-only, so every row there is own by
  // definition — and editable and deletable because of it.
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
});
