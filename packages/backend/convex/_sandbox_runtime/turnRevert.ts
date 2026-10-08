"use node";

import { v, type Infer } from "convex/values";
import { quote } from "shell-quote";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
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

/** One (repo path, target sha) pair a revert resets. */
export type RevertTarget = {
  /**
   * Absolute clone path. `undefined` selects the primary repo via
   * `workspaceDirShell()` at exec time — the pre-multi-repo scalar fallback,
   * used whenever the message has no `beforeShas` array.
   */
  path: string | undefined;
  sha: string;
};

/**
 * Which (path, sha) pairs a "restore to before this turn" should reset. Prefers
 * the multi-repo `beforeShas` array (one entry per repo the turn checked out)
 * when the message recorded one; falls back to the single scalar `beforeSha`
 * for the primary repo otherwise (turns from before multi-repo checkpoints
 * existed, and every single-repo session). Pure so the decision is
 * unit-testable without a sandbox.
 */
export function revertTargets(message: {
  beforeSha?: string;
  beforeShas?: Array<{ path: string; sha: string }>;
}): RevertTarget[] {
  if (message.beforeShas !== undefined && message.beforeShas.length > 0) {
    return message.beforeShas.map((entry) => ({
      path: entry.path,
      sha: entry.sha,
    }));
  }
  if (message.beforeSha !== undefined) {
    return [{ path: undefined, sha: message.beforeSha }];
  }
  return [];
}

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

    const targets = revertTargets({
      beforeSha: context.beforeSha,
      beforeShas: context.beforeShas,
    });
    if (targets.length === 0) return { status: "sha_missing" };

    // Resolve each target's owner/name for push: the primary via the already
    // access-checked `repo`, every other path via its `sessionRepos` row.
    const linkedRepos =
      targets.length > 1 || targets[0]?.path !== undefined
        ? await ctx.runQuery(internal.sessions.listLinkedReposInternal, {
            sessionId: args.sessionId,
          })
        : [];
    const resolved = targets.map((target) => {
      const linked = linkedRepos.find((row) => row.path === target.path);
      return {
        path: target.path,
        sha: target.sha,
        workspaceDir:
          target.path !== undefined ? quote([target.path]) : workspaceDirShell(),
        owner: linked ? linked.owner : repo.owner,
        name: linked ? linked.name : repo.name,
      };
    });

    // All-or-nothing: verify every sha exists in its repo before touching any
    // of them. The sandbox may be a fresh VM that only cloned recent history —
    // try to fetch the exact commit before declaring it missing.
    for (const target of resolved) {
      const sha = quote([target.sha]);
      const known = await execHandle(
        handle,
        `cd ${target.workspaceDir} && (git cat-file -e ${sha}^{commit} 2>/dev/null || GIT_TERMINAL_PROMPT=0 git fetch -q origin ${sha} 2>/dev/null; git cat-file -e ${sha}^{commit} 2>/dev/null && echo found || echo missing)`,
        60,
      );
      if (known.trim() !== "found") {
        console.error(
          `[sandbox][turnRevert] revertSessionToTurn: sha ${target.sha} missing in ${target.path ?? "primary repo"}`,
        );
        return { status: "sha_missing" };
      }
    }

    // Local edits (terminal, code-server) in any repo would be swept into the
    // restore commit unnoticed; make the user deal with them first.
    for (const target of resolved) {
      const dirty = await execHandle(
        handle,
        `cd ${target.workspaceDir} && git status --porcelain`,
        30,
      );
      if (dirty.trim() !== "") return { status: "dirty_worktree" };
    }

    const subject = quote([
      `task: restore workspace to before turn ${context.turnNumber}`,
    ]);
    const commits: Array<{
      path: string | undefined;
      sha: string;
      owner: string;
      name: string;
    }> = [];
    for (const target of resolved) {
      const sha = quote([target.sha]);
      const commitSha = (
        await execHandle(
          handle,
          `cd ${target.workspaceDir} && git read-tree --reset -u ${sha} && git commit -q --allow-empty -m ${subject} && git rev-parse HEAD`,
          60,
        )
      ).trim();
      commits.push({
        path: target.path,
        sha: commitSha,
        owner: target.owner,
        name: target.name,
      });
    }

    let pushed = true;
    const pushErrors: string[] = [];
    for (const commit of commits) {
      try {
        const pushResult = await pushBranchToOrigin(
          handle,
          commit.owner,
          commit.name,
          context.branchName,
          commit.path !== undefined ? { workspaceDir: commit.path } : undefined,
        );
        if (!pushResult.pushed) pushed = false;
      } catch (error) {
        pushed = false;
        pushErrors.push(
          `${commit.path ?? "primary repo"}: ${errorMessage(error, "push failed")}`,
        );
      }
    }

    // Primary repo's commit, when reverted, else the first target's — a
    // single-repo session always has exactly one.
    const primaryCommit =
      commits.find((commit) => commit.path === undefined) ?? commits[0];
    const commitSha = primaryCommit ? primaryCommit.sha : "";
    const shortSha = commitSha.slice(0, 7);

    if (pushed) {
      await ctx.runMutation(internal.sessionWorkflow.postSystemAlert, {
        sessionId: args.sessionId,
        content: `Restored workspace to before turn ${context.turnNumber} (commit ${shortSha})`,
      });
    } else {
      // The restore commit(s) exist locally either way; the next turn's
      // persistTurnWork (or PublishRecoveryBanner) will push them.
      await ctx.runMutation(internal.sessionWorkflow.postSystemAlert, {
        sessionId: args.sessionId,
        content: `Restored workspace to before turn ${context.turnNumber} (commit ${shortSha}), but the push failed`,
        errorDetail: pushErrors.join("; ") || "Push failed",
      });
    }

    return { status: "restored", commitSha, pushed };
  },
});
