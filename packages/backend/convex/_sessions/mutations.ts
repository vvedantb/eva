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
import {
  closeLivePullRequests,
  findPrimaryPullRequest,
  reopenArchivedPullRequests,
} from "../_pullRequests/store";
import {
  composerTraitFields,
  hasComposerTraitUpdate,
} from "../_shared/composerTraits";
import {
  assertValidRepoGroupMembers,
  getRepoGroupForSession,
} from "../repoGroups";
import { linkedRepoDir } from "../_sandbox_runtime/workspaceLayout";
import { touchUserActivity } from "../_sandbox/activity";
import {
  ensureMainChat,
  getSessionChatOrThrow,
} from "../_sessionChats/helpers";

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
  /** Set when the orchestrator's `create_session` tool opened this session. */
  sentViaOrchestrator: v.optional(v.boolean()),
  /**
   * Extra repos to clone into the same sandbox beside `repoId`. Each becomes a
   * `sessionRepos` row. Overrides the group's membership when both are given.
   */
  linkedRepoIds: v.optional(v.array(v.id("githubRepos"))),
  /** Saved codebase group whose members prefilled the selection. */
  repoGroupId: v.optional(v.id("repoGroups")),
  /** Whether linked repos install dependencies on clone. Defaults to true. */
  installDependencies: v.optional(v.boolean()),
});

type CreateSessionArgs = Infer<typeof createSessionArgs>;

/** Internal-only: never accepted from clients, so nobody boots a chosen snapshot. */
export interface CreateSessionFork {
  sourceSessionId: Id<"sessions">;
  sourceSandboxId: string;
  /** Start the source again after this fork's first sandbox is taken. */
  restartSource: boolean;
}

/** Mutation context after `authMutation` injects the caller's user id. */
export type AuthMutationCtx = MutationCtx & { userId: Id<"users"> };

/**
 * Shared session creation path: insert, branch, sandbox startup workflow, and
 * (optionally) the first queued message. Used by the `create` mutation and by
 * the MCP `create_session` tool.
 */
