import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalQuery,
  type ActionCtx,
  type QueryCtx,
} from "./_generated/server";
import { authQuery, hasRepoAccess, hasTaskAccess } from "./functions";
import { sandboxActivityKindValidator } from "./_validators/tableFields";
import { awaitSandboxActive } from "./mcp/orchestratorDelivery";

/**
 * Backend for the `/p/$kind/$id` wake link. The link carries the entity's
 * Convex id as a plain string, so everything here starts by normalising it
 * against the right table; the per-surface Start mutations and `get` queries
 * then enforce the same access policy the Eva UI does.
 */

const wakeTargetValidator = v.union(
  v.object({ kind: v.literal("session"), id: v.id("sessions") }),
  v.object({ kind: v.literal("task"), id: v.id("agentTasks") }),
  v.object({ kind: v.literal("project"), id: v.id("projects") }),
);

type WakeTarget =
  | { kind: "session"; id: Id<"sessions"> }
  | { kind: "task"; id: Id<"agentTasks"> }
  | { kind: "project"; id: Id<"projects"> };

function resolveWakeTarget(
  ctx: QueryCtx,
  kind: "session" | "task" | "project",
  id: string,
): WakeTarget | null {
  if (kind === "session") {
    const normalized = ctx.db.normalizeId("sessions", id);
    return normalized ? { kind, id: normalized } : null;
  }
  if (kind === "task") {
    const normalized = ctx.db.normalizeId("agentTasks", id);
    return normalized ? { kind, id: normalized } : null;
  }
  const normalized = ctx.db.normalizeId("projects", id);
  return normalized ? { kind, id: normalized } : null;
}

/** Internal: typed ids for the action below (actions have no `normalizeId`). */
export const resolveTarget = internalQuery({
  args: { kind: sandboxActivityKindValidator, id: v.string() },
  returns: v.union(wakeTargetValidator, v.null()),
  handler: async (ctx, args) => resolveWakeTarget(ctx, args.kind, args.id),
});

/**
 * What the wake page needs to show progress and hand off: status, the sandbox
 * to poll for readiness and the dev port. Null when the id is malformed, the
 * entity is gone, or the caller may not see it.
 */
export const getWakeTarget = authQuery({
  args: { kind: sandboxActivityKindValidator, id: v.string() },
  returns: v.union(
    v.object({
      status: v.string(),
      sandboxId: v.optional(v.string()),
      repoId: v.id("githubRepos"),
      devPort: v.optional(v.number()),
      title: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const target = resolveWakeTarget(ctx, args.kind, args.id);
    if (!target) return null;
    if (target.kind === "session") {
      const session = await ctx.db.get(target.id);
      if (!session || !(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
        return null;
      }
      return {
        status: session.status,
        sandboxId: session.sandboxId,
        repoId: session.repoId,
        devPort: session.devPort,
        title: session.title,
      };
    }
    if (target.kind === "task") {
      const task = await ctx.db.get(target.id);
      if (!task || !task.repoId || !(await hasTaskAccess(ctx.db, task, ctx.userId))) {
        return null;
      }
      return {
        status: task.reviewTaskSandboxStatus ?? "closed",
        sandboxId: task.sandboxId,
        repoId: task.repoId,
        devPort: task.devPort,
        title: task.title,
      };
    }
    const project = await ctx.db.get(target.id);
    if (!project || !(await hasRepoAccess(ctx.db, project.repoId, ctx.userId))) {
      return null;
    }
    return {
      status: project.reviewProjectSandboxStatus ?? "closed",
      sandboxId: project.sandboxId,
      repoId: project.repoId,
      devPort: project.devPort,
      title: project.title,
    };
  },
});

async function readStatus(ctx: ActionCtx, target: WakeTarget): Promise<string> {
  if (target.kind === "session") {
    const session = await ctx.runQuery(api.sessions.get, { id: target.id });
    if (!session) throw new Error("Session not found");
    return session.status;
  }
  if (target.kind === "task") {
    const task = await ctx.runQuery(api.agentTasks.get, { id: target.id });
    if (!task) throw new Error("Task not found");
    return task.reviewTaskSandboxStatus ?? "closed";
  }
  const project = await ctx.runQuery(api.projects.get, { id: target.id });
  if (!project) throw new Error("Project not found");
  return project.reviewProjectSandboxStatus ?? "closed";
}

/** The exact Start-button mutation of each surface, run as the signed-in user. */
async function start(ctx: ActionCtx, target: WakeTarget): Promise<void> {
  if (target.kind === "session") {
    await ctx.runMutation(api.sessions.startSandbox, { sessionId: target.id });
    return;
  }
  if (target.kind === "task") {
    await ctx.runMutation(api.agentTasks.startTaskSandbox, {
      taskId: target.id,
    });
    return;
  }
  await ctx.runMutation(api.projects.startProjectSandbox, {
    projectId: target.id,
  });
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Brings the entity's sandbox to `active` (starting it if paused) and returns.
 * Shares `awaitSandboxActive` with the MCP `start_sandbox` tool, so a wake from
 * a saved link follows the Start button's path, including stop/start races.
 */
export const ensureEntitySandboxActive = action({
  args: { kind: sandboxActivityKindValidator, id: v.string() },
  returns: v.object({ startRequested: v.boolean() }),
  // Explicit types: the action calls a query from its own module, and Convex's
  // inferred `internal` type would otherwise be circular (and cascade `any`).
  handler: async (ctx, args): Promise<{ startRequested: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const target: WakeTarget | null = await ctx.runQuery(
      internal.sandboxWake.resolveTarget,
      args,
    );
    if (!target) throw new Error("This preview link is not valid.");
    return await awaitSandboxActive({
      kind: target.kind,
      readStatus: () => readStatus(ctx, target),
      start: () => start(ctx, target),
      sleep,
    });
  },
});
