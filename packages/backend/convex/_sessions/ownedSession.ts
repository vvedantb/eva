import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  type DatabaseReader,
  type MutationCtx,
} from "../_generated/server";
import { allocateNumId } from "../numId";
import {
  aiModelValidator,
  getAIModelProvider,
  normalizeAIModel,
  reasoningLevelValidator,
} from "../validators";
import { storedComposerTraits } from "../_shared/composerTraits";
import {
  resolveProjectBranchName,
  taskBranchName,
} from "../_git/branchNames";
import {
  ensureMainChat,
  type ChatSettingsSource,
} from "../_sessionChats/helpers";
import { resolveSessionBaseBranch } from "./baseBranch";
import { insertSessionRepos } from "./repos";
import { archiveSession, isSessionArchived, unarchiveSession } from "./archive";
import {
  findOwnedSession,
  findWorkSession,
  sessionOwnerEntityId,
  sessionOwnerProjectId,
  workSessionOwner,
  type OwnedSessionOwner,
  type OwnerChat,
  type OwnerEntity,
} from "./owner";
import { requestSessionSandboxStop } from "./sandbox";
import { hasOpenChatTurn } from "../_chat/turnProjection";
import { markAllRunningExited } from "../backgroundProcesses";
import { nextSandboxStartAttempt } from "../_sandbox/transitions";
import { taskRunSettings } from "../_projects/runSettings";

/** A task's or project's session and its Main chat. */
export type OwnedSessionContext = {
  session: Doc<"sessions">;
  mainChat: Doc<"sessionChats">;
};

export type { OwnerChat, OwnerEntity };

/** Loads the task or project behind an owner, or null when it is gone. */
export async function loadOwnerEntity(
  db: DatabaseReader,
  owner: OwnedSessionOwner,
): Promise<OwnerEntity | null> {
  if (owner.kind === "task") {
    const task = await db.get(owner.taskId);
    return task ? { kind: "task", task } : null;
  }
  const project = await db.get(owner.projectId);
  return project ? { kind: "project", project } : null;
}

/**
 * Returns the session the task or project works on (`workSessionOwner`),
 * inserting it (and its Main chat) the first time anything needs it. The
 * lookup and the insert run in the caller's mutation, so `findOwnedSession`'s `.unique()` never sees two
 * rows. Starts no sandbox and generates no title: the session borrows its
 * owner's title and stays `closed` until something starts it. It takes a
 * normal session `numId`; the visible session numbers may skip it.
 */
export async function ensureWorkSession(
  ctx: MutationCtx,
  target: OwnerEntity,
): Promise<OwnedSessionContext> {
  const found = await findWorkSession(ctx.db, target);
  const existing = found && (await reviveCoordinatorSession(ctx, found));
  if (existing) {
    return { session: existing, mainChat: await ensureMainChat(ctx, existing) };
  }
  const session = await insertWorkSession(ctx, target);
  return { session, mainChat: await ensureMainChat(ctx, session) };
}

/**
 * A coordinator (project-owned) session that an old phase-based close
 * archived comes back live on use: a project has no closed state (decision
 * 19). `ensureWorkSession` and every chat send call it, until the
 * `convertProjects` migration revives the rest. Idempotent; leaves other
 * sessions and an archived project's session as they are.
 */
export async function reviveCoordinatorSession(
  ctx: MutationCtx,
  session: Doc<"sessions">,
): Promise<Doc<"sessions">> {
  const projectId = sessionOwnerProjectId(session);
  if (projectId === undefined || !isSessionArchived(session)) return session;
  const project = await ctx.db.get(projectId);
  if (!project || project.archivedAt !== undefined) return session;
  await unarchiveSession(ctx, session._id, { touch: false });
  return { ...session, archive: undefined };
}

/**
 * Inserts the session the task or project works on, without its Main chat.
 * `ensureWorkSession` adds a new Main chat; Step 9's conversion instead moves
 * a task's old chat in as Main. The caller checks that none exists.
 */
