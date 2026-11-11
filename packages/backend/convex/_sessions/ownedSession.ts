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
import { composerTraitFields } from "../_shared/composerTraits";
import {
  createSessionChat,
  ensureMainChat,
  type ChatSettingsSource,
} from "../_sessionChats/helpers";
import { resolveSessionBaseBranch } from "./baseBranch";
import { archiveSession, isSessionArchived, unarchiveSession } from "./archive";
import {
  findOwnedSession,
  findProjectSession,
  findProjectTaskChat,
  findQuickTaskSession,
  findTaskSession,
  findTaskWorkSession,
  isTerminalProjectPhase,
  projectSessionOwner,
  sessionOwnerEntityId,
  taskSessionOwner,
  taskUsesOwnedSession,
  taskWorkSessionOwner,
  type OwnedSessionOwner,
  type OwnerChat,
  type OwnerEntity,
} from "./owner";
import { requestSessionSandboxStop } from "./sandbox";
import {
  findOwnerChat,
  ownerHoldsSession,
  projectHoldsSession,
} from "./ownerState";
import { isTaskRunning } from "../_agentTasks/runState";
import { isProjectBuilding } from "../_projects/buildState";
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

/** A task's or project's session and its Main chat. */
export type OwnedSessionContext = {
  session: Doc<"sessions">;
  mainChat: Doc<"sessionChats">;
};

