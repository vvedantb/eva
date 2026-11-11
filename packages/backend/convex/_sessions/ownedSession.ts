import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type {
  DatabaseReader,
  MutationCtx,
  QueryCtx,
} from "../_generated/server";
import { allocateNumId } from "../numId";
import { getAIModelProvider } from "../validators";
import {
  buildProjectBranchName,
  buildTaskBranchName,
  resolveProjectBranchName,
} from "../_git/branchNames";
import { composerTraitFields } from "../_shared/composerTraits";
import {
  createSessionChat,
  ensureMainChat,
  findMainChat,
  type ChatSettingsSource,
} from "../_sessionChats/helpers";
import { resolveSessionBaseBranch } from "./baseBranch";
import { archiveSession, isSessionArchived, unarchiveSession } from "./archive";
import {
  findOwnedSession,
  sessionOwnerEntityId,
  type OwnedSessionOwner,
} from "./owner";
import { requestSessionSandboxStop } from "./sandbox";
import { isTaskRunning } from "../_agentTasks/runState";
import { isProjectBuilding } from "../_projects/buildState";
import { findOpenTurn } from "../_chat/turnStore";
import {
  hasOpenChatTurn,
  isLegacyChatExecuting,
} from "../_chat/turnProjection";
import { markAllRunningExited } from "../backgroundProcesses";
import { nextSandboxStartAttempt } from "../_sandbox/transitions";

/**
 * The hidden session behind a quick task (`owner: { kind: "task" }`) or a
 * project (`owner: { kind: "project" }`). The owner stays the product
 * surface; its session runs the sandbox and the chat. A project's tasks have
 * no session of their own: they work on the project's.
 *
 *   owner created ──first need──▶ ensureOwnedSession (one session, never two)
 *   task done / cancelled / deleted,
 *   project completed / cancelled / deleted ──▶ retireOwnedSession (stop + archive)
 *   reopened / restored ──▶ reviveOwnedSession (unarchive)
 */

/** The owner value for a quick task's session. */
export function taskSessionOwner(taskId: Id<"agentTasks">): OwnedSessionOwner {
  return { kind: "task", taskId };
}

/** The owner value for a project's session. */
export function projectSessionOwner(
  projectId: Id<"projects">,
): OwnedSessionOwner {
  return { kind: "project", projectId };
}

/**
 * The session a task works on (runs, chat, sandbox): its own for a quick
 * task, its project's for a project task.
 */
export function taskWorkSessionOwner(
  task: Pick<Doc<"agentTasks">, "_id" | "projectId">,
): OwnedSessionOwner {
  return task.projectId !== undefined
    ? projectSessionOwner(task.projectId)
    : taskSessionOwner(task._id);
}

/** A task's or project's session and its Main chat. */
export type OwnedSessionContext = {
  session: Doc<"sessions">;
  mainChat: Doc<"sessionChats">;
};

/** The loaded task or project an owned session belongs to. */
export type OwnerEntity =
  | { kind: "task"; task: Doc<"agentTasks"> }
  | { kind: "project"; project: Doc<"projects"> };

/** Whether a task owns a session of its own: quick tasks only. */
export function taskOwnsSession(
  task: Pick<Doc<"agentTasks">, "projectId">,
): boolean {
  return task.projectId === undefined;
}

function ownerOf(entity: OwnerEntity): OwnedSessionOwner {
  return entity.kind === "task"
    ? taskSessionOwner(entity.task._id)
    : projectSessionOwner(entity.project._id);
}

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
 * Returns the owner's session, inserting it (and its Main chat) the first
 * time anything needs it. The lookup and the insert run in the caller's
 * mutation, so `findOwnedSession`'s `.unique()` never sees two rows. Starts no
 * sandbox and generates no title: the session borrows its owner's title and
 * stays `closed` until something starts it. It takes a normal session `numId`;
 * the visible session numbers may skip it.
 */
