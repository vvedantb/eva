import { v, type Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";
import { authMutation, authQuery } from "../functions";
import { rejectSandboxCaller } from "../_auth/sandboxIdentity";
import { sessionStatusValidator } from "../_validators/enums";
import { entityVisible } from "../numId";
import {
  archiveSessionDoc,
  createSession,
  type AuthMutationCtx,
} from "./mutations";

/** Title of the persistent per-user orchestrator session. */
const ORCHESTRATOR_SESSION_TITLE = "Manager Ave";

/**
 * Everything the client needs to route to the master session. The master lives
 * in the normal session UI, so this is a pointer (repo + numId), not the doc.
 */
const orchestratorSessionValidator = v.object({
  sessionId: v.id("sessions"),
  numId: v.number(),
  owner: v.string(),
  name: v.string(),
  rootDirectory: v.optional(v.string()),
  /** Sandbox lifecycle state. The rail entry shows it, since the orchestrator is
   * excluded from the sessions list and its badges. */
  status: sessionStatusValidator,
});

/**
 * Resolves the user's master session pointer, or null when it was never
 * created, was deleted/archived, or has no repo to route through.
 */
async function resolveOrchestratorSession(
  db: DatabaseReader,
  userId: Id<"users">,
) {
  const user = await db.get(userId);
  if (!user?.orchestratorSessionId) return null;
  const session = entityVisible(await db.get(user.orchestratorSessionId));
  if (!session || session.archived === true) return null;
  // A session without a numId has no URL, so it cannot be the master.
  if (session.numId === undefined) return null;
  const repo = await db.get(session.repoId);
  if (!repo) return null;
  return {
    sessionId: session._id,
    numId: session.numId,
    owner: repo.owner,
    name: repo.name,
    rootDirectory: repo.rootDirectory,
    status: session.status,
  };
}

/**
 * Creates the user's master session in `repoId` and points them at it.
 *
 * `createSession` owns the repo access check, the branch, and the sandbox
 * startup workflow, so both the first-run path and the reset path get an
 * identical session — only one of them may hold the pointer at a time.
 */
async function createOrchestratorSession(
  ctx: AuthMutationCtx,
  repoId: Id<"githubRepos">,
): Promise<Infer<typeof orchestratorSessionValidator>> {
  const { sessionId, numId } = await createSession(ctx, {
    repoId,
    title: ORCHESTRATOR_SESSION_TITLE,
    isOrchestrator: true,
  });
  await ctx.db.patch(ctx.userId, { orchestratorSessionId: sessionId });
  const repo = await ctx.db.get(repoId);
  if (!repo) throw new Error("Repository not found");
  return {
    sessionId,
    numId,
    owner: repo.owner,
    name: repo.name,
    rootDirectory: repo.rootDirectory,
    // Freshly created: its sandbox is still starting.
    status: "starting" as const,
  };
}

/** The user's master session, or null when they do not have a live one. */
export const getOrchestratorSession = authQuery({
  args: {},
  returns: v.union(orchestratorSessionValidator, v.null()),
  handler: async (ctx) => await resolveOrchestratorSession(ctx.db, ctx.userId),
});

/**
 * Returns the user's live master session, creating one in `repoId` when it is
 * missing (never created, deleted, or archived). A replacement master repoints
 * the user at the new session — there is only ever one.
 */
export const ensureOrchestratorSession = authMutation({
  args: { repoId: v.id("githubRepos") },
  returns: orchestratorSessionValidator,
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const existing = await resolveOrchestratorSession(ctx.db, ctx.userId);
    if (existing) return existing;
    // The old pointer could not serve (archived, or its home repo is gone) but
    // the row may still exist and still be flagged. Strip the flag before
    // creating the replacement so exactly one session is ever the
    // orchestrator — otherwise the sessions list shows two marked rows and
    // `list_agents` hides both from the fleet.
    const user = await ctx.db.get(ctx.userId);
    const stale = user?.orchestratorSessionId
      ? await ctx.db.get(user.orchestratorSessionId)
      : null;
    if (stale?.isOrchestrator === true) {
      await ctx.db.patch(stale._id, { isOrchestrator: undefined });
    }
    return await createOrchestratorSession(ctx, args.repoId);
  },
});

/**
 * Starts Manager Ave over: retires the current master and creates a
 * replacement in the same home codebase, returning the new pointer.
 *
 * Deliberately a new session rather than a message wipe. The agent's memory is
 * not the `messages` rows the UI renders — it is the provider transcript on the
 * sandbox, keyed off a UUID derived from the session id (`sessionClaudeUuid`).
 * Clearing messages alone would leave Ave answering from a conversation the
 * user can no longer see. A new id is the only reset that is provider-agnostic
 * (Claude transcript, Cursor thread, Codex/OpenCode state all key off it) and
 * needs no reach into the sandbox filesystem.
 *
 * The old chat is archived, not deleted, so it stays readable at its own URL.
 * Children it was watching lose their supervisor: `orchestratorNotify` sees the
 * archived master and drops the watch rather than waking the new one.
 */
export const resetOrchestratorSession = authMutation({
  args: {},
  returns: orchestratorSessionValidator,
  handler: async (ctx) => {
    await rejectSandboxCaller(ctx);
    const existing = await resolveOrchestratorSession(ctx.db, ctx.userId);
    if (!existing) throw new Error("No Manager Ave chat to reset");
    const previous = await ctx.db.get(existing.sessionId);
    if (!previous) throw new Error("No Manager Ave chat to reset");
    await archiveSessionDoc(ctx, previous);
    // Exactly one row may carry the flag, otherwise the sessions list shows two
    // marked rows and `list_agents` hides both from the fleet.
    await ctx.db.patch(previous._id, { isOrchestrator: undefined });
    return await createOrchestratorSession(ctx, previous.repoId);
  },
});
