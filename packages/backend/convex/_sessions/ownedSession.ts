import type { Doc, Id } from "../_generated/dataModel";
import type {
  DatabaseReader,
  MutationCtx,
  QueryCtx,
} from "../_generated/server";
import { allocateNumId } from "../numId";
import { getAIModelProvider } from "../validators";
import { buildTaskBranchName } from "../_git/branchNames";
import { composerTraitFields } from "../_shared/composerTraits";
import { ensureMainChat } from "../_sessionChats/helpers";
import { resolveSessionBaseBranch } from "./baseBranch";
import { archiveSession, isSessionArchived, unarchiveSession } from "./archive";
import {
  findOwnedSession,
  findQuickTaskSession,
  findTaskSession,
  sessionOwnerTaskId,
  taskSessionOwner,
  taskUsesOwnedSession,
} from "./owner";
import { requestSessionSandboxStop } from "./sandbox";
import { isTaskRunning } from "../_agentTasks/runState";
import { findOpenTurn } from "../_chat/turnStore";
import {
  hasOpenChatTurn,
  isLegacyChatExecuting,
} from "../_chat/turnProjection";

/**
 * The session behind a quick task (`owner: { kind: "task" }`). The task stays
 * the product surface; its session runs the sandbox and the chat. Projects get
 * the same treatment in a later step, so only the task owner is built here.
 *
 *   task created ──first need──▶ ensureOwnedSession (one session, never two)
 *   task done / cancelled / deleted ──▶ retireOwnedSession (stop + archive)
 *   task reopened / restored ──▶ reviveOwnedSession (unarchive)
 */


/** A task's session and its Main chat. */
export type OwnedSessionContext = {
  session: Doc<"sessions">;
  mainChat: Doc<"sessionChats">;
};

// The lookups live in the leaf `owner.ts` so low-level modules can use them.
export {
  findQuickTaskSession,
  findTaskSession,
  taskSessionOwner,
  taskUsesOwnedSession,
};

/**
 * Returns the task's session, inserting it (and its Main chat) the first time
 * anything needs it. The lookup and the insert run in the caller's mutation,
 * so `findOwnedSession`'s `.unique()` never sees two rows. Starts no sandbox
 * and generates no title: the session borrows the task's title and stays
 * `closed` until something starts it. It takes a normal session `numId`; the
 * visible session numbers may skip it.
 */
export async function ensureOwnedSession(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
): Promise<OwnedSessionContext> {
  const found = await findOrInsertOwnedSession(ctx, task);
  // A task that still holds its own sandbox hands it over first, so no path
  // (run, chat, Start, MCP, mobile) ever boots a second VM for the task.
  if ((await adoptTaskSandbox(ctx, task, found.session)) !== "moved") {
    return found;
  }
  const session = await ctx.db.get(found.session._id);
  if (!session) throw new Error("Task session was not found");
  return { session, mainChat: found.mainChat };
}

async function findOrInsertOwnedSession(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
): Promise<OwnedSessionContext> {
  const owner = taskSessionOwner(task._id);
  const existing = await findOwnedSession(ctx.db, owner);
  if (existing) {
    return { session: existing, mainChat: await ensureMainChat(ctx, existing) };
  }
  if (!task.repoId) throw new Error("Task has no repository");
  const repo = await ctx.db.get(task.repoId);
  if (!repo) throw new Error("Repository not found");
  // The chat keeps its own sticky model, apart from the task's run `model`:
  // seeded from the task's last chat pick, else the run model.
  const model = task.lastChatModel ?? task.model ?? repo.defaultModel;
  const sessionId = await ctx.db.insert("sessions", {
    repoId: task.repoId,
    userId: task.createdBy,
    createdBy: task.createdBy,
    title: task.title,
    owner,
    status: "closed",
    numId: await allocateNumId(ctx.db, task.repoId, "sessions"),
    // The task's own branch: its PRs stay owned by the task
    // (`resolvePrOwnerFromBranch`).
    branchName: buildTaskBranchName(task._id),
    baseBranch: resolveSessionBaseBranch({ baseBranch: task.baseBranch }, repo),
    providerAccountId: task.providerAccountId,
    ...(model !== undefined
      ? { lastModel: model, provider: getAIModelProvider(model) }
      : {}),
    ...composerTraitFields({
      reasoningLevel: task.lastReasoningLevel,
      thinkingEnabled: task.lastThinkingEnabled,
      use1mContext: task.lastUse1mContext,
      fastMode: task.lastFastMode,
    }),
    updatedAt: Date.now(),
  });
  const session = await ctx.db.get(sessionId);
  if (!session) throw new Error("Task session was not created");
  const mainChat = await ensureMainChat(ctx, session);
  await adoptTaskChatDrafts(ctx, task, mainChat);
  return { session, mainChat };
}

