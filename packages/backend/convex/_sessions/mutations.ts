import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader, MutationCtx } from "../_generated/server";
import {
  authMutation,
  getSessionWithAccess,
  hasRepoAccess,
} from "../functions";
import { allocateNumId } from "../numId";
import {
  aiModelValidator,
  getAIModelProvider,
  reasoningLevelValidator,
  roleValidator,
  sessionStatusValidator,
} from "../validators";
import { workflow } from "../workflowManager";
import { resolveSessionBaseBranch } from "./baseBranch";
import { resolveCredentialSourceLabel } from "../_userProviderAccounts/credentialSource";
import {
  assertProviderAccountUsableBy,
  reconcileProviderAccountForModel,
  resolveDefaultProviderAccountId,
} from "../_userProviderAccounts/defaults";
import { schedulePrTitleSync } from "../_github/prTitleSync";
import { DEFAULT_SESSION_TITLE } from "./helpers";
import { notifyChatMentions } from "../_mentions/notifyChatMentions";
import {
  cancelSessionSandboxGraceDelete,
  scheduleSessionSandboxGraceDelete,
} from "../sandboxCleanup";
import { livePrState, scheduleSessionPrSync } from "./prArchive";

/** Loads a session by id, throwing if it does not exist. */
async function getSessionOrThrow(
  db: DatabaseReader,
  id: Id<"sessions">,
): Promise<Doc<"sessions">> {
  const session = await db.get(id);
  if (!session) {
    throw new Error("Session not found");
  }
  return session;
}

const createSessionArgs = v.object({
  repoId: v.id("githubRepos"),
  title: v.optional(v.string()),
  message: v.optional(v.string()),
  model: v.optional(aiModelValidator),
  reasoningLevel: v.optional(reasoningLevelValidator),
  thinkingEnabled: v.optional(v.boolean()),
  use1mContext: v.optional(v.boolean()),
  fastMode: v.optional(v.boolean()),
  providerAccountId: v.optional(
    v.union(v.id("userProviderAccounts"), v.null()),
  ),
  baseBranch: v.optional(v.string()),
  attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
  /** Marks the user's persistent master session. Set only at creation. */
  isOrchestrator: v.optional(v.boolean()),
  /** Set when the orchestrator's `create_session` tool opened this session. */
  sentViaOrchestrator: v.optional(v.boolean()),
});

type CreateSessionArgs = Infer<typeof createSessionArgs>;

/** Mutation context after `authMutation` injects the caller's user id. */
export type AuthMutationCtx = MutationCtx & { userId: Id<"users"> };

/**
 * Shared session creation path: insert, branch, sandbox startup workflow, and
 * (optionally) the first queued message. Used by the `create` mutation and by
 * `_sessions/orchestrator.ts` so the master session takes the same path.
 */
