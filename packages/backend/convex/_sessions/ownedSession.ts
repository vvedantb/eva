import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader, MutationCtx } from "../_generated/server";
import { allocateNumId } from "../numId";
import { getAIModelProvider } from "../validators";
import { buildTaskBranchName } from "../_git/branchNames";
import { composerTraitFields } from "../_shared/composerTraits";
import { ensureMainChat } from "../_sessionChats/helpers";
import { resolveSessionBaseBranch } from "./baseBranch";
import { archiveSession, isSessionArchived, unarchiveSession } from "./archive";
import { findOwnedSession, type OwnedSessionOwner } from "./owner";
import { requestSessionSandboxStop } from "./sandbox";

/**
 * The session behind a quick task (`owner: { kind: "task" }`). The task stays
 * the product surface; its session runs the sandbox and the chat. Projects get
 * the same treatment in a later step, so only the task owner is built here.
 *
 *   task created ──first need──▶ ensureOwnedSession (one session, never two)
 *   task done / cancelled / deleted ──▶ retireOwnedSession (stop + archive)
 *   task reopened / restored ──▶ reviveOwnedSession (unarchive)
 */

/** The owner value for a quick task's session. */
export function taskSessionOwner(taskId: Id<"agentTasks">): OwnedSessionOwner {
  return { kind: "task", taskId };
}

/** A task's session and its Main chat. */
export type OwnedSessionContext = {
  session: Doc<"sessions">;
  mainChat: Doc<"sessionChats">;
};

/**
 * Whether a task runs on an owned session. Project tasks keep the project
 * sandbox and chat until projects move onto sessions.
 */
export function taskUsesOwnedSession(
  task: Pick<Doc<"agentTasks">, "projectId">,
): boolean {
  return task.projectId === undefined;
}

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
  return { session, mainChat: await ensureMainChat(ctx, session) };
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

/** The task's session, or null before anything needed one. */
export async function findTaskSession(
  db: DatabaseReader,
  taskId: Id<"agentTasks">,
): Promise<Doc<"sessions"> | null> {
  return await findOwnedSession(db, taskSessionOwner(taskId));
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
  // A closed session's VM is already stopped; the leak sweep owns strays.
  if (session.status !== "closed") {
    await requestSessionSandboxStop(ctx, session._id);
  }
  const stopped = await ctx.db.get(session._id);
  if (stopped) await archiveSession(ctx, stopped);
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
