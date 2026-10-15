import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import {
  getSessionWithAccess,
  internalAuthMutation,
  internalAuthQuery,
} from "../functions";
import { sessionStatusValidator } from "../validators";
import { hasOpenChatTurn } from "../_chat/turnProjection";
import { findMainChat } from "../_sessionChats/helpers";
import { createSession } from "./mutations";
import { requestSessionSandboxStart } from "./sandbox";

/** What `forkSession` needs to know about the source before touching its sandbox. */
export const getForkSource = internalAuthQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.object({
    repoId: v.id("githubRepos"),
    repo: v.object({
      owner: v.string(),
      name: v.string(),
      installationId: v.number(),
    }),
    branchName: v.optional(v.string()),
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
    const repo = await ctx.db.get(session.repoId);
    if (!repo) throw new Error("Repository not found");
    return {
      repoId: session.repoId,
      repo: {
        owner: repo.owner,
        name: repo.name,
        installationId: repo.installationId,
      },
      branchName: session.branchName,
      sandboxId: session.sandboxId,
      status: session.status,
      hasOpenTurn: await hasOpenChatTurn(ctx.db, args.sessionId),
    };
  },
});

/**
 * Creates the fork: same repo, linked repos, composer traits and Plan tab as
 * the source, and the source sandbox to fork for its first sandbox.
 *
 * The fork stacks on the source like a stacked PR: its base is the source's
 * branch, so its first boot cuts the fork branch from the source branch tip
 * (the source's commits come along) and its PR targets the source branch.
 * `stackOnSource` is false when the source branch is not on GitHub — nothing
 * was ever pushed, or the branch was deleted after its PR merged — and the
 * fork then uses the source's own base, the only valid PR base left.
 *
 * The transcript is not copied: the forked disk already holds the agent's
 * persisted conversation, which the fork's first turn resumes. The fork's
 * Main chat opens with one "Forked from" system alert instead.
 */
export const createForkedSession = internalAuthMutation({
  args: {
    sourceSessionId: v.id("sessions"),
    sourceSandboxId: v.string(),
    restartSource: v.boolean(),
    stackOnSource: v.boolean(),
  },
  returns: v.object({ sessionId: v.id("sessions"), numId: v.number() }),
  handler: async (ctx, args) => {
    const source = await getSessionWithAccess(
      ctx.db,
      args.sourceSessionId,
      ctx.userId,
    );
    const linkedRepos = await ctx.db
      .query("sessionRepos")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sourceSessionId))
      .collect();
    // A group deleted since the source was created would fail validation.
    const repoGroup = source.repoGroupId
      ? await ctx.db.get(source.repoGroupId)
      : null;
    // Composer picks live on the chat; the fork's Main chat inherits Main's.
    const picks = (await findMainChat(ctx.db, source._id)) ?? source;
    const { sessionId, numId } = await createSession(
      ctx,
      {
        repoId: source.repoId,
        title: `Fork · ${source.title}`,
        model: picks.lastModel,
        reasoningLevel: picks.lastReasoningLevel,
        thinkingEnabled: picks.lastThinkingEnabled,
        use1mContext: picks.lastUse1mContext,
        fastMode: picks.lastFastMode,
        baseBranch:
          args.stackOnSource && source.branchName
            ? source.branchName
            : source.baseBranch,
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
    await ctx.db.patch(sessionId, {
      ...(source.planContent !== undefined
        ? { planContent: source.planContent }
        : {}),
      ...(source.lastInteractionMode !== undefined
        ? { lastInteractionMode: source.lastInteractionMode }
        : {}),
    });
    const mainChat = await findMainChat(ctx.db, sessionId);
    if (!mainChat) throw new Error("Fork main chat not found");
    await ctx.db.insert("messages", {
      parentId: mainChat._id,
      role: "assistant",
      content:
        source.numId === undefined
          ? `Forked from ${source.title}`
          : `Forked from session #${source.numId} · ${source.title}`,
      timestamp: Date.now(),
      isSystemAlert: true,
    });
    return { sessionId, numId };
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
