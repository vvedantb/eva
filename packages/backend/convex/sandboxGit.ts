import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { authMutation, hasRepoAccess } from "./functions";
import { sandboxGitSyncValidator } from "./_validators/shapes";

/** Git's own ref-name ceiling is well under this; the cap is just a guard. */
const BRANCH_MAX_CHARS = 255;

/** The entity a sandbox checkout belongs to; session chats share the session's. */
export const sandboxGitTargetValidator = v.union(
  v.object({ kind: v.literal("session"), sessionId: v.id("sessions") }),
  v.object({
    kind: v.literal("sessionChat"),
    chatId: v.id("sessionChats"),
  }),
  v.object({ kind: v.literal("task"), taskId: v.id("agentTasks") }),
  v.object({ kind: v.literal("project"), projectId: v.id("projects") }),
);

type SandboxGitTarget = Infer<typeof sandboxGitTargetValidator>;
type SandboxGitSync = Infer<typeof sandboxGitSyncValidator>;
type SandboxOwner =
  | Doc<"sessions">
  | Doc<"agentTasks">
  | Doc<"projects">;

/** Resolves the sandbox-owning doc. Session daemons run per chat; the checkout belongs to the session. */
async function resolveSandboxOwner(
  ctx: Pick<QueryCtx, "db">,
  target: SandboxGitTarget,
): Promise<SandboxOwner | null> {
  if (target.kind === "session") return await ctx.db.get(target.sessionId);
  if (target.kind === "sessionChat") {
    const chat = await ctx.db.get(target.chatId);
    return chat ? await ctx.db.get(chat.sessionId) : null;
  }
  if (target.kind === "task") return await ctx.db.get(target.taskId);
  return await ctx.db.get(target.projectId);
}

function syncEquals(
  a: SandboxGitSync | undefined,
  b: SandboxGitSync | undefined,
): boolean {
  return (
    a?.uncommittedFiles === b?.uncommittedFiles &&
    a?.unpushedCommits === b?.unpushedCommits
  );
}

async function patchSandboxGitState(
  ctx: Pick<MutationCtx, "db">,
  owner: SandboxOwner,
  branch: string,
  sync: SandboxGitSync | undefined,
): Promise<void> {
  // One filesystem can be reported by several daemon processes, so the
  // unchanged case must cost nothing.
  const branchChanged = owner.sandboxBranch !== branch;
  const syncChanged = sync !== undefined && !syncEquals(owner.sandboxGitSync, sync);
  if (!branchChanged && !syncChanged) return;
  await ctx.db.patch(owner._id, {
    sandboxBranch: branch,
    ...(syncChanged ? { sandboxGitSync: sync } : {}),
  });
}

/**
 * The in-sandbox daemon reports the branch its worktree is actually on (see
 * `callback-src/runtime/branchWatcher.ts`). Distinct from the entity's
 * `branchName`, which is what Eva asked the sandbox to check out at boot.
 * `sync` is optional so bundles that predate it keep reporting the branch.
 *
 * Deliberately patches `sandboxBranch` / `sandboxGitSync` alone: a branch
 * report is not user activity, so bumping `updatedAt` / `lastSandboxActivity`
 * here would reorder every sidebar each time the watcher polls.
 */
export const reportBranch = authMutation({
  args: {
    target: sandboxGitTargetValidator,
    branch: v.string(),
    sync: v.optional(sandboxGitSyncValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const branch = args.branch.trim().slice(0, BRANCH_MAX_CHARS);
    if (branch.length === 0) return null;
    const owner = await resolveSandboxOwner(ctx, args.target);
    if (!owner) throw new Error("Not found");
    if (!owner.repoId || !(await hasRepoAccess(ctx.db, owner.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    await patchSandboxGitState(ctx, owner, branch, args.sync);
    return null;
  },
});

/** Written by `commitAndPushSandbox` so the chip clears without waiting for a watcher tick. */
export const setSandboxGitStateInternal = internalMutation({
  args: {
    target: sandboxGitTargetValidator,
    branch: v.string(),
    sync: sandboxGitSyncValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await resolveSandboxOwner(ctx, args.target);
    if (!owner) return null;
    await patchSandboxGitState(ctx, owner, args.branch, args.sync);
    return null;
  },
});

/** Where `commitAndPushSandbox` acts. Access is checked by the action. */
export const getSandboxTargetInternal = internalQuery({
  args: { target: sandboxGitTargetValidator },
  returns: v.union(
    v.object({
      repoId: v.id("githubRepos"),
      sandboxId: v.string(),
      repoOwner: v.string(),
      repoName: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const owner = await resolveSandboxOwner(ctx, args.target);
    if (!owner?.repoId || !owner.sandboxId) return null;
    const repoId: Id<"githubRepos"> = owner.repoId;
    const repo = await ctx.db.get(repoId);
    if (!repo) return null;
    return {
      repoId,
      sandboxId: owner.sandboxId,
      repoOwner: repo.owner,
      repoName: repo.name,
    };
  },
});