export async function ensureOwnedSession(
  ctx: MutationCtx,
  entity: OwnerEntity,
): Promise<OwnedSessionContext> {
  const found = await findOrInsertOwnedSession(ctx, entity);
  // An owner that still holds its own sandbox hands it over first, so no path
  // (run, chat, Start, MCP, mobile) ever boots a second VM for it.
  if ((await adoptLegacySandbox(ctx, entity, found.session)) !== "moved") {
    return found;
  }
  const session = await ctx.db.get(found.session._id);
  if (!session) throw new Error("Owned session was not found");
  return { session, mainChat: found.mainChat };
}

/** The session a task works on, created on first need (`taskWorkSessionOwner`). */
export async function ensureTaskWorkSession(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
): Promise<OwnedSessionContext> {
  if (task.projectId === undefined) {
    return await ensureOwnedSession(ctx, { kind: "task", task });
  }
  const project = await ctx.db.get(task.projectId);
  if (!project) throw new Error("Project not found");
  return await ensureOwnedSession(ctx, { kind: "project", project });
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
  const { session, mainChat } = await ensureTaskWorkSession(ctx, task);
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
  await adoptChatDrafts(ctx, { kind: "task", task }, chat);
  return { session, chat };
}

/** A session and one of its chats. */
export type OwnerChat = {
  session: Doc<"sessions">;
  chat: Doc<"sessionChats">;
};

/**
 * The chat an owner talks in, created on first need: a task's
 * (`ensureTaskChat`) or a project's Main chat.
 */
export async function ensureOwnerChat(
  ctx: MutationCtx,
  entity: OwnerEntity,
): Promise<OwnerChat> {
  if (entity.kind === "task") return await ensureTaskChat(ctx, entity.task);
  const { session, mainChat } = await ensureOwnedSession(ctx, entity);
  return { session, chat: mainChat };
}

/** `ensureOwnerChat` without the writes: null until something needed it. */
export async function findOwnerChat(
  db: DatabaseReader,
  entity: OwnerEntity,
): Promise<OwnerChat | null> {
  const session =
    entity.kind === "task"
      ? await findTaskWorkSession(db, entity.task)
      : await findProjectSession(db, entity.project._id);
  if (!session) return null;
  const chat =
    entity.kind === "task" && entity.task.projectId !== undefined
      ? await findProjectTaskChat(db, entity.task._id)
      : await findMainChat(db, session._id);
  return chat ? { session, chat } : null;
}

/** A project task's own chat in its project's session, if it has one. */
export async function findProjectTaskChat(
  db: DatabaseReader,
  taskId: Id<"agentTasks">,
): Promise<Doc<"sessionChats"> | null> {
  return await db
    .query("sessionChats")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .first();
}

/**
 * The chat settings an owner's new chat starts from: its last chat pick, else
 * its run model, else `fallbackModel`. Kept apart from the run `model`.
 */
function ownerChatSettings(
  entity: OwnerEntity,
  fallbackModel: Doc<"sessions">["lastModel"],
): ChatSettingsSource {
  const doc = entity.kind === "task" ? entity.task : entity.project;
  const model = doc.lastChatModel ?? doc.model ?? fallbackModel;
  return {
    providerAccountId: doc.providerAccountId,
    ...(model !== undefined
      ? { lastModel: model, provider: getAIModelProvider(model) }
      : {}),
    ...composerTraitFields({
      reasoningLevel: doc.lastReasoningLevel,
      thinkingEnabled: doc.lastThinkingEnabled,
      use1mContext: doc.lastUse1mContext,
      fastMode: doc.lastFastMode,
    }),
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

async function findOrInsertOwnedSession(
  ctx: MutationCtx,
  entity: OwnerEntity,
): Promise<OwnedSessionContext> {
  const owner = ownerOf(entity);
  const existing = await findOwnedSession(ctx.db, owner);
  if (existing) {
    return { session: existing, mainChat: await ensureMainChat(ctx, existing) };
  }
  const seed = ownedSessionSeed(entity);
  const repo = await ctx.db.get(seed.repoId);
  if (!repo) throw new Error("Repository not found");
  // The chat keeps its own sticky model, apart from the owner's run `model`.
  const settings = ownerChatSettings(entity, repo.defaultModel);
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
    ...settings,
    updatedAt: Date.now(),
  });
  const session = await ctx.db.get(sessionId);
  if (!session) throw new Error("Owned session was not created");
  const mainChat = await ensureMainChat(ctx, session);
  await adoptChatDrafts(ctx, entity, mainChat);
  return { session, mainChat };
}