export async function createSession(
  ctx: AuthMutationCtx,
  args: CreateSessionArgs,
): Promise<{ sessionId: Id<"sessions">; numId: number }> {
  if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
    throw new Error("Not authorized");
  }
  const repo = await ctx.db.get(args.repoId);
  if (!repo) throw new Error("Repository not found");
  const title = args.title?.trim() || DEFAULT_SESSION_TITLE;
  const baseBranch = resolveSessionBaseBranch(
    { baseBranch: args.baseBranch },
    repo,
  );
  const numId = await allocateNumId(ctx.db, args.repoId, "sessions");
  const model = args.model ?? repo.defaultModel;
  const reasoningLevel = args.reasoningLevel ?? repo.defaultReasoningLevel;
  const thinkingEnabled = args.thinkingEnabled ?? repo.defaultThinkingEnabled;
  const use1mContext = args.use1mContext ?? repo.defaultUse1mContext;
  const fastMode = args.fastMode ?? repo.defaultFastMode;
  const providerAccountId =
    args.providerAccountId === undefined
      ? await resolveDefaultProviderAccountId(ctx.db, ctx.userId, model)
      : await assertProviderAccountUsableBy(
          ctx.db,
          args.providerAccountId,
          ctx.userId,
        );
  const sessionId = await ctx.db.insert("sessions", {
    repoId: args.repoId,
    userId: ctx.userId,
    title,
    status: "starting",
    createdBy: ctx.userId,
    updatedAt: Date.now(),
    numId,
    baseBranch,
    providerAccountId,
    // The provider the session started on. Informational only — the composer
    // may move the session onto another provider later.
    provider: getAIModelProvider(model),
    lastModel: model,
    ...(reasoningLevel !== undefined
      ? { lastReasoningLevel: reasoningLevel }
      : {}),
    ...(thinkingEnabled !== undefined
      ? { lastThinkingEnabled: thinkingEnabled }
      : {}),
    ...(use1mContext !== undefined ? { lastUse1mContext: use1mContext } : {}),
    ...(fastMode !== undefined ? { lastFastMode: fastMode } : {}),
    ...(args.isOrchestrator !== undefined
      ? { isOrchestrator: args.isOrchestrator }
      : {}),
  });
  const branchName = `eva/session-${sessionId}`;
  await ctx.db.patch(sessionId, { branchName });
  await workflow.start(
    ctx,
    internal.sessionWorkflow.sessionSandboxStartupWorkflow,
    {
      sessionId,
      installationId: repo.installationId,
      repoOwner: repo.owner,
      repoName: repo.name,
      branchName,
      baseBranch,
      repoId: args.repoId,
    },
  );

  const content = args.message?.trim() ?? "";
  if (content) {
    // MCP `create_session` (and any caller that omits `model`) relies on
    // `repo.defaultModel` resolved above. Checking `args.model` here threw
    // after the session row was built and rolled the mutation back.
    if (!model) {
      throw new Error("model is required when queuing a message");
    }
    await ctx.db.insert("queuedMessages", {
      parentId: sessionId,
      content,
      createdAt: Date.now(),
      order: Date.now(),
      userId: ctx.userId,
      model,
      reasoningLevel,
      thinkingEnabled,
      use1mContext,
      fastMode,
      providerAccountId,
      attachmentStorageIds: args.attachmentStorageIds,
      // A session the orchestrator created: its first message is master-sent
      // too, so it carries the same badge as anything sent later.
      sentViaOrchestrator: args.sentViaOrchestrator,
    });
    // The first message queues directly rather than going through
    // startExecute, so its mentions are notified here instead.
    const session = await ctx.db.get(sessionId);
    if (session) {
      await notifyChatMentions(ctx, {
        content,
        authorUserId: ctx.userId,
        surface: { kind: "session", session },
      });
    }
    if (title === DEFAULT_SESSION_TITLE) {
      await ctx.scheduler.runAfter(0, internal.textGen.generateSessionTitle, {
        sessionId,
        message: content,
      });
    }
  }

  return { sessionId, numId };
}

/** Creates a new session with a sandbox startup workflow. */
export const create = authMutation({
  args: createSessionArgs.fields,
  returns: v.object({
    sessionId: v.id("sessions"),
    numId: v.number(),
  }),
  handler: async (ctx, args) => await createSession(ctx, args),
});

/** Adds a message to a session conversation. */
export const addMessage = authMutation({
  args: {
    id: v.id("sessions"),
    role: roleValidator,
    content: v.string(),
    activityLog: v.optional(v.string()),
    clientId: v.optional(v.string()),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    providerAccountId: v.optional(v.id("userProviderAccounts")),
    model: v.optional(aiModelValidator),
    reasoningLevel: v.optional(reasoningLevelValidator),
    /** Set by MCP send_chat_message / send_agent_message. */
    sentViaOrchestrator: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await getSessionWithAccess(ctx.db, args.id, ctx.userId);
    const credentialSourceLabel =
      args.role === "user"
        ? await resolveCredentialSourceLabel(
            ctx.db,
            args.providerAccountId ?? session.providerAccountId,
            session.createdBy ?? session.userId,
          )
        : undefined;
    await ctx.db.insert("messages", {
      parentId: args.id,
      role: args.role,
      content: args.content,
      timestamp: Date.now(),
      activityLog: args.activityLog,
      clientId: args.clientId,
      userId: ctx.userId,
      attachmentStorageIds: args.attachmentStorageIds,
      credentialSourceLabel,
      ...(args.role === "user"
        ? {
            model: args.model,
            reasoningLevel: args.reasoningLevel,
            sentViaOrchestrator: args.sentViaOrchestrator,
          }
        : {}),
    });
    await ctx.db.patch(args.id, { updatedAt: Date.now() });
    return null;
  },
});

