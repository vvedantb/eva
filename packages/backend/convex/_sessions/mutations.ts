import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  authMutation,
  getRepoWithAccess,
  getSessionWithAccess,
  hasRepoAccess,
} from "../functions";
import { findWorkChat } from "./ownerState";
import { allocateNumId } from "../numId";
import {
  aiModelValidator,
  getAIModelProvider,
  reasoningLevelValidator,
} from "../validators";
import { workflow } from "../workflowManager";
import { resolveSessionBaseBranch } from "./baseBranch";
import { scheduleStuckStartExpiry } from "../_sandbox/transitions";
import {
  assertProviderAccountUsableBy,
  resolveDefaultProviderAccountId,
} from "../_userProviderAccounts/defaults";
import { schedulePrTitleSync } from "../_github/prTitleSync";
import { DEFAULT_SESSION_TITLE } from "./helpers";
import { ensureSessionGroup } from "./groups";
import { notifyChatMentions } from "../_mentions/notifyChatMentions";
import { recordPersonChatPost } from "../chatReads";
import { archiveSession, isSessionArchived, unarchiveSession } from "./archive";
import { requestSessionSandboxStop } from "./sandbox";
import {
  closeLivePullRequests,
  findPrimaryPullRequest,
  reopenArchivedPullRequests,
} from "../_pullRequests/store";
import { composerTraitFields } from "../_shared/composerTraits";
import { buildSessionBranchName } from "../_git/branchNames";
import {
  assertValidRepoGroupMembers,
  getRepoGroupForSession,
} from "../repoGroups";
import { insertSessionRepos } from "./repos";
import {
  assertStandaloneSession,
  isStandaloneSession,
  ownedSessionOwnerValidator,
  STANDALONE_SESSION_OWNER,
} from "./owner";
import { ensureOwnerChat } from "./ownedSession";
import { loadOwnerEntityWithAccess, ownerChatRefValidator } from "./queries";
import {
  ensureMainChat,
  getSessionChatWithAccess,
} from "../_sessionChats/helpers";

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
  stackOnPrNumber: v.optional(v.number()),
  attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
  sentViaOrchestrator: v.optional(v.boolean()),
  linkedRepoIds: v.optional(v.array(v.id("githubRepos"))),
  repoGroupId: v.optional(v.id("repoGroups")),
  installDependencies: v.optional(v.boolean()),
  fromSessionId: v.optional(v.id("sessions")),
});

type CreateSessionArgs = Infer<typeof createSessionArgs>;

/** Internal-only: never accepted from clients, so nobody boots a chosen snapshot. */
export interface CreateSessionFork {
  sourceSessionId: Id<"sessions">;
  sourceSandboxId: string;
  restartSource: boolean;
}

/** Mutation context after `authMutation` injects the caller's user id. */
export type AuthMutationCtx = MutationCtx & { userId: Id<"users"> };

async function joinSessionGroup(
  ctx: AuthMutationCtx,
  sourceId: Id<"sessions">,
): Promise<Id<"sessionGroups">> {
  const source = await ctx.db.get(sourceId);
  if (!source || !(await hasRepoAccess(ctx.db, source.repoId, ctx.userId))) {
    throw new Error("Source session not found");
  }
  return await ensureSessionGroup(ctx.db, source, ctx.userId);
}

/**
 * Shared session creation path: insert, branch, sandbox startup workflow, and
 * (optionally) the first queued message. Used by `chats.start` (the apps and
 * MCP `create_session`), forks and accepted session proposals.
 */