/**
 * The users who can hold per-user rows for an owner's chat (drafts, read
 * markers), which are indexed by user first. A task: owner, assignee,
 * subscribers. A project: owner, lead, members, code reviewer.
 */
export async function ownerChatUserIds(
  db: DatabaseReader,
  entity: OwnerEntity,
): Promise<Id<"users">[]> {
  if (entity.kind === "project") {
    const { project } = entity;
    return [
      ...new Set<Id<"users">>([
        project.userId,
        ...(project.projectLead ? [project.projectLead] : []),
        ...(project.members ?? []),
        ...(project.codeReviewer ? [project.codeReviewer] : []),
      ]),
    ];
  }
  const { task } = entity;
  const subscribers = await db
    .query("taskSubscribers")
    .withIndex("by_task", (q) => q.eq("taskId", task._id))
    .collect();
  return [
    ...new Set<Id<"users">>([
      task.createdBy,
      ...(task.assignedTo ? [task.assignedTo] : []),
      ...subscribers.map((row) => row.userId),
    ]),
  ];
}

/**
 * The owner chat's unsent composer drafts become the session chat's, so text
 * typed before the session existed is still there after the first send.
 * Drafts are indexed by user first (`ownerChatUserIds`).
 */
export async function adoptChatDrafts(
  ctx: MutationCtx,
  entity: OwnerEntity,
  chat: Doc<"sessionChats">,
): Promise<void> {
  const userIds = await ownerChatUserIds(ctx.db, entity);
  const drafts = (
    await Promise.all(
      userIds.map((userId) =>
        entity.kind === "task"
          ? ctx.db
              .query("drafts")
              .withIndex("by_user_and_task", (q) =>
                q.eq("userId", userId).eq("taskId", entity.task._id),
              )
              .collect()
          : ctx.db
              .query("drafts")
              .withIndex("by_user_and_project", (q) =>
                q.eq("userId", userId).eq("projectId", entity.project._id),
              )
              .collect(),
      ),
    )
  ).flat();
  const legacyKind = entity.kind === "task" ? "taskChat" : "projectChat";
  for (const draft of drafts) {
    if (draft.kind !== legacyKind) continue;
    await ctx.db.patch(draft._id, {
      kind: "sessionChat",
      taskId: undefined,
      projectId: undefined,
      sessionId: chat.sessionId,
      chatId: chat._id,
    });
  }
}

/**
 * Whether the owner's own sandbox can change hands now: nothing on the old
 * owner path is starting, stopping or running on it. A project also waits
 * for a build, a task run, or an interview started before projects had
 * sessions: those still write `projects.sandboxId`.
 */
async function legacySandboxSettled(
  ctx: QueryCtx,
  entity: OwnerEntity,
): Promise<boolean> {
  const doc = entity.kind === "task" ? entity.task : entity.project;
  const status =
    entity.kind === "task"
      ? entity.task.reviewTaskSandboxStatus
      : entity.project.reviewProjectSandboxStatus;
  if (
    status === "starting" ||
    status === "stopping" ||
    isLegacyChatExecuting(doc) ||
    doc.pendingTurn !== undefined
  ) {
    return false;
  }
  if (entity.kind === "task" && isTaskRunning(entity.task)) return false;
  if (entity.kind === "project") {
    const { project } = entity;
    if (isProjectBuilding(project) || project.activeWorkflowId !== undefined) {
      return false;
    }
    const tasks = await ctx.db
      .query("agentTasks")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();
    if (tasks.some(isTaskRunning)) return false;
  }
  return (await findOpenTurn(ctx, doc._id)) === null;
}

