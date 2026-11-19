import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { SANDBOX_DELETE_GRACE_MS } from "./_sandbox/vercelSnapshotOptions";
import {
  clearDeletedSessionSandbox,
  isSessionArchived,
  sessionDeleteAfter,
} from "./_sessions/archive";

const SWEEP_BATCH_SIZE = 16;
const DELETE_STAGGER_MS = 2000;

function pastGrace(
  now: number,
  sandboxDeleteAfter: number | undefined,
  updatedAt: number | undefined,
): boolean {
  if (sandboxDeleteAfter !== undefined && now < sandboxDeleteAfter) {
    return false;
  }
  if (updatedAt !== undefined && now - updatedAt < SANDBOX_DELETE_GRACE_MS) {
    return false;
  }
  return true;
}

/**
 * Fired 48h after archive — deletes the sandbox if still archived + due. An
 * unarchived session has no delete time left, so it is skipped.
 */
export const maybeDeleteSessionSandbox = internalMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    const deleteAfter = sessionDeleteAfter(session);
    if (deleteAfter === undefined) return null;
    if (Date.now() < deleteAfter) return null;
    if (!session.sandboxId) return null;
    if (session.status !== "closed") return null;

    await ctx.scheduler.runAfter(0, internal.sandbox.deleteSandbox, {
      sandboxId: session.sandboxId,
      repoId: session.repoId,
    });
    await clearDeletedSessionSandbox(ctx, session);
    return null;
  },
});

/**
 * One-off backlog sweep + weekly cron body. Deletes the sandboxes of archived
 * sessions whose grace has elapsed (a task's or project's sandbox is its
 * session's).
 *
 * Pass `{ skipGrace: true }` for an immediate one-off backlog clear (ignores
 * the 48h updatedAt / delete-after guards). Weekly cron leaves it unset.
 */
export const sweepDeadSandboxes = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    deleted: v.optional(v.number()),
    skipGrace: v.optional(v.boolean()),
  },
  returns: v.object({ deleted: v.number(), done: v.boolean() }),
  handler: async (ctx, args) => {
    let deleted = args.deleted ?? 0;
    const now = Date.now();
    const skipGrace = args.skipGrace === true;

    const page = await ctx.db.query("sessions").paginate({
      cursor: args.cursor ?? null,
      numItems: SWEEP_BATCH_SIZE,
    });

    let staggerIndex = 0;
    for (const session of page.page) {
      if (!session.sandboxId) continue;
      if (!isSessionArchived(session)) continue;
      // Normal sweeps wait for closed (stop finished). skipGrace one-offs
      // also clear stopping/active leftovers that still bill for snapshots.
      if (!skipGrace && session.status !== "closed") continue;
      if (
        !skipGrace &&
        !pastGrace(now, sessionDeleteAfter(session), session.updatedAt)
      ) {
        continue;
      }

      const sandboxId = session.sandboxId;
      await ctx.scheduler.runAfter(
        staggerIndex * DELETE_STAGGER_MS,
        internal.sandbox.deleteSandbox,
        { sandboxId, repoId: session.repoId },
      );
      await clearDeletedSessionSandbox(ctx, session);
      deleted += 1;
      staggerIndex += 1;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.sandboxCleanup.sweepDeadSandboxes, {
        cursor: page.continueCursor,
        deleted,
        skipGrace,
      });
      return { deleted, done: false };
    }

    console.log(
      `[sandboxCleanup] sweepDeadSandboxes done: deleted=${deleted} skipGrace=${skipGrace}`,
    );
    return { deleted, done: true };
  },
});

const CANDIDATE_BATCH = 16;

const liveCandidateValidator = v.object({
  kind: v.literal("session"),
  entityId: v.string(),
  sandboxId: v.string(),
  repoId: v.id("githubRepos"),
});

/**
 * Paginated live session sandboxes (survivors after death-signal deletes) for
 * the one-off retention bulk pass.
 */
export const listLiveSandboxCandidates = internalQuery({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    candidates: v.array(liveCandidateValidator),
    continueCursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("sessions").paginate({
      cursor: args.cursor ?? null,
      numItems: CANDIDATE_BATCH,
    });
    const candidates = page.page.flatMap((session) =>
      session.sandboxId && !isSessionArchived(session)
        ? [
            {
              kind: "session" as const,
              entityId: String(session._id),
              sandboxId: session.sandboxId,
              repoId: session.repoId,
            },
          ]
        : [],
    );
    return {
      candidates,
      continueCursor: page.isDone ? null : page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/** Count sessions that still hold a sandboxId (prod runbook / progress). */
export const countDeadSandboxes = internalQuery({
  args: {},
  returns: v.object({
    sessionDeadWithSandbox: v.number(),
    sessionAnyWithSandbox: v.number(),
  }),
  handler: async (ctx) => {
    let sessionDeadWithSandbox = 0;
    let sessionAnyWithSandbox = 0;
    const allSessions = await ctx.db.query("sessions").collect();
    for (const session of allSessions) {
      if (!session.sandboxId) continue;
      sessionAnyWithSandbox++;
      if (isSessionArchived(session)) sessionDeadWithSandbox++;
    }
    return { sessionDeadWithSandbox, sessionAnyWithSandbox };
  },
});

/** Repo ids for project-wide snapshot tombstone sweeps. */
export const listGithubRepoIds = internalQuery({
  args: {},
  returns: v.array(v.id("githubRepos")),
  handler: async (ctx) => {
    const repos = await ctx.db.query("githubRepos").collect();
    return repos.map((repo) => repo._id);
  },
});
