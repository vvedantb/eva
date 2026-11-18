import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  type DatabaseReader,
  type MutationCtx,
} from "../_generated/server";
import { allocateNumId } from "../numId";
import { getAIModelProvider } from "../validators";
import {
  buildProjectBranchName,
  buildTaskBranchName,
  resolveProjectBranchName,
} from "../_git/branchNames";
import {
  createSessionChat,
  ensureMainChat,
  type ChatSettingsSource,
} from "../_sessionChats/helpers";
import { resolveSessionBaseBranch } from "./baseBranch";
import { archiveSession, isSessionArchived, unarchiveSession } from "./archive";
import {
  findOwnedSession,
  findProjectTaskChat,
  findWorkSession,
  isTerminalProjectPhase,
  sessionOwnerEntityId,
  workSessionOwner,
  type OwnedSessionOwner,
  type OwnerChat,
  type OwnerEntity,
} from "./owner";
import { requestSessionSandboxStop } from "./sandbox";
import { ownerHoldsSession, projectHoldsSession } from "./ownerState";
import { hasOpenChatTurn } from "../_chat/turnProjection";
import { markAllRunningExited } from "../backgroundProcesses";
import { nextSandboxStartAttempt } from "../_sandbox/transitions";

/**
 * The hidden session behind a quick task (`owner: { kind: "task" }`) or a
 * project (`owner: { kind: "project" }`). The owner stays the product
 * surface; its session runs the sandbox and the chat. A project's tasks have
 * no session of their own: they work on the project's.
 *
 *   owner created ──first need──▶ ensureWorkSession (one session, never two)
 *   task done / cancelled / deleted,
 *   project completed / cancelled / deleted ──▶ retireOwnedSession (stop + archive)
 *   reopened / restored ──▶ reviveOwnedSession (unarchive)
 */

/** A task's or project's session and its Main chat. */
export type OwnedSessionContext = {
  session: Doc<"sessions">;
  mainChat: Doc<"sessionChats">;
};

// The lookups (`workSessionOwner`, `findWorkSession`, `findWorkChat`) live
// in the leaf `owner.ts` and `ownerState.ts` so low-level modules can use them.
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
 * inserting it (and its Main chat) the first time anything needs it. A
 * project task gets its project's session. The lookup and the insert run in
 * the caller's mutation, so `findOwnedSession`'s `.unique()` never sees two
 * rows. Starts no sandbox and generates no title: the session borrows its
 * owner's title and stays `closed` until something starts it. It takes a
 * normal session `numId`; the visible session numbers may skip it.
 */
export async function ensureWorkSession(
  ctx: MutationCtx,
  target: OwnerEntity,
): Promise<OwnedSessionContext> {
  const owner = workSessionOwner(target);
  const existing = await findOwnedSession(ctx.db, owner);
  if (existing) {
    return { session: existing, mainChat: await ensureMainChat(ctx, existing) };
  }
  const entity = await workSessionEntity(ctx.db, target);
  const seed = ownedSessionSeed(entity);
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
    // The chat keeps its own sticky model, apart from the owner's run `model`.
    ...ownerChatSettings(entity, repo.defaultModel),
    updatedAt: Date.now(),
  });
  const session = await ctx.db.get(sessionId);
  if (!session) throw new Error("Owned session was not created");
  return { session, mainChat: await ensureMainChat(ctx, session) };
}

/** The entity that owns `target`'s work session: a project task's project. */
async function workSessionEntity(
  db: DatabaseReader,
  target: OwnerEntity,
): Promise<OwnerEntity> {
  if (target.kind === "project" || target.task.projectId === undefined) {
    return target;
  }
  const project = await db.get(target.task.projectId);
  if (!project) throw new Error("Project not found");
  return { kind: "project", project };
}

/**
 * The chat a task talks in: a quick task's Main chat, or a project task's own
 * chat in its project's session (`sessionChats.taskId`). A project task keeps
 * a chat apart from the project's, as before projects ran on sessions; it is
 * the one extra chat an owned session holds, and only this function opens it.
 */
