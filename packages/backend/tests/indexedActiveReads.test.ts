import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * Bandwidth fix a1146b42 moved the sandbox sweeps and the sidebar's extra-chat
 * list from full scans plus a filter onto status indexes. Both failure modes
 * are silent: a sweep that misses a live sandbox leaks a VM, and an index
 * range that misses `archived: undefined` hides every chat that never had the
 * field written.
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|indexed-active-reads";

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
    return { userId, repoId };
  });
  return { t, asUser: t.withIdentity({ subject: CLERK_ID }), ...ids };
}

describe("sessionChats.listExtraForRepo", () => {
  test(
    "returns open non-Main chats whether archived is unset or false",
    async () => {
      const f = await fixture();
      await f.t.run(async (ctx) => {
        const sessionId = await ctx.db.insert("sessions", {
          repoId: f.repoId,
          userId: f.userId,
          title: "Chats",
          status: "active",
        });
        const chat = (
          title: string,
          number: number,
          isMain: boolean,
          archived?: boolean,
        ) =>
          ctx.db.insert("sessionChats", {
            sessionId,
            repoId: f.repoId,
            userId: f.userId,
            title,
            number,
            isMain,
            ...(archived === undefined ? {} : { archived }),
          });
        await chat("Main", 1, true);
        await chat("Open, explicit", 3, false, false);
        await chat("Open, never set", 2, false);
        await chat("Closed", 4, false, true);
      });

      const chats = await f.asUser.query(api.sessionChats.listExtraForRepo, {
        repoId: f.repoId,
      });
      expect(chats.map((chat) => chat.title)).toEqual([
        "Open, never set",
        "Open, explicit",
      ]);
    },
    TIMEOUT_MS,
  );
});

describe("active sandbox sweeps", () => {
  test(
    "find every active sandbox across sessions, tasks and projects, and nothing else",
    async () => {
      const f = await fixture();
      const ids = await f.t.run(async (ctx) => {
        const now = Date.now();
        const session = (
          title: string,
          status: "active" | "closed",
          sandboxId?: string,
        ) =>
          ctx.db.insert("sessions", {
            repoId: f.repoId,
            userId: f.userId,
            title,
            status,
            ...(sandboxId === undefined ? {} : { sandboxId }),
          });
        const task = (
          title: string,
          reviewTaskSandboxStatus: "active" | "closed",
          sandboxId?: string,
        ) =>
          ctx.db.insert("agentTasks", {
            title,
            status: "business_review",
            repoId: f.repoId,
            reviewTaskSandboxStatus,
            createdAt: now,
            updatedAt: now,
            createdBy: f.userId,
            ...(sandboxId === undefined ? {} : { sandboxId }),
          });
        const project = (
          title: string,
          reviewProjectSandboxStatus: "active" | "closed",
          sandboxId?: string,
        ) =>
          ctx.db.insert("projects", {
            repoId: f.repoId,
            userId: f.userId,
            title,
            phase: "in_progress",
            rawInput: title,
            updatedAt: now,
            reviewProjectSandboxStatus,
            ...(sandboxId === undefined ? {} : { sandboxId }),
          });

        const liveSession = await session("Live", "active", "sbx-session");
        await session("Closed", "closed", "sbx-session-old");
        await session("Active, no sandbox yet", "active");
        const liveTask = await task("Live", "active", "sbx-task");
        await task("Closed", "closed", "sbx-task-old");
        await task("Active, no sandbox yet", "active");
        const liveProject = await project("Live", "active", "sbx-project");
        await project("Closed", "closed", "sbx-project-old");
        await project("Active, no sandbox yet", "active");
        return { liveSession, liveTask, liveProject };
      });

      const sweep = await f.t.query(
        internal.sandboxAutoStop.listActiveSandboxes,
      );
      expect(sweep).toEqual({
        sessionIds: [ids.liveSession],
        taskIds: [ids.liveTask],
        projectIds: [ids.liveProject],
      });

      const entities = await f.t.query(
        internal.sandboxDaemon.listActiveSandboxEntities,
      );
      expect(
        entities.toSorted((a, b) => a.sandboxId.localeCompare(b.sandboxId)),
      ).toEqual([
        {
          entityTable: "projects",
          entityId: String(ids.liveProject),
          sandboxId: "sbx-project",
          repoId: f.repoId,
        },
        {
          entityTable: "sessions",
          entityId: String(ids.liveSession),
          sandboxId: "sbx-session",
          repoId: f.repoId,
        },
        {
          entityTable: "agentTasks",
          entityId: String(ids.liveTask),
          sandboxId: "sbx-task",
          repoId: f.repoId,
        },
      ]);
    },
    TIMEOUT_MS,
  );
});
