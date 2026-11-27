import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { sandboxOwnerValidator, type SandboxOwner } from "../_sandbox/owner";

/** A PTY belongs to a session's sandbox. */
export const ownerArg = sandboxOwnerValidator;

export interface ResolvedOwner {
  sandboxId: string;
  repoId: Id<"githubRepos">;
  isStoppingOrClosed: boolean;
}

function isStoppingOrClosed(status: string | undefined): boolean {
  return status === "stopping" || status === "closed";
}

export async function resolveOwner(
  ctx: ActionCtx,
  owner: SandboxOwner,
): Promise<ResolvedOwner> {
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