// The lookups live in the leaf `owner.ts` (and `ownerState.ts`) so
// low-level modules can use them.
export type { OwnerChat, OwnerEntity };
export {
  findOwnerChat,
  findProjectSession,
  findProjectTaskChat,
  findQuickTaskSession,
  findTaskSession,
  findTaskWorkSession,
  isTerminalProjectPhase,
  projectSessionOwner,
  taskSessionOwner,
  taskUsesOwnedSession,
  taskWorkSessionOwner,
};

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
 * Why an owner's old chat and sandbox cannot change hands now, or null when
 * they can. The one busy rule for sandbox adoption (`adoptLegacySandbox`)
 * and the migration: a run, build, task run or interview in flight (they
 * still write the owner's own `sandboxId` when started before sessions), a
 * chat turn open or pending (old path or session), the old sandbox or the
 * session's starting/stopping, or a message still queued on the owner.
 */
export async function ownerBusyReason(
  db: DatabaseReader,
  entity: OwnerEntity,
): Promise<string | null> {
  const doc = entity.kind === "task" ? entity.task : entity.project;
  if (entity.kind === "task" && isTaskRunning(entity.task)) {
    return "run in flight";
  }
  if (entity.kind === "project") {
    const { project } = entity;
    if (isProjectBuilding(project)) return "build in flight";
    if (project.activeWorkflowId !== undefined) return "interview in flight";
    const tasks = await db
      .query("agentTasks")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();
    if (tasks.some(isTaskRunning)) return "task run in flight";
  }
  if (
    doc.pendingTurn !== undefined ||
    doc.syntheticTurnMessageId !== undefined ||
    isLegacyChatExecuting(doc) ||
    (await hasOpenChatTurn(db, doc._id))
  ) {
    return "chat turn open";
  }
  // A project task has no sandbox of its own: only a quick task's or a
  // project's row status counts.
  const legacyStatus =
    entity.kind === "project"
      ? entity.project.reviewProjectSandboxStatus
      : taskUsesOwnedSession(entity.task)
        ? entity.task.reviewTaskSandboxStatus
        : undefined;
  if (legacyStatus === "starting" || legacyStatus === "stopping") {
    return `sandbox ${legacyStatus}`;
  }
  // `hasOpenChatTurn` above already covers the session's turns.
  const session = await findOwnedSession(
    db,
    entity.kind === "task"
      ? taskWorkSessionOwner(entity.task)
      : projectSessionOwner(entity.project._id),
  );
  if (session?.status === "starting" || session?.status === "stopping") {
    return `session sandbox ${session.status}`;
  }
  const queued = await db
    .query("queuedMessages")
    .withIndex("by_parent_and_order", (q) => q.eq("parentId", doc._id))
    .first();
  if (queued) return "queued message";
  return null;
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
 * VM. A project task has no sandbox of its own (its project has one, the
 * session's): task-row sandbox fields on it are ignored.
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
  if ((await ownerBusyReason(ctx.db, entity)) !== null) return "busy";
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
  if (entity.kind === "task" && !taskUsesOwnedSession(entity.task)) return;
  const session = await findOwnedSession(ctx.db, ownerOf(entity));
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
 * bumps `branchVersion` and the branch on the project, drops a not yet
 * migrated project VM (on the merged branch), then moves the session
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
  if (project.sandboxId !== undefined) {
    await ctx.scheduler.runAfter(0, internal.sandbox.deleteSandbox, {
      sandboxId: project.sandboxId,
      repoId: project.repoId,
    });
    await ctx.db.patch(project._id, {
      sandboxId: undefined,
      lastSandboxActivity: undefined,
    });
  }
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
    findProjectSession(ctx.db, projectId),
  ]);
  if (!project || !session) return;
  const branchName = resolveProjectBranchName(project._id, project);
  if (session.branchName === branchName) return;
  if (await ownedSessionBusy(ctx.db, projectSessionOwner(projectId))) {
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


/**
 * A project's sandbox status, one source at a time: its session's once it
 * has one, the project row's (not migrated yet) until then.
 */
export async function projectSandboxStatus(
  db: DatabaseReader,
  project: Pick<Doc<"projects">, "_id" | "reviewProjectSandboxStatus">,
): Promise<Doc<"sessions">["status"] | undefined> {
  const session = await findProjectSession(db, project._id);
  return session ? session.status : project.reviewProjectSandboxStatus;
}

type TaskStatusSource = Pick<
  Doc<"agentTasks">,
  "_id" | "projectId" | "reviewTaskSandboxStatus"
>;

/**
 * A task's sandbox status, the one rule the task page, lists and MCP share:
 * the session it works on (`taskWorkSessionOwner`) once that exists, else
 * the row that still holds it (a quick task's own, a project task's
 * project's, not migrated yet).
 */
export async function taskSandboxStatus(
  db: DatabaseReader,
  task: TaskStatusSource,
): Promise<Doc<"sessions">["status"] | undefined> {
  if (task.projectId !== undefined) {
    const project = await db.get(task.projectId);
    return project ? await projectSandboxStatus(db, project) : undefined;
  }
  const session = await findTaskSession(db, task._id);
  return session ? session.status : task.reviewTaskSandboxStatus;
}

/**
 * `taskSandboxStatus` for a list: one indexed read per repo and owner kind
 * for live sessions, and point reads only for rows whose session is not live
 * (a project read once per project), never one session scan per row.
 */
export async function liveTaskSandboxStatuses(
  db: DatabaseReader,
  repoIds: Iterable<Id<"githubRepos">>,
): Promise<
  (task: TaskStatusSource) => Promise<Doc<"sessions">["status"] | undefined>
> {
  const ids = [...repoIds];
  const [byTask, byProject] = await Promise.all([
    liveOwnedSessionStatuses(db, ids, "task"),
    liveOwnedSessionStatuses(db, ids, "project"),
  ]);
  const projectStatuses = new Map<
    string,
    Promise<Doc<"sessions">["status"] | undefined>
  >();
  return async (task) => {
    if (task.projectId !== undefined) {
      const key = String(task.projectId);
      const live = byProject.get(key);
      if (live) return live;
      const cached =
        projectStatuses.get(key) ?? taskSandboxStatus(db, task);
      projectStatuses.set(key, cached);
      return await cached;
    }
    const live = byTask.get(String(task._id));
    if (live) return live;
    // Not live on a session: only a row that still says live needs a read.
    const legacy = task.reviewTaskSandboxStatus;
    if (legacy === undefined || legacy === "closed") return undefined;
    return await taskSandboxStatus(db, task);
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
  const session = await findTaskSession(ctx.db, taskId);
  if (!session) return;
  await retireOwnedSession(ctx, taskSessionOwner(taskId));
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
  if (!taskUsesOwnedSession(task)) return;
  await syncOwnedSessionWithTerminal(
    ctx,
    taskSessionOwner(task._id),
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
    findProjectSession(ctx.db, projectId),
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
    projectSessionOwner(projectId),
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