/** Fields the old task and project sandbox paths keep on the owner row. */
const LEGACY_SANDBOX_CLEARED = {
  sandboxId: undefined,
  sandboxStartAttempt: undefined,
  devPort: undefined,
  devCommand: undefined,
  previewPath: undefined,
  previewPanePaths: undefined,
  terminalHistoryTail: undefined,
  terminalPanes: undefined,
  sandboxBranch: undefined,
  sandboxGitSync: undefined,
};

/**
 * Moves the owner's own sandbox (and its preview/terminal state) onto its
 * session and clears it on the owner: one owner per VM, so task and project
 * sweeps stop acting on it. `busy`: the old path is mid-start/stop/turn,
 * leave it for a later call. `conflict`: the session already holds another
 * VM. A project task's own sandbox (its old task chat's, on the task branch)
 * never moves: it is not the project's checkout.
 */
export async function adoptLegacySandbox(
  ctx: MutationCtx,
  entity: OwnerEntity,
  session: Doc<"sessions">,
): Promise<"none" | "moved" | "busy" | "conflict"> {
  const doc = entity.kind === "task" ? entity.task : entity.project;
  if (
    doc.sandboxId === undefined ||
    (entity.kind === "task" && entity.task.projectId !== undefined)
  ) {
    return "none";
  }
  if (session.sandboxId !== undefined && session.sandboxId !== doc.sandboxId) {
    return "conflict";
  }
  if (!(await legacySandboxSettled(ctx, entity))) return "busy";
  const status =
    entity.kind === "task"
      ? entity.task.reviewTaskSandboxStatus
      : entity.project.reviewProjectSandboxStatus;
  await ctx.db.patch(session._id, {
    sandboxId: doc.sandboxId,
    status: status === "active" ? "active" : "closed",
    sandboxStartAttempt: doc.sandboxStartAttempt ?? session.sandboxStartAttempt,
    devPort: doc.devPort ?? session.devPort,
    devCommand: doc.devCommand ?? session.devCommand,
    previewPath: doc.previewPath ?? session.previewPath,
    previewPanePaths: doc.previewPanePaths ?? session.previewPanePaths,
    terminalHistoryTail: doc.terminalHistoryTail ?? session.terminalHistoryTail,
    terminalPanes: doc.terminalPanes ?? session.terminalPanes,
    sandboxBranch: doc.sandboxBranch ?? session.sandboxBranch,
    sandboxGitSync: doc.sandboxGitSync ?? session.sandboxGitSync,
  });
  if (entity.kind === "task") {
    await ctx.db.patch(entity.task._id, {
      ...LEGACY_SANDBOX_CLEARED,
      reviewTaskSandboxStatus: undefined,
      sandboxDeleteAfter: undefined,
    });
  } else {
    await ctx.db.patch(entity.project._id, {
      ...LEGACY_SANDBOX_CLEARED,
      reviewProjectSandboxStatus: undefined,
      lastSandboxActivity: undefined,
    });
  }
  return "moved";
}

/**
 * True while an owned session holds its sandbox for something else: a turn
 * open (a chat reply or a run) or a start/stop in flight. A new run or build
 * waits (user starts are refused, scheduled ones retry): the same
 * one-agent-per-sandbox rule the chat queue applies to runs.
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
 * the title (the session borrows it), the base branch a fresh sandbox checks
 * out from and, for a project, its branch. The owner row stays the source;
 * nothing else writes these (`rotateProjectBranch` calls this too).
 */
export async function mirrorOwnerIntoSession(
  ctx: MutationCtx,
  entity: OwnerEntity,
): Promise<void> {
  if (entity.kind === "task" && !taskOwnsSession(entity.task)) return;
  const session = await findOwnedSession(ctx.db, ownerOf(entity));
  if (!session) return;
  const seed = ownedSessionSeed(entity);
  const repo = await ctx.db.get(session.repoId);
  const baseBranch = resolveSessionBaseBranch(
    { baseBranch: seed.baseBranch },
    repo,
  );
  if (
    session.title === seed.title &&
    session.baseBranch === baseBranch &&
    session.branchName === seed.branchName
  ) {
    return;
  }
  await ctx.db.patch(session._id, {
    title: seed.title,
    baseBranch,
    branchName: seed.branchName,
  });
}