export async function createSession(
  ctx: AuthMutationCtx,
  args: CreateSessionArgs,
  fork?: CreateSessionFork,
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
  // Linked repos are resolved and validated before anything is inserted, so a
  // rejected selection never leaves a half-built session behind.
  const group =
    args.repoGroupId === undefined
      ? null
      : await getRepoGroupForSession(
          ctx.db,
          args.repoGroupId,
          args.repoId,
          ctx.userId,
        );
  const linkedRepoIds = args.linkedRepoIds ?? group?.linkedRepoIds ?? [];
  const linkedRepos: Array<Doc<"githubRepos">> = [];
  for (const linkedRepoId of linkedRepoIds) {
    if (!(await hasRepoAccess(ctx.db, linkedRepoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const linkedRepo = await ctx.db.get(linkedRepoId);
    if (!linkedRepo) throw new Error("Repository not found");
    linkedRepos.push(linkedRepo);
  }
  if (linkedRepos.length > 0) {
    assertValidRepoGroupMembers(repo, linkedRepos);
  }
  const installDependencies =
    args.installDependencies ?? group?.installDependencies ?? true;

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
    ...composerTraitFields({
      reasoningLevel,
      thinkingEnabled,
      use1mContext,
      fastMode,
    }),
    ...(fork
      ? {
          forkedFromSessionId: fork.sourceSessionId,
          forkSourceSandboxId: fork.sourceSandboxId,
          ...(fork.restartSource ? { forkRestartsSource: true } : {}),
        }
      : {}),
  });
  const branchName = `eva/session-${sessionId}`;
  await ctx.db.patch(sessionId, { branchName });
  const created = await ctx.db.get(sessionId);
  if (!created) throw new Error("Session was not created");
  // The Main chat is the session's own transcript; the first message queues
  // on it, and `ensureMainChat` carries the session's composer picks over.
  const mainChat = await ensureMainChat(ctx, created);

  // Every linked repo is checked out on the SAME branch name as the primary,
  // off its own default base. The rows are the sandbox's clone list, so they
  // must exist before the startup workflow runs.
  for (const linkedRepo of linkedRepos) {
    await ctx.db.insert("sessionRepos", {
      sessionId,
      repoId: linkedRepo._id,
      owner: linkedRepo.owner,
      name: linkedRepo.name,
      installationId: linkedRepo.installationId,
      path: linkedRepoDir(linkedRepo.name),
      branchName,
      baseBranch: resolveSessionBaseBranch(
        { baseBranch: undefined },
        linkedRepo,
      ),
      installDependencies,
      ...(linkedRepo.devPort !== undefined
        ? { devPort: linkedRepo.devPort }
        : {}),
      ...(linkedRepo.devCommand !== undefined
        ? { devCommand: linkedRepo.devCommand }
        : {}),
    });
  }
  if (linkedRepos.length > 0) {
    await ctx.db.patch(sessionId, {
      linkedRepoCount: linkedRepos.length,
      ...(args.repoGroupId !== undefined
        ? { repoGroupId: args.repoGroupId }
        : {}),
    });
  }

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
      hasLinkedRepos: linkedRepos.length > 0,
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
      parentId: mainChat._id,
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

/** Adds a message to one chat of a session. */
export const addMessage = authMutation({
  args: {
    chatId: v.id("sessionChats"),
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
    const { chat, session } = await getSessionChatOrThrow(ctx.db, args.chatId);
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const credentialSourceLabel =
      args.role === "user"
        ? await resolveCredentialSourceLabel(
            ctx.db,
            args.providerAccountId ?? chat.providerAccountId,
            session.createdBy ?? session.userId,
          )
        : undefined;
    await ctx.db.insert("messages", {
      parentId: chat._id,
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
    const now = Date.now();
    await ctx.db.patch(chat._id, { updatedAt: now });
    await ctx.db.patch(session._id, { updatedAt: now });
    if (args.role === "user") {
      await touchUserActivity(
        ctx,
        { kind: "session", entityId: String(session._id) },
        { source: "chat", userId: ctx.userId },
      );
    }
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

/** Updates editable fields (title, branch) on a session. */
export const update = authMutation({
  args: {
    id: v.id("sessions"),
    title: v.optional(v.string()),
    branchName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await getSessionWithAccess(ctx.db, args.id, ctx.userId);
    const updates: {
      title?: string;
      branchName?: string;
    } = {};
    if (args.title !== undefined) updates.title = args.title;
    if (args.branchName !== undefined) updates.branchName = args.branchName;
    await ctx.db.patch(args.id, updates);

    if (args.title !== undefined && args.title !== session.title) {
      const primaryPr = await findPrimaryPullRequest(ctx.db, {
        kind: "session",
        sessionId: session._id,
      });
      if (primaryPr) {
        await schedulePrTitleSync(ctx, {
          repoId: primaryPr.repoId,
          prUrl: primaryPr.prUrl,
          title: args.title,
        });
      }
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
 * Archives a session: sandbox to cold storage, every open/draft PR it holds
 * closed (merged PRs are left alone), row flagged so the active list drops it.
 *
 * Split from the `archive` mutation so server-side callers that already hold
 * the doc and its access check — `resetOrchestratorSession` retiring the old
 * master — retire it through exactly this path instead of a second copy.
 */
export async function archiveSessionDoc(
  ctx: MutationCtx,
  session: Doc<"sessions">,
): Promise<void> {
  // Archive the sandbox (stops it first, then moves to cold storage)
  if (session.sandboxId) {
    await ctx.scheduler.runAfter(0, internal.sandbox.archiveSandbox, {
      sandboxId: session.sandboxId,
      repoId: session.repoId,
    });
  }

  await closeLivePullRequests(ctx, { kind: "session", sessionId: session._id });
  await ctx.db.patch(session._id, {
    archived: true,
    status: "closed",
    updatedAt: Date.now(),
  });
  await scheduleSessionSandboxGraceDelete(ctx, {
    ...session,
    archived: true,
    status: "closed",
  });
}

/** Archives a session so it no longer appears in the active list.
 * Also archives the sandbox (moves to cold storage for cost savings).
 * Closes every open/draft GitHub PR it holds; merged PRs are left alone. */
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

    await reopenArchivedPullRequests(ctx, {
      kind: "session",
      sessionId: args.id,
    });
    await ctx.db.patch(args.id, { archived: false });
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

/** Updates the content or activity log of the most recent message in a chat. */
export const updateLastMessage = authMutation({
  args: {
    chatId: v.id("sessionChats"),
    content: v.optional(v.string()),
    activityLog: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { chat, session } = await getSessionChatOrThrow(ctx.db, args.chatId);
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const last = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", chat._id))
      .order("desc")
      .first();
    if (!last) return null;
    const patch: { content?: string; activityLog?: string } = {};
    if (args.content !== undefined) patch.content = args.content;
    if (args.activityLog !== undefined) patch.activityLog = args.activityLog;
    await ctx.db.patch(last._id, patch);
    await ctx.db.patch(chat._id, { updatedAt: Date.now() });
    return null;
  },
});
