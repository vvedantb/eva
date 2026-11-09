import { convexTest } from "convex-test";
import presenceTest from "@convex-dev/presence/test";
import type { SandboxIdlePauseMode } from "@eva/shared";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * Team, user and app-wide settings boundaries (re-applied from #767):
 * - a team never loses its last owner, by removal or by demotion;
 * - emails and the page someone is on go only to that user's teammates;
 * - app-wide sandbox schedules are for app admins only;
 * - presence rooms for docs and typing follow the entity's access rule, and a
 *   followed path is always app-internal.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;

/** Two tenants: Ann (owner) and Ben on team A; Zed alone on team Z. */
async function fixture() {
  const t = convexTest(schema, modules);
  presenceTest.register(t);
  const ids = await t.run(async (ctx) => {
    const ann = await ctx.db.insert("users", {
      clerkId: "clerk|ann",
      email: "ann@a.example",
      firstName: "Ann",
    });
    const ben = await ctx.db.insert("users", {
      clerkId: "clerk|ben",
      email: "ben@a.example",
      firstName: "Ben",
    });
    const zed = await ctx.db.insert("users", {
      clerkId: "clerk|zed",
      email: "zed@z.example",
      firstName: "Zed",
      isAdmin: true,
    });
    const teamA = await ctx.db.insert("teams", {
      name: "A",
      createdBy: ann,
      createdAt: 0,
    });
    const teamZ = await ctx.db.insert("teams", {
      name: "Z",
      createdBy: zed,
      createdAt: 0,
    });
    await ctx.db.insert("teamMembers", {
      teamId: teamA,
      userId: ann,
      role: "owner",
      joinedAt: 0,
    });
    await ctx.db.insert("teamMembers", {
      teamId: teamA,
      userId: ben,
      role: "member",
      joinedAt: 0,
    });
    await ctx.db.insert("teamMembers", {
      teamId: teamZ,
      userId: zed,
      role: "owner",
      joinedAt: 0,
    });
    // Team A's repo, connected by Zed, who is not on team A.
    const repoA = await ctx.db.insert("githubRepos", {
      owner: "a",
      name: "app",
      installationId: 1,
      connectedBy: zed,
      teamId: teamA,
    });
    const repoZ = await ctx.db.insert("githubRepos", {
      owner: "z",
      name: "app",
      installationId: 2,
      connectedBy: zed,
      teamId: teamZ,
    });
    const now = Date.now();
    const docZ = await ctx.db.insert("docs", {
      repoId: repoZ,
      title: "Z plan",
      content: "",
      createdAt: now,
      updatedAt: now,
    });
    const taskZ = await ctx.db.insert("agentTasks", {
      repoId: repoZ,
      title: "Z task",
      status: "todo",
      createdAt: now,
      updatedAt: now,
      createdBy: zed,
    });
    return { ann, ben, zed, teamA, repoA, repoZ, docZ, taskZ };
  });
  return {
    t,
    ...ids,
    asAnn: t.withIdentity({ subject: "clerk|ann" }),
    asBen: t.withIdentity({ subject: "clerk|ben" }),
    asZed: t.withIdentity({ subject: "clerk|zed" }),
  };
}

describe("team owners", () => {
  test(
    "the last owner cannot be demoted; a second owner can be",
    async () => {
      const f = await fixture();
      await expect(
        f.asAnn.mutation(api.teamMembers.updateRole, {
          teamId: f.teamA,
          userId: f.ann,
          role: "member",
        }),
      ).rejects.toThrow("last owner");
      await f.asAnn.mutation(api.teamMembers.updateRole, {
        teamId: f.teamA,
        userId: f.ben,
        role: "owner",
      });
      await f.asAnn.mutation(api.teamMembers.updateRole, {
        teamId: f.teamA,
        userId: f.ann,
        role: "member",
      });
      await expect(
        f.asBen.mutation(api.teamMembers.remove, {
          teamId: f.teamA,
          userId: f.ben,
        }),
      ).rejects.toThrow("last owner");
    },
    TIMEOUT_MS,
  );
});

describe("directory privacy", () => {
  test(
    "listForRepo shows emails to team members, names only to the connector",
    async () => {
      const f = await fixture();
      const forBen = await f.asBen.query(api.teamMembers.listForRepo, {
        repoId: f.repoA,
      });
      expect(forBen.map((m) => m.email).sort()).toEqual([
        "ann@a.example",
        "ben@a.example",
      ]);
      const forZed = await f.asZed.query(api.teamMembers.listForRepo, {
        repoId: f.repoA,
      });
      expect(forZed).toHaveLength(2);
      expect(forZed.every((m) => m.email === undefined)).toBe(true);
    },
    TIMEOUT_MS,
  );

  test(
    "users.get keeps names for everyone; email and path only for teammates",
    async () => {
      const f = await fixture();
      await f.t.run(async (ctx) => {
        await ctx.db.insert("userPresence", {
          userId: f.ann,
          lastSeenPath: "/a/app/sessions/1",
        });
      });
      const forBen = await f.asBen.query(api.users.get, { id: f.ann });
      expect(forBen).toMatchObject({
        firstName: "Ann",
        email: "ann@a.example",
        lastSeenPath: "/a/app/sessions/1",
      });
      const forZed = await f.asZed.query(api.users.get, { id: f.ann });
      expect(forZed?.firstName).toBe("Ann");
      expect(forZed?.email).toBeUndefined();
      expect(forZed?.lastSeenPath).toBeUndefined();
      const self = await f.asZed.query(api.users.get, { id: f.zed });
      expect(self?.email).toBe("zed@z.example");
    },
    TIMEOUT_MS,
  );
});

describe("app-wide sandbox settings", () => {
  test(
    "only an app admin changes auto-stop and idle pause; anyone can read",
    async () => {
      const f = await fixture();
      const autoStop = { enabled: true, time: "03:00", timeZone: "UTC" };
      const idlePause: {
        mode: SandboxIdlePauseMode;
        afterAgentMinutes: number;
        afterInteractionMinutes: number;
      } = {
        mode: "on",
        afterAgentMinutes: 5,
        afterInteractionMinutes: 5,
      };
      await expect(
        f.asAnn.mutation(
          api.sandboxAutoStop.setSandboxAutoStopSettings,
          autoStop,
        ),
      ).rejects.toThrow("app admins");
      await expect(
        f.asAnn.mutation(
          api.sandboxIdlePause.setSandboxIdlePauseSettings,
          idlePause,
        ),
      ).rejects.toThrow("app admins");
      await f.asZed.mutation(
        api.sandboxAutoStop.setSandboxAutoStopSettings,
        autoStop,
      );
      await f.asZed.mutation(
        api.sandboxIdlePause.setSandboxIdlePauseSettings,
        idlePause,
      );
      expect(
        await f.asAnn.query(api.sandboxAutoStop.getSandboxAutoStopSettings),
      ).toEqual(autoStop);
    },
    TIMEOUT_MS,
  );
});

describe("presence", () => {
  const heartbeat = (roomId: string, userId: string) => ({
    roomId,
    userId,
    sessionId: `session-${roomId}`,
    interval: 10_000,
  });

  test(
    "doc and typing rooms of another team are refused; own rooms work",
    async () => {
      const f = await fixture();
      for (const roomId of [
        `doc:${f.docZ}`,
        `typing:task:${f.taskZ}`,
        `typing:chat:${f.taskZ}`,
        `typing:chat:new-session-${f.repoZ}`,
        "typing:unknown:x",
      ]) {
        await expect(
          f.asBen.mutation(api.presence.heartbeat, heartbeat(roomId, f.ben)),
          roomId,
        ).rejects.toThrow();
      }
      await expect(
        f.asBen.mutation(api.presence.updateTyping, {
          roomId: `doc:${f.docZ}`,
          isTyping: true,
        }),
      ).rejects.toThrow("Not authorized");

      for (const roomId of [
        `doc:${f.docZ}`,
        `typing:task:${f.taskZ}`,
        `typing:chat:${f.taskZ}`,
        "platform",
      ]) {
        await f.asZed.mutation(
          api.presence.heartbeat,
          heartbeat(roomId, f.zed),
        );
      }
      await f.asBen.mutation(
        api.presence.heartbeat,
        heartbeat(`typing:chat:new-session-${f.repoA}`, f.ben),
      );
    },
    TIMEOUT_MS,
  );

  test(
    "updatePath accepts app paths and refuses anything a follower could be sent off-app by",
    async () => {
      const f = await fixture();
      await f.asBen.mutation(api.presence.updatePath, {
        path: "/a/app/docs/3",
      });
      for (const path of [
        "//evil.example",
        "https://evil.example",
        "/\\evil.example",
        "javascript:alert(1)",
        "/a\nb",
      ]) {
        await expect(
          f.asBen.mutation(api.presence.updatePath, { path }),
          path,
        ).rejects.toThrow("Invalid path");
      }
    },
    TIMEOUT_MS,
  );
});
