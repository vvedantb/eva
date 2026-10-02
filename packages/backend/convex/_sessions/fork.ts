import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { collectSessionForkPrefix, formatForkPrompt } from "@eva/shared";
import {
  getSessionWithAccess,
  internalAuthMutation,
  internalAuthQuery,
} from "../functions";
import { sessionStatusValidator } from "../validators";
import { sessionHasOpenTurn } from "../_chat/turnProjection";
import { createSession } from "./mutations";
import { requestSessionSandboxStart } from "./sandbox";

/** Recent messages read for the fork transcript; the prompt budget is far smaller. */
const FORK_MESSAGE_WINDOW = 200;

/** What `forkSession` needs to know about the source before touching its sandbox. */
export const getForkSource = internalAuthQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.object({
    repoId: v.id("githubRepos"),
    sandboxId: v.optional(v.string()),
    status: sessionStatusValidator,
    hasOpenTurn: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const session = await getSessionWithAccess(
      ctx.db,
      args.sessionId,
      ctx.userId,
    );
    return {
      repoId: session.repoId,
      sandboxId: session.sandboxId,
      status: session.status,
      hasOpenTurn: await sessionHasOpenTurn(ctx.db, args.sessionId),
    };
  },
});

/**
 * Creates the fork: same repo, base, linked repos and composer traits as the
 * source, the transcript as its first message, and the source sandbox to
 * fork for its first sandbox.
 */
export const createForkedSession = internalAuthMutation({
  args: {
    sourceSessionId: v.id("sessions"),
    sourceSandboxId: v.string(),
    restartSource: v.boolean(),
  },
  returns: v.object({ numId: v.number() }),
  handler: async (ctx, args) => {
    const source = await getSessionWithAccess(
      ctx.db,
      args.sourceSessionId,
      ctx.userId,
    );
    const recent = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", args.sourceSessionId))
      .order("desc")
      .take(FORK_MESSAGE_WINDOW);
    const prefix = collectSessionForkPrefix(
      recent.reverse().map((message) => ({
        id: message._id,
        role: message.role,
        content: message.content,
        isSystemAlert: message.isSystemAlert,
      })),
    );
    const linkedRepos = await ctx.db
      .query("sessionRepos")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sourceSessionId))
      .collect();
    // A group deleted since the source was created would fail validation.
    const repoGroup = source.repoGroupId
      ? await ctx.db.get(source.repoGroupId)
      : null;
    const { numId } = await createSession(
      ctx,
      {
        repoId: source.repoId,
        title: `Fork · ${source.title}`,
        ...(prefix ? { message: formatForkPrompt(prefix) } : {}),
        model: source.lastModel,
        reasoningLevel: source.lastReasoningLevel,
        thinkingEnabled: source.lastThinkingEnabled,
        use1mContext: source.lastUse1mContext,
        fastMode: source.lastFastMode,
        baseBranch: source.baseBranch,
        linkedRepoIds: linkedRepos.map((row) => row.repoId),
        ...(repoGroup ? { repoGroupId: repoGroup._id } : {}),
        installDependencies: linkedRepos.every((row) => row.installDependencies),
      },
      {
        sourceSessionId: args.sourceSessionId,
        sourceSandboxId: args.sourceSandboxId,
        restartSource: args.restartSource,
      },
    );
    return { numId };
  },
});

/**
 * Called by the fork's first boot once the Vercel fork has been taken or has
 * failed: starts the source again if `forkSession` had to stop it, and (when
 * the source sandbox turned out to be gone) drops the fork source so the next
 * Start boots the repo snapshot instead of retrying a fork that cannot work.
 */
export const settleForkSource = internalMutation({
  args: { sessionId: v.id("sessions"), sourceGone: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const fork = await ctx.db.get(args.sessionId);
    if (!fork) return null;
    if (fork.forkRestartsSource && fork.forkedFromSessionId) {
      const source = await ctx.db.get(fork.forkedFromSessionId);
      // Only a source still parked by the fork: anything else means the user
      // (or a message) already woke it, or archived it since.
      if (source && source.status === "closed" && source.sandboxId && !source.archived) {
        await requestSessionSandboxStart(ctx, source);
      }
    }
    await ctx.db.patch(args.sessionId, {
      forkRestartsSource: undefined,
      ...(args.sourceGone ? { forkSourceSandboxId: undefined } : {}),
    });
    return null;
  },
});
