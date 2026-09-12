"use node";

import { v, type Infer } from "convex/values";
import { quote } from "shell-quote";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { getActionRepoWithAccess } from "../functions";
import { pushBranchToOrigin } from "./git";
import { errorMessage, execHandle, workspaceDirShell } from "./helpers";
import { authorizedRunningHandle } from "./services";

const revertResultValidator = v.union(
  v.object({
    status: v.literal("restored"),
    commitSha: v.string(),
    pushed: v.boolean(),
  }),
  v.object({ status: v.literal("not_running") }),
  v.object({ status: v.literal("turn_open") }),
  v.object({ status: v.literal("dirty_worktree") }),
  v.object({ status: v.literal("sha_missing") }),
);

type RevertResult = Infer<typeof revertResultValidator>;

/**
 * "Restore to before this turn": puts the workspace back to the tree of the
 * turn's `beforeSha` as a NEW commit on the session branch, then pushes. History
 * is never rewritten — a restore is one more commit the PR shows, and the user
 * can restore again to undo it. `git read-tree --reset -u` reads the whole tree
 * (adds, deletes, binaries) without the conflict surface of `git revert`
 * across the merge commits `synchronizeForPush` may have added.
 */
export const revertSessionToTurn = action({
  args: {
    sessionId: v.id("sessions"),
    messageId: v.string(),
  },
  returns: revertResultValidator,
  handler: async (ctx, args): Promise<RevertResult> => {
    const session = await ctx.runQuery(api.sessions.get, {
      id: args.sessionId,
    });
    if (!session) throw new Error("Not authorized");
    const context = await ctx.runQuery(internal.sessions.getRevertContext, {
      sessionId: args.sessionId,
      messageId: args.messageId,
    });
    // Access is checked before any status leaks back to the caller.
    const repo = await getActionRepoWithAccess(ctx, context.repoId);
    if (context.status !== "ok") return { status: context.status };

    const handle = await authorizedRunningHandle(
      ctx,
      context.repoId,
      context.sandboxId,
    );
    if (!handle) return { status: "not_running" };

    const workspaceDir = workspaceDirShell();
    const sha = quote([context.beforeSha]);

    // Local edits (terminal, code-server) would be swept into the restore
    // commit unnoticed; make the user deal with them first.
    const dirty = await execHandle(
      handle,
      `cd ${workspaceDir} && git status --porcelain`,
      30,
    );
    if (dirty.trim() !== "") return { status: "dirty_worktree" };

    // The sandbox may be a fresh VM that only cloned recent history: try to
    // fetch the exact commit before declaring it missing.
    const known = await execHandle(
      handle,
      `cd ${workspaceDir} && (git cat-file -e ${sha}^{commit} 2>/dev/null || GIT_TERMINAL_PROMPT=0 git fetch -q origin ${sha} 2>/dev/null; git cat-file -e ${sha}^{commit} 2>/dev/null && echo found || echo missing)`,
      60,
    );
    if (known.trim() !== "found") return { status: "sha_missing" };

    const subject = quote([
      `task: restore workspace to before turn ${context.turnNumber}`,
    ]);
    const commitSha = (
      await execHandle(
        handle,
        `cd ${workspaceDir} && git read-tree --reset -u ${sha} && git commit -q --allow-empty -m ${subject} && git rev-parse HEAD`,
        60,
      )
    ).trim();
    const shortSha = commitSha.slice(0, 7);

    let pushed = false;
    try {
      pushed = (
        await pushBranchToOrigin(
          handle,
          repo.owner,
          repo.name,
          context.branchName,
        )
      ).pushed;
      await ctx.runMutation(internal.sessionWorkflow.postSystemAlert, {
        sessionId: args.sessionId,
        content: `Restored workspace to before turn ${context.turnNumber} (commit ${shortSha})`,
      });
    } catch (error) {
      // The restore commit exists locally either way; the next turn's
      // persistTurnWork (or PublishRecoveryBanner) will push it.
      await ctx.runMutation(internal.sessionWorkflow.postSystemAlert, {
        sessionId: args.sessionId,
        content: `Restored workspace to before turn ${context.turnNumber} (commit ${shortSha}), but the push failed`,
        errorDetail: errorMessage(error, "Push failed"),
      });
    }

    return { status: "restored", commitSha, pushed };
  },
});
