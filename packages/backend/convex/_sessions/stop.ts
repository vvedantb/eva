import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader, MutationCtx } from "../_generated/server";
import {
  authMutation,
  getProjectWithAccess,
  getSessionWithAccess,
  getTaskWithAccess,
  hasRepoAccess,
} from "../functions";
import { isTaskRunning } from "../_agentTasks/runState";
import { hasOpenChatTurn } from "../_chat/turnProjection";
import {
  getSessionChatOrThrow,
  type SessionChatContext,
} from "../_sessionChats/helpers";
import { cancelTaskRun } from "../_taskWorkflow/publicMutations";
import { cancelChatExecution } from "./execution";
import {
  chatOwner,
  findProjectSession,
  findTaskWorkSession,
  sessionOwnerTaskId,
} from "./owner";
import { findOwnerChat, ownerHoldsSession } from "./ownerState";
import { requestSessionSandboxStop } from "./sandbox";

/**
 * The two Stops. Web, mobile and MCP all call these, so a Stop does the same
 * thing on every surface:
 *
 *   stopChatTurn     stops the agent in one chat: the chat's open turn, and
 *                    the task run shown in it (a quick task's or project
 *                    task's run). A project build or interview is left alone;
 *                    Cancel build owns it. Queued messages then start.
 *   stopWorkSandbox  sleeps the sandbox of a session, task or project. It is
 *                    refused while the agent works on that sandbox (any chat
 *                    turn, a task run, a build or an interview): stop the
 *                    agent first, or wait.
 *
 * Neither creates a session: no session means there is nothing to stop.
 */

/**
 * Stops what holds one chat: the owner task's run when one runs, and the
 * chat's own turn. Each half is a no-op when idle. The caller checks access.
 */
async function stopOwnerTurn(
  ctx: MutationCtx,
  task: Doc<"agentTasks"> | null,
  chat: SessionChatContext | null,
): Promise<void> {
  if (task && isTaskRunning(task)) await cancelTaskRun(ctx, task);
  if (chat) await cancelChatExecution(ctx, chat);
}

/** Stops one chat and the task it speaks for (a quick or project task's). */
export async function stopChat(
  ctx: MutationCtx,
  context: SessionChatContext,
): Promise<void> {
  const owner = chatOwner(context.chat, context.session);
  const task = owner.kind === "task" ? await ctx.db.get(owner.taskId) : null;
  await stopOwnerTurn(ctx, task, context);
}

/** Stops a task's run and its chat, when that chat exists. */
export async function stopTask(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
): Promise<void> {
  await stopOwnerTurn(
    ctx,
    task,
    await findOwnerChat(ctx.db, { kind: "task", task }),
  );
}

/**
 * The Stop button of a chat. Name the chat, or the task when its chat may not
 * exist yet (a quick task's first run).
 */
export const stopChatTurn = authMutation({
  args: {
    target: v.union(
      v.object({ chatId: v.id("sessionChats") }),
      v.object({ taskId: v.id("agentTasks") }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { target }) => {
    if ("chatId" in target) {
      const chat = await getSessionChatOrThrow(ctx.db, target.chatId);
      if (!(await hasRepoAccess(ctx.db, chat.session.repoId, ctx.userId))) {
        throw new Error("Not authorized");
      }
      await stopChat(ctx, chat);
      return null;
    }
    await stopTask(
      ctx,
      await getTaskWithAccess(ctx.db, target.taskId, ctx.userId),
    );
    return null;
  },
});

/** Stopping kills the VM under any agent still working on it. */
async function sessionIsHeld(
  db: DatabaseReader,
  session: Doc<"sessions">,
): Promise<boolean> {
  const ownerTaskId = sessionOwnerTaskId(session);
  const ownerTask = ownerTaskId ? await db.get(ownerTaskId) : null;
  return (
    (ownerTask !== null && isTaskRunning(ownerTask)) ||
    (await ownerHoldsSession(db, session)) ||
    (await hasOpenChatTurn(db, session._id))
  );
}

export const SANDBOX_HELD_ERROR =
  "An agent is still working in this sandbox. Stop the agent first, or wait for it to finish.";

/**
 * The sandbox Stop button. Returns the session whose sandbox is stopping, or
 * null when the owner has no session yet.
 */
export const stopWorkSandbox = authMutation({
  args: {
    target: v.union(
      v.object({ sessionId: v.id("sessions") }),
      v.object({ taskId: v.id("agentTasks") }),
      v.object({ projectId: v.id("projects") }),
    ),
  },
  returns: v.union(v.id("sessions"), v.null()),
  handler: async (ctx, { target }): Promise<Id<"sessions"> | null> => {
    const session =
      "sessionId" in target
        ? await getSessionWithAccess(ctx.db, target.sessionId, ctx.userId)
        : "taskId" in target
          ? await findTaskWorkSession(
              ctx.db,
              await getTaskWithAccess(ctx.db, target.taskId, ctx.userId),
            )
          : await findProjectSession(
              ctx.db,
              (await getProjectWithAccess(ctx.db, target.projectId, ctx.userId))
                ._id,
            );
    if (!session) return null;
    if (await sessionIsHeld(ctx.db, session)) throw new Error(SANDBOX_HELD_ERROR);
    await requestSessionSandboxStop(ctx, session._id);
    return session._id;
  },
});
