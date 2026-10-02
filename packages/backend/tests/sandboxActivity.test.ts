import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import {
  getSandboxActivity,
  touchAgentFinished,
  touchUserActivity,
} from "../convex/_sandbox/activity";
import { ACTIVITY_TOUCH_MIN_INTERVAL_MS } from "../convex/_sandbox/idlePolicy";

/**
 * `sandboxActivity` is the idle-pause sweep's memory of "someone touched this
 * entity". It is written from hot paths (every message send, every preview
 * poll), so the throttle and the sandbox-id reverse lookup both matter.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: "clerk|idle" });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const now = Date.now();
    const sessionId = await ctx.db.insert("sessions", {
      repoId,
      userId,
      title: "Idle session",
      status: "active",
      sandboxId: "sbx-session",
    });
    const taskId = await ctx.db.insert("agentTasks", {
      repoId,
      title: "Idle task",
      status: "code_review",
      sandboxId: "sbx-task",
      reviewTaskSandboxStatus: "active",
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId,
      title: "Idle project",
      phase: "in_progress",
      rawInput: "idle",
      updatedAt: now,
      sandboxId: "sbx-project",
      reviewProjectSandboxStatus: "active",
    });
    return { sessionId, taskId, projectId };
  });
  return { t, ...ids };
}

describe("sandbox activity record", () => {
  test(
    "a second touch inside the interval is a read-only no-op",
    async () => {
      const { t, sessionId } = await fixture();
      const ref = { kind: "session" as const, entityId: String(sessionId) };
      const first = 1_000_000;
      await t.run((ctx) => touchUserActivity(ctx, ref, first));
      await t.run((ctx) =>
        touchUserActivity(ctx, ref, first + ACTIVITY_TOUCH_MIN_INTERVAL_MS - 1),
      );
      const held = await t.run((ctx) => getSandboxActivity(ctx.db, ref));
      expect(held?.lastUserActivityAt).toBe(first);

      await t.run((ctx) =>
        touchUserActivity(ctx, ref, first + ACTIVITY_TOUCH_MIN_INTERVAL_MS),
      );
      const advanced = await t.run((ctx) => getSandboxActivity(ctx.db, ref));
      expect(advanced?.lastUserActivityAt).toBe(
        first + ACTIVITY_TOUCH_MIN_INTERVAL_MS,
      );
    },
    TIMEOUT_MS,
  );

  test(
    "user and agent timestamps live on one row and do not clobber each other",
    async () => {
      const { t, taskId } = await fixture();
      const ref = { kind: "task" as const, entityId: String(taskId) };
      await t.run((ctx) => touchUserActivity(ctx, ref, 10));
      await t.run((ctx) => touchAgentFinished(ctx, ref, 20));
      const rows = await t.run((ctx) =>
        ctx.db.query("sandboxActivity").collect(),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.lastUserActivityAt).toBe(10);
      expect(rows[0]?.lastAgentFinishedAt).toBe(20);
    },
    TIMEOUT_MS,
  );

  test(
    "touchBySandbox resolves a session, a project and a task by sandbox id",
    async () => {
      const { t, sessionId, taskId, projectId } = await fixture();
      for (const sandboxId of ["sbx-session", "sbx-task", "sbx-project"]) {
        await t.mutation(internal._sandbox.activity.touchBySandbox, {
          sandboxId,
        });
      }
      const rows = await t.run((ctx) =>
        ctx.db.query("sandboxActivity").collect(),
      );
      const byEntity = new Map(rows.map((row) => [row.entityId, row.kind]));
      expect(byEntity.get(String(sessionId))).toBe("session");
      expect(byEntity.get(String(taskId))).toBe("task");
      expect(byEntity.get(String(projectId))).toBe("project");
    },
    TIMEOUT_MS,
  );

  test(
    "an unknown sandbox id writes nothing",
    async () => {
      const { t } = await fixture();
      await t.mutation(internal._sandbox.activity.touchBySandbox, {
        sandboxId: "sbx-gone",
      });
      const rows = await t.run((ctx) =>
        ctx.db.query("sandboxActivity").collect(),
      );
      expect(rows).toEqual([]);
    },
    TIMEOUT_MS,
  );
});