export async function insertWorkSession(
  ctx: MutationCtx,
  target: OwnerEntity,
): Promise<Doc<"sessions">> {
  const owner = workSessionOwner(target);
  const seed = ownedSessionSeed(target);
  const repo = await ctx.db.get(seed.repoId);
  if (!repo) throw new Error("Repository not found");
  const sessionId = await ctx.db.insert("sessions", {
    repoId: seed.repoId,
    userId: seed.userId,
    createdBy: seed.userId,
    title: seed.title,
    owner,
    status: "closed",
    numId: await allocateNumId(ctx.db, seed.repoId, "sessions"),
    branchName: seed.branchName,
    baseBranch: resolveSessionBaseBranch({ baseBranch: seed.baseBranch }, repo),
    // Its Main chat copies these (`insertMainChat`).
    ...chatSeedFields(await chatSeedSettings(ctx.db, target)),
    updatedAt: Date.now(),
  });
  await insertSessionRepos(
    ctx,
    { sessionId, branchName: seed.branchName },
    await taskLinkedRepos(ctx.db, target, seed.repoId),
    true,
  );
  const session = await ctx.db.get(sessionId);
  if (!session) throw new Error("Owned session was not created");
  return session;
}

async function taskLinkedRepos(
  db: DatabaseReader,
  target: OwnerEntity,
  primaryRepoId: Id<"githubRepos">,
): Promise<Doc<"githubRepos">[]> {
  if (target.kind !== "task") return [];
  const ids = (target.task.linkedRepoIds ?? []).filter(
    (id) => id !== primaryRepoId,
  );
  const repos = await Promise.all(ids.map((id) => db.get(id)));
  return repos.filter((repo) => repo !== null);
}

/**
 * The chat a task talks in: the Main chat of its own session, for a quick
 * task and a project's child task alike.
 */
export async function ensureTaskChat(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
): Promise<{ session: Doc<"sessions">; chat: Doc<"sessionChats"> }> {
  const { session, mainChat } = await ensureWorkSession(ctx, {
    kind: "task",
    task,
  });
  return { session, chat: mainChat };
}

/**
 * The chat an owner talks in, created on first need: a task's
 * (`ensureTaskChat`) or a project's Main chat.
 */
export async function ensureOwnerChat(
  ctx: MutationCtx,
  entity: OwnerEntity,
): Promise<OwnerChat> {
  if (entity.kind === "task") return await ensureTaskChat(ctx, entity.task);
  const { session, mainChat } = await ensureWorkSession(ctx, entity);
  return { session, chat: mainChat };
}

export const chatSeedValidator = v.object({
  model: aiModelValidator,
  traits: v.object({
    effortLevel: v.optional(reasoningLevelValidator),
    thinkingEnabled: v.optional(v.boolean()),
    use1mContext: v.optional(v.boolean()),
    fastMode: v.optional(v.boolean()),
  }),
  providerAccountId: v.optional(v.id("userProviderAccounts")),
});

export type ChatSeed = typeof chatSeedValidator.type;

/**
 * The model, traits and provider account an owner's new chat starts on: the
 * one rule. `ensureOwnerChat` writes it into the chat it creates; `getOwnedWithSeed`
 * and the mobile chat target return it, so clients show it before the chat
 * exists (and for a chat with no sticky `lastModel`). From then on the chat
 * keeps its own sticky picks, apart from the owner's run settings.
 *
 * Model and account: the owner's run settings — a project's own, a task's
 * `taskRunSettings` (a project task takes its project's until its first run,
 * decision 20) — with the model falling back to the project's, then the repo
 * default, then `DEFAULT_AI_MODEL`. Traits: the model's defaults.
 */
export async function chatSeedSettings(
  db: DatabaseReader,
  entity: OwnerEntity,
): Promise<ChatSeed> {
  const run =
    entity.kind === "task"
      ? await taskRunSettings(db, entity.task)
      : entity.project;
  return {
    model: normalizeAIModel(run.model ?? (await ownerFallbackModel(db, entity))),
    traits: storedComposerTraits(null),
    ...(run.providerAccountId !== undefined
      ? { providerAccountId: run.providerAccountId }
      : {}),
  };
}