/**
 * Sets the sticky composer model for a session. `lastModel` is the single
 * source of truth for the picker, so this is called directly on change (with a
 * client-side optimistic update) rather than only when a message is sent. Does
 * not touch `updatedAt` — changing the model is not conversation activity and
 * must not reorder the session list. Any visible model is allowed, including one
 * from another provider: the sticky account is reconciled to the new model's
 * provider here, and that provider's CLI is caught up on the conversation so far
 * (see `_shared/modelHandoff.ts`).
 */
export const setModel = authMutation({
  args: {
    id: v.id("sessions"),
    model: aiModelValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await getSessionOrThrow(ctx.db, args.id);
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const providerAccountId = await reconcileProviderAccountForModel(
      ctx.db,
      session.createdBy ?? session.userId,
      args.model,
      session.providerAccountId,
    );
    await ctx.db.patch(args.id, { lastModel: args.model, providerAccountId });
    return null;
  },
});

/**
 * Sets the sticky provider account for a session. Same contract as `setModel`:
 * write on change (optimistic on the client), do not bump `updatedAt`. Pass
 * `null` to clear back to Team.
 *
 * Anyone with repo access may pick, but only from accounts owned by the session
 * owner — a session always runs on one person's credentials, and a collaborator
 * must never be able to attach their own. Without this, a collaborator who
 * changed the model could never get back to the owner's account.
 */
