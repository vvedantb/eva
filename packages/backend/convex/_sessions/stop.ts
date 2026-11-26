import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader, MutationCtx } from "../_generated/server";
import {
  authMutation,
  getProjectWithAccess,
  getSessionWithAccess,
  getTaskWithAccess,
} from "../functions";
import { hasOpenChatTurn } from "../_chat/turnProjection";
import type { SessionChatContext } from "../_sessionChats/helpers";
import { stopTaskRun } from "../_agentTasks/taskRunTurn";
import { cancelChatExecution } from "./execution";
import {
  sessionOwner,
  findWorkSession,
} from "./owner";
import { findWorkChat } from "./ownerState";
import { requestSessionSandboxStop } from "./sandbox";

/**
 * The two Stops. Web, mobile and MCP all call these, so a Stop does the same
 * thing on every surface:
 *
 *   chats.stop       stops the agent in one chat (`stopChat` / `stopTask`
 *                    here): the chat's open turn, and the task run shown in
 *                    it (a quick task's or project task's run). What was
 *                    queued before it waits for Steer.
 *   stopWorkSandbox  sleeps the sandbox of a session, task or project. It is
 *                    refused while the agent works on that sandbox (any chat
 *                    turn or a task run): stop the
 *                    agent first, or wait.
 *
 * Neither creates a session: no session means there is nothing to stop.
 */

/**
 * Stops what holds one chat: the owner task's run that is not a live turn (a
 * queued Run, or a project task's wait for the answer to its ask, rule 7 in
 * `_projects/reports.ts`; `stopTaskRun`), and the chat's own turn, a Run
 * included. Each half is a no-op when idle. The caller checks access.
 */
async function stopOwnerTurn(
  ctx: MutationCtx,
  task: Doc<"agentTasks"> | null,
  chat: SessionChatContext | null,
): Promise<void> {
  if (task) await stopTaskRun(ctx, task);
  if (chat) await cancelChatExecution(ctx, chat, { holdQueue: true });
}

/** Stops one chat and the task it speaks for (a quick or project task's). */
export async function stopChat(
  ctx: MutationCtx,
  context: SessionChatContext,
): Promise<void> {
  const owner = sessionOwner(context.session);
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
    await findWorkChat(ctx.db, { kind: "task", task }),
  );
}

/** Stopping kills the VM under any agent still working on it. */
async function sessionIsHeld(
  db: DatabaseReader,
  session: Doc<"sessions">,
): Promise<boolean> {
  // A task's run is a chat turn too.
  return await hasOpenChatTurn(db, session._id);
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
          ? await findWorkSession(
              ctx.db,
              await getTaskWithAccess(ctx.db, target.taskId, ctx.userId),
            )
          : await findWorkSession(ctx.db, {
              kind: "project",
              project: await getProjectWithAccess(
                ctx.db,
                target.projectId,
                ctx.userId,
              ),
            });
    if (!session) return null;
    if (await sessionIsHeld(ctx.db, session)) throw new Error(SANDBOX_HELD_ERROR);
    await requestSessionSandboxStop(ctx, session._id);
    return session._id;
  },
});