export async function createSession(
  ctx: AuthMutationCtx,
  args: CreateSessionArgs,
  fork?: CreateSessionFork,
): Promise<{ sessionId: Id<"sessions">; numId: number }> {
  const repo = await getRepoWithAccess(ctx.db, args.repoId, ctx.userId);
  const title = args.title?.trim() || DEFAULT_SESSION_TITLE;
  const baseBranch = resolveSessionBaseBranch(
    { baseBranch: args.baseBranch },
    repo,
  );
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
    linkedRepos.push(await getRepoWithAccess(ctx.db, linkedRepoId, ctx.userId));
  }
  if (linkedRepos.length > 0) {
    assertValidRepoGroupMembers(repo, linkedRepos);
  }
  const installDependencies =
    args.installDependencies ?? group?.installDependencies ?? true;
  const sessionGroupId =
    args.fromSessionId === undefined
      ? undefined
      : await joinSessionGroup(ctx, args.fromSessionId);

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
    owner: STANDALONE_SESSION_OWNER,
    status: "starting",
    sandboxStartAttempt: 1,
    createdBy: ctx.userId,
    updatedAt: Date.now(),
    numId,
    baseBranch,
    ...(args.stackOnPrNumber !== undefined
      ? { stackOnPrNumber: args.stackOnPrNumber }
      : {}),
    ...(sessionGroupId ? { sessionGroupId } : {}),
    ...(fork
      ? {
          forkedFromSessionId: fork.sourceSessionId,
          forkSourceSandboxId: fork.sourceSandboxId,
          ...(fork.restartSource ? { forkRestartsSource: true } : {}),
        }
      : {}),
  });
  const branchName = buildSessionBranchName(sessionId);
  await ctx.db.patch(sessionId, { branchName });
  const created = await ctx.db.get(sessionId);
  if (!created) throw new Error("Session was not created");
  const mainChat = await ensureMainChat(ctx, created, {
    providerAccountId,
    provider: getAIModelProvider(model),
    lastModel: model,
    ...composerTraitFields({
      reasoningLevel,
      thinkingEnabled,
      use1mContext,
      fastMode,
    }),
  });

  await insertSessionRepos(
    ctx,
    { sessionId, branchName },
    linkedRepos,
    installDependencies,
  );
  if (linkedRepos.length > 0 && args.repoGroupId !== undefined) {
    await ctx.db.patch(sessionId, { repoGroupId: args.repoGroupId });
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
      startAttempt: 1,
    },
  );
  await scheduleStuckStartExpiry(ctx, sessionId, 1);

  const content = args.message?.trim() ?? "";
  if (content) {
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
      sentViaOrchestrator: args.sentViaOrchestrator,
    });
    const session = await ctx.db.get(sessionId);
    if (session) {
      const mentionedIds = await notifyChatMentions(ctx, {
        content,
        authorUserId: ctx.userId,
        surface: { kind: "session", session },
      });
      await recordPersonChatPost(ctx, {
        parentId: mainChat._id,
        authorId: ctx.userId,
        mentionedIds,
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

/**
 * Posts the web's send-failure bubble (`annotationSend.ts`) into a chat: an
 * assistant row whose text starts with `Error: `. Every other message goes
 * through `chats.send`. Any other text is refused, so a repo member cannot
 * forge an agent reply in a teammate's chat.
 */
export const postSendError = authMutation({
  args: {
    chatId: v.id("sessionChats"),
    content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!args.content.startsWith("Error: ")) {
      throw new Error("Only user messages can be posted to this chat");
    }
    const { chat, session } = await getSessionChatWithAccess(
      ctx.db,
      args.chatId,
      ctx.userId,
    );
    await ctx.db.insert("messages", {
      parentId: chat._id,
      role: "assistant",
      content: args.content,
      timestamp: Date.now(),
      userId: ctx.userId,
    });
    const now = Date.now();
    await ctx.db.patch(chat._id, { updatedAt: now });
    await ctx.db.patch(session._id, { updatedAt: now });
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
    assertStandaloneSession(session, "be renamed");
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
  if (session.sandboxId) {
    await ctx.scheduler.runAfter(0, internal.sandbox.archiveSandbox, {
      sandboxId: session.sandboxId,
      repoId: session.repoId,
    });
  }

  await closeLivePullRequests(ctx, { kind: "session", sessionId: session._id });
  await ctx.db.patch(session._id, { status: "closed" });
  await archiveSession(ctx, session);
}

/**
 * The user-facing archive (`chats.archive`, `archiveGroup`): stops the
 * sandbox when one is up, then `archiveSessionDoc`. The caller has already
 * checked access and that the session is standalone.
 */
export async function stopAndArchiveSession(
  ctx: MutationCtx,
  session: Doc<"sessions">,
): Promise<void> {
  if (session.sandboxId) await requestSessionSandboxStop(ctx, session._id);
  const fresh = await ctx.db.get(session._id);
  if (fresh) await archiveSessionDoc(ctx, fresh);
}

/**
 * Archives every active member of the session's linked-session group that
 * the user can reach. Members stay in the group, so each one can be
 * unarchived on its own later.
 */
export const archiveGroup = authMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.object({ archived: v.number() }),
  handler: async (ctx, args) => {
    const session = await getSessionWithAccess(
      ctx.db,
      args.sessionId,
      ctx.userId,
    );
    if (!session.sessionGroupId) throw new Error("Session is not in a group");
    const groupId = session.sessionGroupId;
    const members = await ctx.db
      .query("sessions")
      .withIndex("by_session_group", (q) => q.eq("sessionGroupId", groupId))
      .take(50);
    let archived = 0;
    for (const member of members) {
      if (isSessionArchived(member) || !isStandaloneSession(member)) continue;
      if (!(await hasRepoAccess(ctx.db, member.repoId, ctx.userId))) continue;
      await stopAndArchiveSession(ctx, member);
      archived++;
    }
    return { archived };
  },
});

/** Archives a session so it no longer appears in the active list.
 * Also archives the sandbox (moves to cold storage for cost savings).
 * Closes every open/draft GitHub PR it holds; merged PRs are left alone. */
export const archive = authMutation({
  args: { id: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await getSessionWithAccess(ctx.db, args.id, ctx.userId);
    assertStandaloneSession(session, "be archived on its own");
    await archiveSessionDoc(ctx, session);
    return null;
  },
});

/**
 * A task's or project's session and the chat it talks in (`getOwnedWithSeed`),
 * created on first use. The owner's chat and sandbox panels call this before
 * their first send or Start when `getOwnedWithSeed` is still null. Anyone
 * with access to the owner may create it.
 */
export const ensureOwned = authMutation({
  args: { owner: ownedSessionOwnerValidator },
  returns: ownerChatRefValidator,
  handler: async (ctx, args) => {
    const entity = await loadOwnerEntityWithAccess(
      ctx.db,
      args.owner,
      ctx.userId,
    );
    if (!entity) throw new Error(`${args.owner.kind} not found`);
    const existing = await findWorkChat(ctx.db, entity);
    if (existing) {
      return { sessionId: existing.session._id, chatId: existing.chat._id };
    }
    const { session, chat } = await ensureOwnerChat(ctx, entity);
    return { sessionId: session._id, chatId: chat._id };
  },
});

/** Unarchives a session, restoring it to the active list.
 * Reopens a PR Eva closed on archive, as draft or ready to match that state. */
export const unarchive = authMutation({
  args: { id: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await getSessionWithAccess(ctx.db, args.id, ctx.userId);
    assertStandaloneSession(session, "be unarchived on its own");

    await reopenArchivedPullRequests(ctx, {
      kind: "session",
      sessionId: args.id,
    });
    await unarchiveSession(ctx, args.id, { touch: false });
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
    await getSessionWithAccess(ctx.db, args.id, ctx.userId);
    await ctx.db.patch(args.id, {
      planContent: args.planContent,
      updatedAt: Date.now(),
    });
    return null;
  },
});