async function ownerFallbackModel(
  db: DatabaseReader,
  entity: OwnerEntity,
): Promise<Doc<"githubRepos">["defaultModel"]> {
  if (entity.kind === "project") {
    return (await db.get(entity.project.repoId))?.defaultModel;
  }
  const { task } = entity;
  const project =
    task.projectId !== undefined ? await db.get(task.projectId) : null;
  if (project?.model !== undefined) return project.model;
  const repoId = task.repoId ?? project?.repoId;
  return repoId !== undefined ? (await db.get(repoId))?.defaultModel : undefined;
}

function chatSeedFields(seed: ChatSeed): ChatSettingsSource {
  return {
    lastModel: seed.model,
    provider: getAIModelProvider(seed.model),
    providerAccountId: seed.providerAccountId,
    lastReasoningLevel: seed.traits.effortLevel,
    lastThinkingEnabled: seed.traits.thinkingEnabled,
    lastUse1mContext: seed.traits.use1mContext,
    lastFastMode: seed.traits.fastMode,
  };
}

function ownedSessionSeed(entity: OwnerEntity) {
  if (entity.kind === "task") {
    const { task } = entity;
    if (!task.repoId) throw new Error("Task has no repository");
    return {
      repoId: task.repoId,
      userId: task.createdBy,
      title: task.title,
      branchName: taskBranchName(task),
      baseBranch: task.baseBranch,
    };
  }
  const { project } = entity;
  return {
    repoId: project.repoId,
    userId: project.userId,
    title: project.title,
    branchName: resolveProjectBranchName(project._id, project),
    baseBranch: project.baseBranch,
  };
}

/**
 * True while an owned session holds its sandbox for something else: a turn
 * open (a chat reply or a run) or a start/stop in flight. A new run waits (user starts
 * are refused, scheduled ones retry): the same one-agent-per-sandbox rule
 * the chat queue applies to runs and builds.
 */
export async function ownedSessionBusy(
  db: DatabaseReader,
  owner: OwnedSessionOwner,
): Promise<boolean> {
  const session = await findOwnedSession(db, owner);
  if (!session) return false;
  if (session.status === "starting" || session.status === "stopping") {
    return true;
  }
  return await hasOpenChatTurn(db, session._id);
}

/**
 * Keeps the session's copies of owner fields in step after an owner edit:
 * the title (the session borrows it) and the base branch a fresh sandbox
 * checks out from. The owner row stays the source. A project's branch has
 * its own writer (`syncProjectSessionBranch`): changing it drops the VM.
 */
export async function mirrorOwnerIntoSession(
  ctx: MutationCtx,
  entity: OwnerEntity,
): Promise<void> {
  const session = await findWorkSession(ctx.db, entity);
  if (!session) return;
  const seed = ownedSessionSeed(entity);
  const repo = await ctx.db.get(session.repoId);
  const baseBranch = resolveSessionBaseBranch(
    { baseBranch: seed.baseBranch },
    repo,
  );
  if (session.title === seed.title && session.baseBranch === baseBranch) {
    return;
  }
  await ctx.db.patch(session._id, { title: seed.title, baseBranch });
}

const BRANCH_SYNC_RETRY_MS = 60_000;

/**
 * The one writer of a project session's branch after insert (a branch
 * edit). The session's VM is checked out on the old
 * branch, so it is deleted, a start in flight is fenced off by the bumped
 * start attempt (and so is a run's or interview's attach), and the next
 * start boots a fresh checkout — all in one write. While the session is busy
 * (a turn, a run, a start or stop) the move waits and
 * retries, so nothing running loses its VM.
 */
