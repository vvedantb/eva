import { v, type Infer } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalQuery,
  type ActionCtx,
  type QueryCtx,
} from "./_generated/server";
import { authQuery, hasRepoAccess } from "./functions";
import { chatEntityKindValidator } from "./_validators/enums";
import { awaitSandboxActive } from "./mcp/orchestratorDelivery";
import { sleep } from "./_shared/async";
import {
  findOwnedSession,
  ownedSessionOwnerValidator,
  workSessionOwner,
  type OwnedSessionOwner,
} from "./_sessions/owner";
import { loadOwnerEntityWithAccess } from "./_sessions/queries";

/**
 * Backend for the `/p/$kind/$id` wake link. The link carries the entity's
 * Convex id as a plain string, so everything here starts by normalising it
 * against the right table; the per-surface Start mutations and `get` queries
 * then enforce the same access policy the Eva UI does.
 */

const wakeTargetValidator = v.union(
  v.object({ kind: v.literal("session"), id: v.id("sessions") }),
  v.object({ kind: v.literal("owner"), owner: ownedSessionOwnerValidator }),
);

/**
 * A session, or a task or project whose session does not exist yet (the
 * wake creates it through `sessions.ensureOwned`, then starts it).
 */
type WakeTarget = Infer<typeof wakeTargetValidator>;

async function resolveWakeTarget(
  ctx: QueryCtx,
  kind: "session" | "task" | "project",
  id: string,
): Promise<WakeTarget | null> {
  if (kind === "session") {
    const normalized = ctx.db.normalizeId("sessions", id);
    return normalized ? { kind, id: normalized } : null;
  }
  if (kind === "task") {
    const normalized = ctx.db.normalizeId("agentTasks", id);
    const task = normalized ? await ctx.db.get(normalized) : null;
    if (!task) return null;
    // A task's sandbox is its session's (a project task's: the project's).
    return await wakeOwnerTarget(ctx, workSessionOwner(task));
  }
  const normalized = ctx.db.normalizeId("projects", id);
  if (!normalized) return null;
  // A project's sandbox is its session's.
  return await wakeOwnerTarget(ctx, { kind: "project", projectId: normalized });
}

/** The owner's session, or the owner itself before its session exists. */
async function wakeOwnerTarget(
  ctx: QueryCtx,
  owner: OwnedSessionOwner,
): Promise<WakeTarget> {
  const session = await findOwnedSession(ctx.db, owner);
  return session
    ? { kind: "session", id: session._id }
    : { kind: "owner", owner };
}

/** Internal: typed ids for the action below (actions have no `normalizeId`). */
export const resolveTarget = internalQuery({
  args: { kind: chatEntityKindValidator, id: v.string() },
  returns: v.union(wakeTargetValidator, v.null()),
  handler: async (ctx, args) =>
    await resolveWakeTarget(ctx, args.kind, args.id),
});

/**
 * What the wake page needs to show progress and hand off: status, the sandbox
 * to poll for readiness and the dev port. Null when the id is malformed, the
 * entity is gone, or the caller may not see it. A task or project without a
 * session yet reads as closed.
 */
export const getWakeTarget = authQuery({
  args: { kind: chatEntityKindValidator, id: v.string() },
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
    const target = await resolveWakeTarget(ctx, args.kind, args.id);
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
    const entity = await loadOwnerEntityWithAccess(
      ctx.db,
      target.owner,
      ctx.userId,
    );
    if (!entity) return null;
    const doc = entity.kind === "task" ? entity.task : entity.project;
    if (!doc.repoId) return null;
    return { status: "closed", repoId: doc.repoId, title: doc.title };
  },
});

/** The session behind a wake target, created for an owner that has none yet. */
async function wakeSessionId(
  ctx: ActionCtx,
  target: WakeTarget,
): Promise<Id<"sessions">> {
  if (target.kind === "session") return target.id;
  const { sessionId } = await ctx.runMutation(api.sessions.ensureOwned, {
    owner: target.owner,
  });
  return sessionId;
}

async function readStatus(
  ctx: ActionCtx,
  sessionId: Id<"sessions">,
): Promise<string> {
  const session = await ctx.runQuery(api.sessions.get, { id: sessionId });
  if (!session) throw new Error("Session not found");
  return session.status;
}

/**
 * Brings the entity's sandbox to `active` (starting it if paused) and returns.
 * Shares `awaitSandboxActive` with the MCP `start_sandbox` tool, so a wake from
 * a saved link follows the Start button's path, including stop/start races.
 */
export const ensureEntitySandboxActive = action({
  args: { kind: chatEntityKindValidator, id: v.string() },
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
    const sessionId = await wakeSessionId(ctx, target);
    return await awaitSandboxActive({
      kind: "session",
      readStatus: () => readStatus(ctx, sessionId),
      // The session's Start button, run as the signed-in user.
      start: async () => {
        await ctx.runMutation(api.sessions.startSandbox, { sessionId });
      },
      sleep,
    });
  },
});
