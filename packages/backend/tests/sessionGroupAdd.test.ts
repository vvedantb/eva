import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * `sessions.addToGroup` puts an existing session into another session's
 * linked-session group (MCP `add_to_session_group`).
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|session-group-add";

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const insertSession = (numId: number) =>
      ctx.db.insert("sessions", {
        repoId,
        userId,
        title: `Session ${numId}`,
        status: "active",
        numId,
      });
    return {
      a: await insertSession(1),
      b: await insertSession(2),
      c: await insertSession(3),
    };
  });
  const asUser = t.withIdentity({ subject: CLERK_ID });
  const groupOf = async (id: (typeof ids)["a"]) =>
    (await t.run((ctx) => ctx.db.get(id)))?.sessionGroupId;
  return { t, asUser, groupOf, ...ids };
}

describe("sessions.addToGroup", () => {
  test(
    "starts a group when the target is in none, then adds a third session",
    async () => {
      const f = await fixture();
      await f.asUser.mutation(api.sessions.addToGroup, {
        sessionId: f.b,
        groupSessionId: f.a,
      });
      const groupId = await f.groupOf(f.a);
      expect(groupId).toBeDefined();
      expect(await f.groupOf(f.b)).toBe(groupId);

      await f.asUser.mutation(api.sessions.addToGroup, {
        sessionId: f.c,
        groupSessionId: f.b,
      });
      expect(await f.groupOf(f.c)).toBe(groupId);
    },
    TIMEOUT_MS,
  );

  test(
    "moves a session out of its old group, which dissolves at one member",
    async () => {
      const f = await fixture();
      await f.asUser.mutation(api.sessions.addToGroup, {
        sessionId: f.b,
        groupSessionId: f.a,
      });
      const oldGroupId = await f.groupOf(f.a);

      await f.asUser.mutation(api.sessions.addToGroup, {
        sessionId: f.b,
        groupSessionId: f.c,
      });
      expect(await f.groupOf(f.a)).toBeUndefined();
      expect(await f.groupOf(f.b)).toBe(await f.groupOf(f.c));
      expect(await f.groupOf(f.b)).not.toBe(oldGroupId);
      if (oldGroupId) {
        expect(await f.t.run((ctx) => ctx.db.get(oldGroupId))).toBeNull();
      }
    },
    TIMEOUT_MS,
  );

  /**
   * Without the same-group early return, re-adding leaves the group first: a
   * two-member group dissolves, and the session is then patched onto the
   * deleted group id still held by the stale anchor doc.
   */
  test(
    "re-adding a session to the group it is already in keeps the group",
    async () => {
      const f = await fixture();
      await f.asUser.mutation(api.sessions.addToGroup, {
        sessionId: f.b,
        groupSessionId: f.a,
      });
      const groupId = await f.groupOf(f.a);
      expect(groupId).toBeDefined();

      await f.asUser.mutation(api.sessions.addToGroup, {
        sessionId: f.b,
        groupSessionId: f.a,
      });
      expect(await f.groupOf(f.a)).toBe(groupId);
      expect(await f.groupOf(f.b)).toBe(groupId);
      if (groupId) {
        expect(await f.t.run((ctx) => ctx.db.get(groupId))).not.toBeNull();
      }
    },
    TIMEOUT_MS,
  );

  test(
    "rejects adding a session to its own group",
    async () => {
      const f = await fixture();
      await expect(
        f.asUser.mutation(api.sessions.addToGroup, {
          sessionId: f.a,
          groupSessionId: f.a,
        }),
      ).rejects.toThrow("cannot join its own group");
    },
    TIMEOUT_MS,
  );
});
