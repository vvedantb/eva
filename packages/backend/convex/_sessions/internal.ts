import { v, type Infer } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { DEFAULT_SESSION_TITLE, sessionValidator } from "./helpers";
import { deploymentStatusValidator, repoShaValidator } from "../validators";
import {
  cancelSessionSandboxGraceDelete,
  scheduleSessionSandboxGraceDelete,
} from "../sandboxCleanup";
import { schedulePrTitleSync } from "../_github/prTitleSync";
import { findOpenSessionTurn } from "../_chat/turnStore";

const prStateValidator = v.union(
  v.literal("draft"),
  v.literal("open"),
  v.literal("merged"),
  v.literal("closed"),
);

/** Retrieves a session by ID for internal use (no auth check). */
export const getInternal = internalQuery({
  args: { id: v.string() },
  returns: v.union(sessionValidator, v.null()),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("sessions", args.id);
    if (!id) return null;
    return await ctx.db.get(id);
  },
});

/** Session owning a sandbox — preview recovery relaunches services through it. */
export const getBySandboxInternal = internalQuery({
  args: { sandboxId: v.string() },
  returns: v.union(sessionValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_sandbox", (q) => q.eq("sandboxId", args.sandboxId))
      .first();
  },
});

/** Updates the deployment status and optional URL for a session (internal use). */
export const updateDeploymentStatus = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    deploymentStatus: deploymentStatusValidator,
    deploymentUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    await ctx.db.patch(args.sessionId, {
      deploymentStatus: args.deploymentStatus,
      ...(args.deploymentUrl !== undefined && {
        deploymentUrl: args.deploymentUrl,
      }),
    });
    return null;
  },
});