export async function syncProjectSessionBranch(
  ctx: MutationCtx,
  projectId: Id<"projects">,
): Promise<void> {
  const [project, session] = await Promise.all([
    ctx.db.get(projectId),
    findOwnedSession(ctx.db, { kind: "project", projectId }),
  ]);
  if (!project || !session) return;
  const branchName = resolveProjectBranchName(project._id, project);
  if (session.branchName === branchName) return;
  if (await ownedSessionBusy(ctx.db, { kind: "project", projectId })) {
    await ctx.scheduler.runAfter(
      BRANCH_SYNC_RETRY_MS,
      internal._sessions.ownedSession.syncProjectSessionBranchLater,
      { projectId },
    );
    return;
  }
  if (session.sandboxId !== undefined) {
    await ctx.scheduler.runAfter(0, internal.sandbox.deleteSandbox, {
      sandboxId: session.sandboxId,
      repoId: session.repoId,
    });
  }
  await markAllRunningExited(ctx.db, session._id);
  await ctx.db.patch(session._id, {
    branchName,
    sandboxId: undefined,
    status: "closed",
    sandboxStartAttempt: nextSandboxStartAttempt(session.sandboxStartAttempt),
    ptySessionId: undefined,
    sandboxBranch: undefined,
    sandboxGitSync: undefined,
    updatedAt: Date.now(),
  });
}

/** `syncProjectSessionBranch`, retried once the session goes idle. */
export const syncProjectSessionBranchLater = internalMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await syncProjectSessionBranch(ctx, args.projectId);
    return null;
  },
});


/** A project's sandbox status: its session's, or undefined before it has one. */
export async function projectSandboxStatus(
  db: DatabaseReader,
  project: Pick<Doc<"projects">, "_id">,
): Promise<Doc<"sessions">["status"] | undefined> {
  const session = await findOwnedSession(db, {
    kind: "project",
    projectId: project._id,
  });
  return session?.status;
}

type TaskStatusSource = Pick<Doc<"agentTasks">, "_id">;

/**
 * A task's sandbox status, the one rule the task page, lists and MCP share:
 * the status of its own session, or undefined before that session exists.
 */
export async function taskSandboxStatus(
  db: DatabaseReader,
  task: TaskStatusSource,
): Promise<Doc<"sessions">["status"] | undefined> {
  return (await findWorkSession(db, task))?.status;
}

/**
 * `taskSandboxStatus` for a list: one indexed read per repo for live task
 * sessions, never one session read per row. A task absent from the live map
 * has a closed (or no) sandbox.
 */
export async function liveTaskSandboxStatuses(
  db: DatabaseReader,
  repoIds: Iterable<Id<"githubRepos">>,
): Promise<(task: TaskStatusSource) => Doc<"sessions">["status"] | undefined> {
  const byTask = await liveOwnedSessionStatuses(db, repoIds, "task");
  return (task) => byTask.get(String(task._id));
}

const LIVE_SANDBOX_STATUSES = ["active", "starting", "stopping"] as const;

/**
 * Live sandbox status of every task or project session in these repos, keyed
 * by owner id. Lists show it as the owner's sandbox status: one indexed read
 * per repo and live status (few rows), never one read per listed row. An
 * owner absent from the map has a closed (or no) session sandbox.
 */
export async function liveOwnedSessionStatuses(
  db: DatabaseReader,
  repoIds: Iterable<Id<"githubRepos">>,
  kind: OwnedSessionOwner["kind"],
): Promise<Map<string, Doc<"sessions">["status"]>> {
  const rows = await Promise.all(
    [...new Set(repoIds)].flatMap((repoId) =>
      LIVE_SANDBOX_STATUSES.map((status) =>
        db
          .query("sessions")
          .withIndex("by_repo_and_status", (q) =>
            q.eq("repoId", repoId).eq("status", status),
          )
          .filter((q) =>
            q.and(
              q.eq(q.field("owner.kind"), kind),
              q.eq(q.field("deletedAt"), undefined),
            ),
          )
          .collect(),
      ),
    ),
  );
  const byOwner = new Map<string, Doc<"sessions">["status"]>();
  for (const session of rows.flat()) {
    const ownerId = sessionOwnerEntityId(session);
    if (ownerId) byOwner.set(String(ownerId), session.status);
  }
  return byOwner;
}

/**
 * The owner left the board (a task done/cancelled/archived, a project
 * archived): stop its sandbox, archive its session and
 * start the 48h sandbox delete grace.
 */