/**
 * The users who can hold per-user rows for a task's chat (drafts, read
 * markers), which are indexed by user first: owner, assignee, subscribers.
 */
export async function taskChatUserIds(
  db: DatabaseReader,
  task: Doc<"agentTasks">,
): Promise<Id<"users">[]> {
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
 * The task chat's unsent composer drafts become the Main chat's, so text
 * typed before the session existed is still there after the first send.
 * Drafts are indexed by user first: the task's owner, assignee and
 * subscribers are the users who can have one.
 */
export async function adoptTaskChatDrafts(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
  mainChat: Doc<"sessionChats">,
): Promise<void> {
  const userIds = await taskChatUserIds(ctx.db, task);
  const drafts = (
    await Promise.all(
      userIds.map((userId) =>
        ctx.db
          .query("drafts")
          .withIndex("by_user_and_task", (q) =>
            q.eq("userId", userId).eq("taskId", task._id),
          )
          .collect(),
      ),
    )
  ).flat();
  for (const draft of drafts) {
    if (draft.kind !== "taskChat") continue;
    await ctx.db.patch(draft._id, {
      kind: "sessionChat",
      taskId: undefined,
      sessionId: mainChat.sessionId,
      chatId: mainChat._id,
    });
  }
}

/**
 * Whether the task's own sandbox can change hands now: nothing on the task
 * path is starting, stopping or running on it.
 */
async function taskSandboxSettled(
  ctx: QueryCtx,
  task: Doc<"agentTasks">,
): Promise<boolean> {
  if (
    task.reviewTaskSandboxStatus === "starting" ||
    task.reviewTaskSandboxStatus === "stopping" ||
    isTaskRunning(task) ||
    isLegacyChatExecuting(task) ||
    task.pendingTurn !== undefined
  ) {
    return false;
  }
  return (await findOpenTurn(ctx, task._id)) === null;
}

/**
 * Moves the task's own sandbox (and its preview/terminal state) onto its
 * session and clears it on the task: one owner per VM, so task sweeps stop
 * acting on it. `busy`: the task path is mid-start/stop/turn, leave it for a
 * later call. `conflict`: the session already holds another VM.
 */
export async function adoptTaskSandbox(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
  session: Doc<"sessions">,
): Promise<"none" | "moved" | "busy" | "conflict"> {
  if (task.sandboxId === undefined || task.projectId !== undefined) {
    return "none";
  }
  if (session.sandboxId !== undefined && session.sandboxId !== task.sandboxId) {
    return "conflict";
  }
  if (!(await taskSandboxSettled(ctx, task))) return "busy";
  await ctx.db.patch(session._id, {
    sandboxId: task.sandboxId,
    status: task.reviewTaskSandboxStatus === "active" ? "active" : "closed",
    sandboxStartAttempt: task.sandboxStartAttempt ?? session.sandboxStartAttempt,
    devPort: task.devPort ?? session.devPort,
    devCommand: task.devCommand ?? session.devCommand,
    previewPath: task.previewPath ?? session.previewPath,
    previewPanePaths: task.previewPanePaths ?? session.previewPanePaths,
    terminalHistoryTail: task.terminalHistoryTail ?? session.terminalHistoryTail,
    terminalPanes: task.terminalPanes ?? session.terminalPanes,
    sandboxBranch: task.sandboxBranch ?? session.sandboxBranch,
    sandboxGitSync: task.sandboxGitSync ?? session.sandboxGitSync,
  });
  await ctx.db.patch(task._id, {
    sandboxId: undefined,
    reviewTaskSandboxStatus: undefined,
    sandboxStartAttempt: undefined,
    sandboxDeleteAfter: undefined,
    devPort: undefined,
    devCommand: undefined,
    previewPath: undefined,
    previewPanePaths: undefined,
    terminalHistoryTail: undefined,
    terminalPanes: undefined,
    sandboxBranch: undefined,
    sandboxGitSync: undefined,
  });
  return "moved";
}

/**
 * True while the task's session holds its sandbox for something else: a turn
 * open (a chat reply or a run) or a start/stop in flight. A new run waits
 * (user starts are refused, scheduled ones retry): the same
 * one-agent-per-sandbox rule the chat queue applies to runs.
 */
export async function taskSessionBusy(
  db: DatabaseReader,
  taskId: Id<"agentTasks">,
): Promise<boolean> {
  const session = await findTaskSession(db, taskId);
  if (!session) return false;
  if (session.status === "starting" || session.status === "stopping") {
    return true;
  }
  return await hasOpenChatTurn(db, session._id);
}

/**
 * Keeps the session's copies of task fields in step after a task edit: the
 * title (the session borrows it) and the base branch a fresh sandbox checks
 * out from. The task row stays the source; nothing writes these otherwise.
 */
export async function mirrorTaskIntoOwnedSession(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
): Promise<void> {
  if (!taskUsesOwnedSession(task)) return;
  const session = await findTaskSession(ctx.db, task._id);
  if (!session) return;
  const repo = await ctx.db.get(session.repoId);
  const baseBranch = resolveSessionBaseBranch(
    { baseBranch: task.baseBranch },
    repo,
  );
  if (session.title === task.title && session.baseBranch === baseBranch) return;
  await ctx.db.patch(session._id, { title: task.title, baseBranch });
}

const LIVE_SANDBOX_STATUSES = ["active", "starting", "stopping"] as const;

/**
 * Live sandbox status of every task session in these repos, keyed by task id.
 * Task lists show it as the task's sandbox status: one indexed read per repo
 * and live status (few rows), never one read per listed task. A task absent
 * from the map has a closed (or no) session sandbox.
 */
export async function liveTaskSessionStatuses(
  db: DatabaseReader,
  repoIds: Iterable<Id<"githubRepos">>,
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
              q.eq(q.field("owner.kind"), "task"),
              q.eq(q.field("deletedAt"), undefined),
            ),
          )
          .collect(),
      ),
    ),
  );
  const byTask = new Map<string, Doc<"sessions">["status"]>();
  for (const session of rows.flat()) {
    const taskId = sessionOwnerTaskId(session);
    if (taskId) byTask.set(String(taskId), session.status);
  }
  return byTask;
}

