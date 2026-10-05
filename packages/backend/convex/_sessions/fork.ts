import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import {
  getSessionWithAccess,
  internalAuthMutation,
  internalAuthQuery,
} from "../functions";
import { sessionStatusValidator } from "../validators";
import { sessionHasOpenTurn } from "../_chat/turnProjection";
import { createSession } from "./mutations";
import { requestSessionSandboxStart } from "./sandbox";

/**
 * Messages copied per mutation. `activityLog` can run to tens of KB a row, so
 * a page stays well under the transaction write limit.
 */
const FORK_COPY_PAGE = 40;

/** A copied message: the source row id and its copy in the fork. */
const forkMessagePairValidator = v.object({
  from: v.id("messages"),
  to: v.id("messages"),
});

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
 * Creates the fork: same repo, base, linked repos, composer traits and Plan
 * tab as the source, and the source sandbox to fork for its first sandbox.
 * The transcript is copied afterwards by `copyForkMessages` pages, so the
 * fork never carries a first message of its own: the forked disk already
 * holds the agent's persisted conversation, which its first turn resumes.
 */
export const createForkedSession = internalAuthMutation({
  args: {
    sourceSessionId: v.id("sessions"),
    sourceSandboxId: v.string(),
    restartSource: v.boolean(),
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
    const { sessionId, numId } = await createSession(
      ctx,
      {
        repoId: source.repoId,
        title: `Fork · ${source.title}`,
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
    await ctx.db.patch(sessionId, {
      ...(source.planContent !== undefined
        ? { planContent: source.planContent }
        : {}),
      ...(source.lastInteractionMode !== undefined
        ? { lastInteractionMode: source.lastInteractionMode }
        : {}),
    });
    return { sessionId, numId };
  },
});

/**
 * Copies one page of the source transcript into the fork, in order. Rows copy
 * verbatim — `model` checkpoints stay truthful because the forked disk holds
 * the agent's thread, `afterSha` checkpoints exist in the forked git, storage
 * ids are safe to share because nothing deletes message media — except:
 * - `clientId`, the optimistic-update key, so a copy never matches a pending
 *   local row;
 * - `pendingQuestion`, a live round-trip that ended with the source's turn.
 */
export const copyForkMessages = internalMutation({
  args: {
    sourceSessionId: v.id("sessions"),
    sessionId: v.id("sessions"),
    cursor: v.union(v.string(), v.null()),
    numItems: v.optional(v.number()),
  },
  returns: v.object({
    cursor: v.union(v.string(), v.null()),
    pairs: v.array(forkMessagePairValidator),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", args.sourceSessionId))
      .paginate({
        cursor: args.cursor,
        numItems: args.numItems ?? FORK_COPY_PAGE,
      });
    const pairs: Array<{ from: Id<"messages">; to: Id<"messages"> }> = [];
    for (const message of page.page) {
      const {
        _id,
        _creationTime,
        clientId: _clientId,
        pendingQuestion: _pendingQuestion,
        ...fields
      } = message;
      const to = await ctx.db.insert("messages", {
        ...fields,
        parentId: args.sessionId,
      });
      pairs.push({ from: _id, to });
    }
    return { cursor: page.isDone ? null : page.continueCursor, pairs };
  },
});

/**
 * Copies the cards anchored to messages — plan cards and `render_ui` panels —
 * once every message page is in, so their `messageId` can point at the copy.
 * Turn and implementation links are the source's and are dropped.
 */
export const copyForkCards = internalMutation({
  args: {
    sourceSessionId: v.id("sessions"),
    sessionId: v.id("sessions"),
    pairs: v.array(forkMessagePairValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const copies = new Map(args.pairs.map((pair) => [pair.from, pair.to]));
    const remap = (messageId: Id<"messages"> | undefined) =>
      messageId === undefined ? undefined : copies.get(messageId);
    const plans = await ctx.db
      .query("proposedPlans")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sourceSessionId))
      .collect();
    for (const plan of plans) {
      const {
        _id,
        _creationTime,
        turnId: _turnId,
        implementationSessionId: _implementationSessionId,
        messageId,
        ...fields
      } = plan;
      const copy = remap(messageId);
      await ctx.db.insert("proposedPlans", {
        ...fields,
        sessionId: args.sessionId,
        ...(copy ? { messageId: copy } : {}),
      });
    }
    const panels = await ctx.db
      .query("chatUiPanels")
      .withIndex("by_parent", (q) => q.eq("parentId", args.sourceSessionId))
      .collect();
    for (const panel of panels) {
      const { _id, _creationTime, messageId, ...fields } = panel;
      const copy = remap(messageId);
      await ctx.db.insert("chatUiPanels", {
        ...fields,
        parentId: args.sessionId,
        ...(copy ? { messageId: copy } : {}),
      });
    }
    return null;
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