export async function ensureTaskChat(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
): Promise<{ session: Doc<"sessions">; chat: Doc<"sessionChats"> }> {
  const { session, mainChat } = await ensureWorkSession(ctx, {
    kind: "task",
    task,
  });
  if (task.projectId === undefined) return { session, chat: mainChat };
  const existing = await findProjectTaskChat(ctx.db, task._id);
  if (existing) return { session, chat: existing };
  const chat = await createSessionChat(ctx, {
    session,
    createdBy: task.createdBy,
    title: task.title,
    inheritFrom: ownerChatSettings(
      { kind: "task", task },
      session.lastModel,
    ),
    taskId: task._id,
  });
  return { session, chat };
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

/**
 * The chat settings an owner's new chat starts from: its run model, else
 * `fallbackModel`, on the owner's account. From then on the chat keeps its
 * own sticky picks, apart from the run `model`.
 */
function ownerChatSettings(
  entity: OwnerEntity,
  fallbackModel: Doc<"sessions">["lastModel"],
): ChatSettingsSource {
  const doc = entity.kind === "task" ? entity.task : entity.project;
  const model = doc.model ?? fallbackModel;
  return {
    providerAccountId: doc.providerAccountId,
    ...(model !== undefined
      ? { lastModel: model, provider: getAIModelProvider(model) }
      : {}),
  };
}

/** The fields an owner gives its new session. */
function ownedSessionSeed(entity: OwnerEntity) {
  if (entity.kind === "task") {
    const { task } = entity;
    if (!task.repoId) throw new Error("Task has no repository");
    return {
      repoId: task.repoId,
      userId: task.createdBy,
      title: task.title,
      // The task's own branch: its PRs stay owned by the task
      // (`resolvePrOwnerFromBranch`).
      branchName: buildTaskBranchName(task._id),
      baseBranch: task.baseBranch,
    };
  }
  const { project } = entity;
  return {
    repoId: project.repoId,
    userId: project.userId,
    title: project.title,
    // The project's branch: its PRs stay owned by the project.
    branchName: resolveProjectBranchName(project._id, project),
    baseBranch: project.baseBranch,
  };
}

/**
 * True while an owned session holds its sandbox for something else: a turn
 * open (a chat reply or a run), a start/stop in flight, or a project's build
 * or interview (`ownerHoldsSession`). A new run or build waits (user starts
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
  if (await ownerHoldsSession(db, session)) return true;
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
  // A project task's session is its project's: the project mirrors into it.
  if (workSessionOwner(entity).kind !== entity.kind) return;
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

/** How long a branch move waits for the project's session to go idle. */
const BRANCH_SYNC_RETRY_MS = 60_000;

/**
 * A project's PR merged, so the next cycle works on a fresh branch version:
 * bumps `branchVersion` and the branch on the project, then moves the session
 * (`syncProjectSessionBranch`).
 */
export async function rotateProjectBranch(
  ctx: MutationCtx,
  project: Doc<"projects">,
): Promise<void> {
  const nextVersion = (project.branchVersion ?? 1) + 1;
  await ctx.db.patch(project._id, {
    branchVersion: nextVersion,
    branchName: buildProjectBranchName(project._id, nextVersion),
  });
  await syncProjectSessionBranch(ctx, project._id);
}

/**
 * The one writer of a project session's branch after insert (a merged PR's
 * rotation, a branch edit). The session's VM is checked out on the old
 * branch, so it is deleted, a start in flight is fenced off by the bumped
 * start attempt (and so is a run's or interview's attach), and the next
 * start boots a fresh checkout — all in one write. While the session is busy
 * (a turn, a run, a build, an interview, a start or stop) the move waits and
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

type TaskStatusSource = Pick<Doc<"agentTasks">, "_id" | "projectId">;

/**
 * A task's sandbox status, the one rule the task page, lists and MCP share:
 * the status of the session it works on (`workSessionOwner`), or
 * undefined before that session exists.
 */
export async function taskSandboxStatus(
  db: DatabaseReader,
  task: TaskStatusSource,
): Promise<Doc<"sessions">["status"] | undefined> {
  return (await findWorkSession(db, task))?.status;
}

/**
 * `taskSandboxStatus` for a list: one indexed read per repo and owner kind
 * for live sessions, never one session read per row. A task absent from the
 * live map has a closed (or no) sandbox.
 */
export async function liveTaskSandboxStatuses(
  db: DatabaseReader,
  repoIds: Iterable<Id<"githubRepos">>,
): Promise<(task: TaskStatusSource) => Doc<"sessions">["status"] | undefined> {
  const ids = [...repoIds];
  const [byTask, byProject] = await Promise.all([
    liveOwnedSessionStatuses(db, ids, "task"),
    liveOwnedSessionStatuses(db, ids, "project"),
  ]);
  return (task) => {
    const owner = workSessionOwner(task);
    return owner.kind === "project"
      ? byProject.get(String(owner.projectId))
      : byTask.get(String(owner.taskId));
  };
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
 * The owner left the board (a task done/cancelled/deleted, a project
 * completed/cancelled/deleted): stop its sandbox, archive its session and
 * start the 48h sandbox delete grace.
 */
export async function retireOwnedSession(
  ctx: MutationCtx,
  owner: OwnedSessionOwner,
): Promise<void> {
  const session = await findOwnedSession(ctx.db, owner);
  if (!session) return;
  // A `closed` row's VM is stopped: every path that runs it (a start or a
  // task run's claim) moves the row off `closed` first. Silent, like the
  // run's own stop.
  if (session.status !== "closed") {
    await requestSessionSandboxStop(ctx, session._id, {
      stopReason: { kind: "task" },
    });
  }
  const stopped = await ctx.db.get(session._id);
  if (stopped) await archiveSession(ctx, stopped);
}

/**
 * The task moved to another repo or into a project: its session (sandbox,
 * branch checkout and chat are bound to the old repo / the quick-task path)
 * retires and stops belonging to the task (soft delete), so the next use
 * creates a fresh session where the task now lives (a project task works on
 * its project's session). The one place a task move touches its session;
 * called by every move mutation.
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

/** Whether an edit moves a task off its session: new repo, or into a project. */
export function taskMoveDetachesSession(
  task: Pick<Doc<"agentTasks">, "repoId" | "projectId">,
  next: { repoId?: Id<"githubRepos">; projectId?: Id<"projects"> | null },
): boolean {
  const changesRepo =
    next.repoId !== undefined && next.repoId !== task.repoId;
  const entersProject =
    task.projectId === undefined &&
    next.projectId !== undefined &&
    next.projectId !== null;
  return changesRepo || entersProject;
}

/**
 * The owner came back (reopened or restored): its session is live again.
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

/**
 * The one lifecycle mapping: an owner entering a terminal state retires its
 * session, one leaving it revives it. A task: done/cancelled. A project:
 * completed/cancelled. A project task has no session of its own.
 */
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
  task: Pick<Doc<"agentTasks">, "_id" | "projectId">,
  previous: Doc<"agentTasks">["status"],
  next: Doc<"agentTasks">["status"],
): Promise<void> {
  // A project task's status does not touch its project's session.
  const owner = workSessionOwner(task);
  if (owner.kind !== "task") return;
  await syncOwnedSessionWithTerminal(
    ctx,
    owner,
    isTerminalTaskStatus(previous),
    isTerminalTaskStatus(next),
  );
}

/**
 * Project phase (or delete) → its session. Reads the project's current
 * state rather than a transition, so it is safe to call after any write and
 * to run late (`syncProjectSessionLifecycle`): a completed, cancelled or
 * deleted project's session is retired, any other is live.
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
  const retired =
    isTerminalProjectPhase(project.phase) || project.deletedAt !== undefined;
  // The build or interview stops first; that mutation retires the session.
  if (retired && !isSessionArchived(session) && projectHoldsSession(project)) {
    await ctx.scheduler.runAfter(
      0,
      internal.buildWorkflow.releaseProjectSessionForRetire,
      { projectId },
    );
    return;
  }
  await syncOwnedSessionWithTerminal(
    ctx,
    { kind: "project", projectId },
    isSessionArchived(session),
    retired,
  );
}

/**
 * `syncProjectSession` for phase writers that cannot import this module
 * (`functions.ts` stays a leaf): scheduled right after the write.
 */
export const syncProjectSessionLifecycle = internalMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await syncProjectSession(ctx, args.projectId);
    return null;
  },
});