/**
 * The task left the board (done, cancelled, deleted): stop its sandbox,
 * archive its session and start the 48h sandbox delete grace.
 */
export async function retireOwnedSession(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
): Promise<void> {
  const session = await findTaskSession(ctx.db, taskId);
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
 * creates a fresh session where the task now lives. The one place a task
 * move touches its session; called by every move mutation.
 */
export async function detachOwnedSession(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
): Promise<void> {
  const session = await findTaskSession(ctx.db, taskId);
  if (!session) return;
  await retireOwnedSession(ctx, taskId);
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
 * The task came back (reopened or restored): its session is live again.
 * Clearing the archive also cancels the pending sandbox delete.
 */
export async function reviveOwnedSession(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
): Promise<void> {
  const session = await findTaskSession(ctx.db, taskId);
  if (!session || !isSessionArchived(session)) return;
  await unarchiveSession(ctx, session._id, { touch: false });
}

/** Task statuses that retire the task's session. */
export function isTerminalTaskStatus(status: Doc<"agentTasks">["status"]) {
  return status === "done" || status === "cancelled";
}

/**
 * The one status-change hook: a task entering done/cancelled retires its
 * session, a task leaving them revives it. Project tasks have no session.
 */
export async function syncOwnedSessionWithTaskStatus(
  ctx: MutationCtx,
  task: Pick<Doc<"agentTasks">, "_id" | "projectId">,
  previous: Doc<"agentTasks">["status"],
  next: Doc<"agentTasks">["status"],
): Promise<void> {
  if (!taskUsesOwnedSession(task)) return;
  const wasTerminal = isTerminalTaskStatus(previous);
  const isTerminal = isTerminalTaskStatus(next);
  if (isTerminal && !wasTerminal) await retireOwnedSession(ctx, task._id);
  if (wasTerminal && !isTerminal) await reviveOwnedSession(ctx, task._id);
}