export const setProviderAccountId = authMutation({
  args: {
    id: v.id("sessions"),
    providerAccountId: v.union(v.id("userProviderAccounts"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await getSessionOrThrow(ctx.db, args.id);
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const ownerUserId = session.createdBy ?? session.userId;
    const providerAccountId = await assertProviderAccountUsableBy(
      ctx.db,
      args.providerAccountId,
      ownerUserId,
    );
    await ctx.db.patch(args.id, { providerAccountId });
    return null;
  },
});

/**
 * Sets sticky composer traits for a session (effort / thinking / 1M / Fast). Same
 * contract as `setModel`: write on change (optimistic on the client), do not
 * bump `updatedAt`. Only provided fields are patched.
 */
export const setTraits = authMutation({
  args: {
    id: v.id("sessions"),
    reasoningLevel: v.optional(reasoningLevelValidator),
    thinkingEnabled: v.optional(v.boolean()),
    use1mContext: v.optional(v.boolean()),
    fastMode: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await getSessionOrThrow(ctx.db, args.id);
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    if (
      args.reasoningLevel === undefined &&
      args.thinkingEnabled === undefined &&
      args.use1mContext === undefined &&
      args.fastMode === undefined
    ) {
      return null;
    }
    await ctx.db.patch(args.id, {
      ...(args.reasoningLevel !== undefined
        ? { lastReasoningLevel: args.reasoningLevel }
        : {}),
      ...(args.thinkingEnabled !== undefined
        ? { lastThinkingEnabled: args.thinkingEnabled }
        : {}),
      ...(args.use1mContext !== undefined
        ? { lastUse1mContext: args.use1mContext }
        : {}),
      ...(args.fastMode !== undefined ? { lastFastMode: args.fastMode } : {}),
    });
    return null;
  },
});

/** Updates the status of a session. */
export const updateStatus = authMutation({
  args: {
    id: v.id("sessions"),
    status: sessionStatusValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getSessionWithAccess(ctx.db, args.id, ctx.userId);
    await ctx.db.patch(args.id, { status: args.status });
    return null;
  },
});

/** Updates editable fields (title, branch, PR URL) on a session. */
export const update = authMutation({
  args: {
    id: v.id("sessions"),
    title: v.optional(v.string()),
    branchName: v.optional(v.string()),
    prUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await getSessionWithAccess(ctx.db, args.id, ctx.userId);
    const updates: {
      title?: string;
      branchName?: string;
      prUrl?: string;
    } = {};
    if (args.title !== undefined) updates.title = args.title;
    if (args.branchName !== undefined) updates.branchName = args.branchName;
    if (args.prUrl !== undefined) updates.prUrl = args.prUrl;
    await ctx.db.patch(args.id, updates);

    if (
      args.title !== undefined &&
      args.title !== session.title &&
      session.prUrl
    ) {
      await schedulePrTitleSync(ctx, {
        repoId: session.repoId,
        prUrl: session.prUrl,
        title: args.title,
      });
    }
    return null;
  },
});

/** Updates the summary bullet points on a session. */
export const updateSummary = authMutation({
  args: {
    id: v.id("sessions"),
    summary: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getSessionWithAccess(ctx.db, args.id, ctx.userId);
    await ctx.db.patch(args.id, { summary: args.summary });
    return null;
  },
});

/**
 * Archives a session: sandbox to cold storage, open/draft PR closed (merged
 * PRs are left alone), row flagged so the active list drops it.
 *
 * Split from the `archive` mutation so server-side callers that already hold
 * the doc and its access check — `resetOrchestratorSession` retiring the old
 * master — retire it through exactly this path instead of a second copy.
 */
export async function archiveSessionDoc(
  ctx: AuthMutationCtx,
  session: Doc<"sessions">,
): Promise<void> {
  // Archive the sandbox (stops it first, then moves to cold storage)
  if (session.sandboxId) {
    await ctx.scheduler.runAfter(0, internal.sandbox.archiveSandbox, {
      sandboxId: session.sandboxId,
      repoId: session.repoId,
    });
  }

  const restorePrState = livePrState(session.prState);
  if (restorePrState) {
    await scheduleSessionPrSync(ctx, session, { kind: "close" });
    await ctx.db.patch(session._id, {
      archived: true,
      status: "closed",
      updatedAt: Date.now(),
      prState: "closed",
      prStateOnArchive: restorePrState,
    });
  } else {
    await ctx.db.patch(session._id, {
      archived: true,
      status: "closed",
      updatedAt: Date.now(),
    });
  }
  await scheduleSessionSandboxGraceDelete(ctx, {
    ...session,
    archived: true,
    status: "closed",
  });
}

/** Archives a session so it no longer appears in the active list.
 * Also archives the sandbox (moves to cold storage for cost savings).
 * Closes an open/draft GitHub PR; merged PRs are left alone. */
export const archive = authMutation({
  args: { id: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await getSessionOrThrow(ctx.db, args.id);
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    await archiveSessionDoc(ctx, session);
    return null;
  },
});

/** Unarchives a session, restoring it to the active list.
 * Reopens a PR Eva closed on archive, as draft or ready to match that state. */
export const unarchive = authMutation({
  args: { id: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await getSessionOrThrow(ctx.db, args.id);
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }

    const restorePrState = livePrState(session.prStateOnArchive);
    if (restorePrState !== undefined && session.prState !== "merged") {
      await ctx.db.patch(args.id, {
        archived: false,
        prStateOnArchive: undefined,
        prState: restorePrState,
      });
      await cancelSessionSandboxGraceDelete(ctx, args.id);
      await scheduleSessionPrSync(ctx, session, {
        kind: "reopen",
        asReady: restorePrState === "open",
      });
      return null;
    }

    await ctx.db.patch(args.id, {
      archived: false,
      prStateOnArchive: undefined,
    });
    await cancelSessionSandboxGraceDelete(ctx, args.id);
    return null;
  },
});

/** Stores or updates the plan content for a session. */
export const updatePlanContent = authMutation({
  args: {
    id: v.id("sessions"),
    planContent: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await getSessionOrThrow(ctx.db, args.id);
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    await ctx.db.patch(args.id, {
      planContent: args.planContent,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Updates the content or activity log of the most recent message in a session. */
export const updateLastMessage = authMutation({
  args: {
    id: v.id("sessions"),
    content: v.optional(v.string()),
    activityLog: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getSessionWithAccess(ctx.db, args.id, ctx.userId);
    const last = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", args.id))
      .order("desc")
      .first();
    if (!last) return null;
    const patch: { content?: string; activityLog?: string } = {};
    if (args.content !== undefined) patch.content = args.content;
    if (args.activityLog !== undefined) patch.activityLog = args.activityLog;
    await ctx.db.patch(last._id, patch);
    await ctx.db.patch(args.id, { updatedAt: Date.now() });
    return null;
  },
});
