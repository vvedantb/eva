import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * Hosted artifacts keep persistent state through window.cowork.state. These
 * hit the real functions: "user" scope must stay private per viewer, "shared"
 * must be one copy per team, and outsiders must see and write nothing.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const ALICE = "clerk|artifact-state-alice";
const BOB = "clerk|artifact-state-bob";
const STRANGER = "clerk|artifact-state-stranger";

async function fixture() {
  const t = convexTest(schema, modules);
  const artifactId = await t.run(async (ctx) => {
    const now = Date.now();
    const alice = await ctx.db.insert("users", { clerkId: ALICE });
    const bob = await ctx.db.insert("users", { clerkId: BOB });
    await ctx.db.insert("users", { clerkId: STRANGER });
    const teamId = await ctx.db.insert("teams", {
      name: "Eva",
      createdBy: alice,
      createdAt: now,
    });
    for (const userId of [alice, bob]) {
      await ctx.db.insert("teamMembers", {
        teamId,
        userId,
        role: "member",
        joinedAt: now,
      });
    }
    const htmlStorageId = await ctx.storage.store(
      new Blob(["<html></html>"], { type: "text/html" }),
    );
    return ctx.db.insert("artifacts", {
      name: "Todo app",
      boundTeamId: teamId,
      declaredTools: [],
      htmlStorageId,
      uploadedBy: alice,
      createdAt: now,
    });
  });
  return {
    t,
    artifactId,
    alice: t.withIdentity({ subject: ALICE }),
    bob: t.withIdentity({ subject: BOB }),
    stranger: t.withIdentity({ subject: STRANGER }),
  };
}

describe("artifact state", () => {
  test(
    "user scope is private, shared scope is team-wide, set overwrites",
    async () => {
      const f = await fixture();
      const { artifactId } = f;
      await f.alice.mutation(api.artifactState.set, {
        artifactId,
        scope: "user",
        key: "theme",
        value: '"dark"',
      });
      await f.alice.mutation(api.artifactState.set, {
        artifactId,
        scope: "shared",
        key: "todos",
        value: '["a"]',
      });
      await f.bob.mutation(api.artifactState.set, {
        artifactId,
        scope: "shared",
        key: "todos",
        value: '["a","b"]',
      });

      expect(
        await f.alice.query(api.artifactState.list, { artifactId }),
      ).toEqual({
        shared: [{ key: "todos", value: '["a","b"]' }],
        user: [{ key: "theme", value: '"dark"' }],
      });
      expect(await f.bob.query(api.artifactState.list, { artifactId })).toEqual(
        { shared: [{ key: "todos", value: '["a","b"]' }], user: [] },
      );

      await f.bob.mutation(api.artifactState.remove, {
        artifactId,
        scope: "shared",
        key: "todos",
      });
      expect(
        (await f.alice.query(api.artifactState.list, { artifactId }))?.shared,
      ).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "non-members cannot read or write, and bad values are rejected",
    async () => {
      const f = await fixture();
      const { artifactId } = f;
      expect(
        await f.stranger.query(api.artifactState.list, { artifactId }),
      ).toBeNull();
      await expect(
        f.stranger.mutation(api.artifactState.set, {
          artifactId,
          scope: "shared",
          key: "x",
          value: "1",
        }),
      ).rejects.toThrow(/not accessible/);
      await expect(
        f.alice.mutation(api.artifactState.set, {
          artifactId,
          scope: "user",
          key: "x",
          value: "not json",
        }),
      ).rejects.toThrow(/valid JSON/);
    },
    TIMEOUT_MS,
  );

  test(
    "deleting the artifact deletes its state",
    async () => {
      const f = await fixture();
      const { artifactId } = f;
      await f.alice.mutation(api.artifactState.set, {
        artifactId,
        scope: "shared",
        key: "count",
        value: "3",
      });
      await f.alice.mutation(api.artifacts.remove, { id: artifactId });
      const remaining = await f.t.run((ctx) =>
        ctx.db.query("artifactState").collect(),
      );
      expect(remaining).toEqual([]);
    },
    TIMEOUT_MS,
  );
});
