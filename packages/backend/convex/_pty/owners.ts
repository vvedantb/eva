import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { sandboxOwnerValidator, type SandboxOwner } from "../_sandbox/owner";

/**
 * Discriminated owner — a PTY belongs to a session, a quick task, or a project.
 * All expose a sandbox and a repo.
 */
export const ownerArg = sandboxOwnerValidator;

export interface ResolvedOwner {
  sandboxId: string;
  repoId: Id<"githubRepos">;
  /**
   * True when the owner is `stopping`/`closed`. A terminal connect must not
   * exec on the sandbox in this state — on Vercel any exec lazily resumes a
   * stopped VM (SDK withResume), which resurrects a sandbox the user stopped
   * (invisible to the session status) and defeats a manual stop.
   */
  isStoppingOrClosed: boolean;
}

/** A sandbox in `stopping`/`closed` must not be exec'd against (see ResolvedOwner.isStoppingOrClosed). */
function isStoppingOrClosed(status: string | undefined): boolean {
  return status === "stopping" || status === "closed";
}

export async function resolveOwner(
  ctx: ActionCtx,
  owner: SandboxOwner,
): Promise<ResolvedOwner> {
  if (owner.kind === "session") {
    const session = await ctx.runQuery(internal.sessions.getInternal, {
      id: owner.sessionId,
    });
    if (!session) throw new Error("Session not found");
    if (!session.sandboxId) throw new Error("Sandbox not active");
    return {
      sandboxId: session.sandboxId,
      repoId: session.repoId,
      isStoppingOrClosed: isStoppingOrClosed(session.status),
    };
  }

  if (owner.kind === "task") {
    const task = await ctx.runQuery(internal.agentTasks.getInternal, {
      id: owner.taskId,
    });
    if (!task) throw new Error("Task not found");
    if (!task.sandboxId) throw new Error("Sandbox not active");
    if (!task.repoId) throw new Error("Task has no repo");
    return {
      sandboxId: task.sandboxId,
      repoId: task.repoId,
      isStoppingOrClosed: isStoppingOrClosed(task.reviewTaskSandboxStatus),
    };
  }

  const project = await ctx.runQuery(internal.projects.getInternal, {
    id: owner.projectId,
  });
  if (!project) throw new Error("Project not found");
  if (!project.sandboxId) throw new Error("Sandbox not active");
  return {
    sandboxId: project.sandboxId,
    repoId: project.repoId,
    isStoppingOrClosed: isStoppingOrClosed(project.reviewProjectSandboxStatus),
  };
}