/** Sets the pull request URL on a session (internal use). */
export const setPrUrl = internalMutation({
  args: {
    id: v.id("sessions"),
    prUrl: v.string(),
    prState: v.optional(prStateValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      prUrl: args.prUrl,
      ...(args.prState !== undefined && { prState: args.prState }),
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Sets only the PR state on a session (internal use). */
export const setPrState = internalMutation({
  args: {
    id: v.id("sessions"),
    prState: prStateValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session) return null;
    const isTerminal = args.prState === "merged" || args.prState === "closed";
    await ctx.db.patch(args.id, {
      prState: args.prState,
      ...(isTerminal
        ? { archived: true }
        : { archived: false, prStateOnArchive: undefined }),
      updatedAt: Date.now(),
    });
    if (isTerminal) {
      await scheduleSessionSandboxGraceDelete(ctx, {
        ...session,
        archived: true,
        prState: args.prState,
      });
    } else {
      await cancelSessionSandboxGraceDelete(ctx, args.id);
    }
    return null;
  },
});

/** Detaches a foreign-auto-merged PR from its session so the session stays writable. No-op if the session's PR has since changed. */
export const clearPrUrlIfMatches = internalMutation({
  args: { id: v.id("sessions"), expectedPrUrl: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session || session.prUrl !== args.expectedPrUrl) return null;
    await ctx.db.patch(args.id, {
      prUrl: undefined,
      prState: undefined,
      prStateOnArchive: undefined,
      archived: false,
      updatedAt: Date.now(),
    });
    await cancelSessionSandboxGraceDelete(ctx, args.id);
    return null;
  },
});

// Soft UX lock for agent-driven browsing moved to
// `internal.mcp.browserLock.setAgentBrowsingAt` (generalized to
// sessions/tasks/projects); MCP browser_lock / browser_unlock call that now.

/**
 * Applies an LLM-generated session title only while the placeholder remains.
 * Manual renames (anything other than DEFAULT_SESSION_TITLE) are never overwritten.
 */
export const applyGeneratedTitle = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    title: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    if (session.title !== DEFAULT_SESSION_TITLE) return null;
    await ctx.db.patch(args.sessionId, {
      title: args.title,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Newest messages considered when re-titling; the digest trims further by characters. */
const TITLE_CONTEXT_MESSAGE_LIMIT = 200;

/**
 * Everything `textGen.regenerateSessionTitle` needs to re-title a session:
 * the current title, PR link (for title sync) and the recent conversation in
 * chronological order. Role/content only — the digest does the trimming.
 */
export const getTitleContext = internalQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.union(
    v.object({
      title: v.string(),
      prUrl: v.optional(v.string()),
      repoId: v.id("githubRepos"),
      titleRegeneration: v.optional(v.object({ startedAt: v.number() })),
      messages: v.array(
        v.object({
          role: v.string(),
          content: v.string(),
          isSystemAlert: v.optional(v.boolean()),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    const newestFirst = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", args.sessionId))
      .order("desc")
      .take(TITLE_CONTEXT_MESSAGE_LIMIT);
    return {
      title: session.title,
      prUrl: session.prUrl,
      repoId: session.repoId,
      titleRegeneration: session.titleRegeneration,
      messages: newestFirst.reverse().map((message) => ({
        role: message.role,
        content: message.content,
        isSystemAlert: message.isSystemAlert,
      })),
    };
  },
});

/** Flags a session as mid-regeneration so the UI can disable the action and show a hint. */
export const markTitleRegenerating = internalMutation({
  args: { sessionId: v.id("sessions"), startedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, {
      titleRegeneration: { startedAt: args.startedAt },
    });
    return null;
  },
});

/**
 * Finishes a title regeneration. Always clears the in-progress flag; applies
 * the new title only when the model produced something usable that differs
 * from the current one, and mirrors `sessions.update` by syncing a linked PR.
 */
export const applyRegeneratedTitle = internalMutation({
  args: { sessionId: v.id("sessions"), title: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    const title = args.title?.trim();
    const shouldApply =
      title !== undefined &&
      title.length > 0 &&
      title !== session.title &&
      title !== DEFAULT_SESSION_TITLE;
    await ctx.db.patch(args.sessionId, {
      titleRegeneration: undefined,
      ...(shouldApply ? { title, updatedAt: Date.now() } : {}),
    });
    if (shouldApply && session.prUrl) {
      await schedulePrTitleSync(ctx, {
        repoId: session.repoId,
        prUrl: session.prUrl,
        title,
      });
    }
    return null;
  },
});

/**
 * Everything `sandbox.revertSessionToTurn` needs before it touches the VM.
 * Refuses up front when the session has no running sandbox, a turn is still
 * open (the daemon owns the worktree until it finishes), or the message never
 * recorded a checkpoint. Auth happens in the action, against `repoId`.
 */
const revertContextValidator = v.union(
  v.object({
    status: v.literal("ok"),
    repoId: v.id("githubRepos"),
    sandboxId: v.string(),
    branchName: v.string(),
    beforeSha: v.string(),
    /** Multi-repo checkpoint, when the turn recorded one (see messageFields.beforeShas). */
    beforeShas: v.optional(v.array(repoShaValidator)),
    /** 1-based position of this reply among the session's real assistant turns. */
    turnNumber: v.number(),
  }),
  v.object({ status: v.literal("not_running"), repoId: v.id("githubRepos") }),
  v.object({ status: v.literal("turn_open"), repoId: v.id("githubRepos") }),
  v.object({ status: v.literal("sha_missing"), repoId: v.id("githubRepos") }),
);

type RevertContext = Infer<typeof revertContextValidator>;

export const getRevertContext = internalQuery({
  // `messageId` is a plain string: the chat tree widens message ids so it can
  // hold client-built synthetic turns, which never carry checkpoints anyway.
  args: { sessionId: v.id("sessions"), messageId: v.string() },
  returns: revertContextValidator,
  handler: async (ctx, args): Promise<RevertContext> => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    const messageId = ctx.db.normalizeId("messages", args.messageId);
    const message = messageId === null ? null : await ctx.db.get(messageId);
    if (!message || message.parentId !== args.sessionId) {
      throw new Error("Message not found");
    }
    const repoId = session.repoId;
    if (message.beforeSha === undefined || message.afterSha === undefined) {
      return { status: "sha_missing", repoId };
    }
    if (
      session.status !== "active" ||
      !session.sandboxId ||
      !session.branchName
    ) {
      return { status: "not_running", repoId };
    }
    if ((await findOpenSessionTurn(ctx, args.sessionId)) !== null) {
      return { status: "turn_open", repoId };
    }
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", args.sessionId))
      .collect();
    const turnNumber = messages.filter(
      (row) =>
        row.role === "assistant" &&
        !row.isSystemAlert &&
        row.timestamp <= message.timestamp,
    ).length;
    return {
      status: "ok",
      repoId,
      sandboxId: session.sandboxId,
      branchName: session.branchName,
      beforeSha: message.beforeSha,
      beforeShas: message.beforeShas,
      turnNumber,
    };
  },
});