export async function retireOwnedSession(
  ctx: MutationCtx,
  owner: OwnedSessionOwner,
): Promise<void> {
  const session = await findOwnedSession(ctx.db, owner);
  if (!session) return;
  if (session.status !== "closed") {
    await requestSessionSandboxStop(ctx, session._id, {
      stopReason: { kind: "task" },
    });
  }
  const stopped = await ctx.db.get(session._id);
  if (stopped) await archiveSession(ctx, stopped);
}

/**
 * The task moved to another repo: its session (sandbox, branch checkout and
 * chat are bound to the old repo) retires and stops belonging to the task
 * (soft delete), so the next use creates a fresh session in the new repo.
 * The one place a task move touches its session; called by every move
 * mutation.
 */
export async function detachOwnedSession(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
): Promise<void> {
  const owner: OwnedSessionOwner = { kind: "task", taskId };
  const session = await findOwnedSession(ctx.db, owner);
  if (!session) return;
  await retireOwnedSession(ctx, owner);
  await ctx.db.patch(session._id, { deletedAt: Date.now() });
}

/** Whether an edit moves a task off its session: a new repo. */
export function taskMoveDetachesSession(
  task: Pick<Doc<"agentTasks">, "repoId">,
  next: { repoId?: Id<"githubRepos"> },
): boolean {
  return next.repoId !== undefined && next.repoId !== task.repoId;
}

/**
 * The owner came back (reopened or unarchived): its session is live again.
 * Clearing the archive also cancels the pending sandbox delete.
 */
export async function reviveOwnedSession(
  ctx: MutationCtx,
  owner: OwnedSessionOwner,
): Promise<void> {
  const session = await findOwnedSession(ctx.db, owner);
  if (!session || !isSessionArchived(session)) return;
  await unarchiveSession(ctx, session._id, { touch: false });
}

/** Task statuses that retire the task's session. */
export function isTerminalTaskStatus(status: Doc<"agentTasks">["status"]) {
  return status === "done" || status === "cancelled";
}

async function syncOwnedSessionWithTerminal(
  ctx: MutationCtx,
  owner: OwnedSessionOwner,
  wasTerminal: boolean,
  isTerminal: boolean,
): Promise<void> {
  if (isTerminal && !wasTerminal) await retireOwnedSession(ctx, owner);
  if (wasTerminal && !isTerminal) await reviveOwnedSession(ctx, owner);
}

/** Task status change → its session (`syncOwnedSessionWithTerminal`). */
export async function syncOwnedSessionWithTaskStatus(
  ctx: MutationCtx,
  task: Pick<Doc<"agentTasks">, "_id">,
  previous: Doc<"agentTasks">["status"],
  next: Doc<"agentTasks">["status"],
): Promise<void> {
  await syncOwnedSessionWithTerminal(
    ctx,
    { kind: "task", taskId: task._id },
    isTerminalTaskStatus(previous),
    isTerminalTaskStatus(next),
  );
}

/**
 * Project archive → its session. Reads the project's current state rather
 * than a transition, so it is safe to call after any write and to run late
 * (`syncProjectSessionLifecycle`): an archived project's session is retired,
 * any other is live. The stored phase plays no part: a project has no closed
 * state (decision 19), so its coordinator chat stays reachable when every
 * task is done, and a session an old phase-based close archived revives.
 */
export async function syncProjectSession(
  ctx: MutationCtx,
  projectId: Id<"projects">,
): Promise<void> {
  const [project, session] = await Promise.all([
    ctx.db.get(projectId),
    findOwnedSession(ctx.db, { kind: "project", projectId }),
  ]);
  if (!project || !session) return;
  const retired = project.archivedAt !== undefined;
  await syncOwnedSessionWithTerminal(
    ctx,
    { kind: "project", projectId },
    isSessionArchived(session),
    retired,
  );
}

/** `syncProjectSession`, scheduled (callers that cannot import this module). */
export const syncProjectSessionLifecycle = internalMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await syncProjectSession(ctx, args.projectId);
    return null;
  },
});
