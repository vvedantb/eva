import { v } from "convex/values";
import { authMutation } from "./functions";
import {
  patchSandboxOwner,
  resolveSandboxOwnerOrThrow,
  sandboxOwnerValidator,
} from "./_sandbox/owner";

/** Git's own ref-name ceiling is well under this; the cap is just a guard. */
const BRANCH_MAX_CHARS = 255;

/**
 * The in-sandbox daemon reports the branch its worktree is actually on (see
 * `callback-src/runtime/branchWatcher.ts`). Distinct from the entity's
 * `branchName`, which is what Eva asked the sandbox to check out at boot.
 *
 * Deliberately patches `sandboxBranch` alone: a branch report is not user
 * activity, so bumping `updatedAt` / `lastSandboxActivity` here would reorder
 * every sidebar each time the watcher polls.
 */
export const reportBranch = authMutation({
  args: { target: sandboxOwnerValidator, branch: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const branch = args.branch.trim().slice(0, BRANCH_MAX_CHARS);
    if (branch.length === 0) return null;
    const owner = await resolveSandboxOwnerOrThrow(
      ctx.db,
      ctx.userId,
      args.target,
    );
    // One filesystem can be reported by several daemon processes, so the
    // unchanged case must cost nothing.
    if (owner.doc.sandboxBranch === branch) return null;
    await patchSandboxOwner(ctx.db, owner, { sandboxBranch: branch });
    return null;
  },
});
