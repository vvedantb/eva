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

async function sessionIsHeld(
  db: DatabaseReader,
  session: Doc<"sessions">,
): Promise<boolean> {
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