/**
 * The one writer of a project's branch rotation: its PR merged, so the next
 * cycle works on a fresh branch version. Bumps `branchVersion` and the
 * branch on the project, points the session at the new branch, and drops the
 * session's sandbox (checked out on the merged branch): the VM is deleted, a
 * start in flight is fenced off by the bumped start attempt, and the next
 * start boots a fresh checkout. All in this one mutation.
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
  const rotated = await ctx.db.get(project._id);
  if (!rotated) return;
  const session = await findOwnedSession(
    ctx.db,
    projectSessionOwner(project._id),
  );
  // Not migrated yet: the old project sandbox is on the merged branch too.
  const legacySandboxId = rotated.sandboxId;
  if (legacySandboxId !== undefined) {
    await ctx.scheduler.runAfter(0, internal.sandbox.deleteSandbox, {
      sandboxId: legacySandboxId,
      repoId: rotated.repoId,
    });
    await ctx.db.patch(rotated._id, {
      sandboxId: undefined,
      lastSandboxActivity: undefined,
    });
  }
  if (!session) return;
  await mirrorOwnerIntoSession(ctx, { kind: "project", project: rotated });
  if (session.sandboxId !== undefined) {
    await ctx.scheduler.runAfter(0, internal.sandbox.deleteSandbox, {
      sandboxId: session.sandboxId,
      repoId: session.repoId,
    });
  }
  await markAllRunningExited(ctx.db, session._id);
  await ctx.db.patch(session._id, {
    sandboxId: undefined,
    status: "closed",
    sandboxStartAttempt: nextSandboxStartAttempt(session.sandboxStartAttempt),
    ptySessionId: undefined,
    sandboxBranch: undefined,
    sandboxGitSync: undefined,
    updatedAt: Date.now(),
  });
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
          .filter((q) => q.eq(q.field("owner.kind"), kind))
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

/** The task's own session, or null before anything needed one. */
export async function findTaskSession(
  db: DatabaseReader,
  taskId: Id<"agentTasks">,
): Promise<Doc<"sessions"> | null> {
  return await findOwnedSession(db, taskSessionOwner(taskId));
}

/** The project's session, or null before anything needed one. */
export async function findProjectSession(
  db: DatabaseReader,
  projectId: Id<"projects">,
): Promise<Doc<"sessions"> | null> {
  return await findOwnedSession(db, projectSessionOwner(projectId));
}

/** The session a task works on (`taskWorkSessionOwner`), if it exists yet. */
export async function findTaskWorkSession(
  db: DatabaseReader,
  task: Pick<Doc<"agentTasks">, "_id" | "projectId">,
): Promise<Doc<"sessions"> | null> {
  return await findOwnedSession(db, taskWorkSessionOwner(task));
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
  // Any VM the session holds is stopped, even behind a `closed` row: a run
  // resumes it without flipping the status. Silent, like the run's own stop.
  if (session.sandboxId !== undefined || session.status !== "closed") {
    await requestSessionSandboxStop(ctx, session._id, {
      stopReason: { kind: "task" },
    });
  }
  const stopped = await ctx.db.get(session._id);
  if (stopped) await archiveSession(ctx, stopped);
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

/** Project phases that retire the project's session. */
export function isTerminalProjectPhase(phase: Doc<"projects">["phase"]) {
  return phase === "completed" || phase === "cancelled";
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
  if (!taskOwnsSession(task)) return;
  await syncOwnedSessionWithTerminal(
    ctx,
    taskSessionOwner(task._id),
    isTerminalTaskStatus(previous),
    isTerminalTaskStatus(next),
  );
}

/** Project phase change → its session (`syncOwnedSessionWithTerminal`). */
export async function syncOwnedSessionWithProjectPhase(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  previous: Doc<"projects">["phase"],
  next: Doc<"projects">["phase"],
): Promise<void> {
  await syncOwnedSessionWithTerminal(
    ctx,
    projectSessionOwner(projectId),
    isTerminalProjectPhase(previous),
    isTerminalProjectPhase(next),
  );
}
