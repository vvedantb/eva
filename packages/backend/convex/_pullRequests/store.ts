import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader, MutationCtx } from "../_generated/server";
import {
  prOriginValidator,
  prOwnerValidator,
  prStateValidator,
} from "../validators";
import type { SandboxOwner } from "../_sandbox/owner";
import { buildProjectBranchName } from "../_git/branchNames";
import { extractPrNumber } from "../_github/prUrl";
import {
  schedulePrLifecycleActions,
  type PrLifecycleTransition,
} from "../_github/prLifecycleActions";

/**
 * The one module that writes `pullRequests`. Every PR Eva tracks — the draft a
 * session opens, each linked repo's PR, a task run's PR, a project PR, and any
 * PR the agent opens itself on an Eva branch — is a row here, and every write
 * re-derives the owner's `prUrl` / `prState` / `prCount` summary so list rows
 * never need a join.
 */

export type PrOwner = Infer<typeof prOwnerValidator>;
export type PrState = Infer<typeof prStateValidator>;
export type PrOrigin = Infer<typeof prOriginValidator>;
export type LivePrState = "draft" | "open";

/**
 * The owner's identity alone, without the run / linked-repo detail. Same shape
 * as a sandbox owner: whatever owns a sandbox can own pull requests.
 */
export type PrOwnerRef = SandboxOwner;

export function isLivePrState(state: PrState): state is LivePrState {
  return state === "draft" || state === "open";
}

/** Maps a GitHub pull_request webhook action onto a tracked state, or null. */
export function derivePrStateFromEvent(
  action: string,
  draft: boolean | undefined,
  merged: boolean | undefined,
): PrState | null {
  if (action === "closed") return merged ? "merged" : "closed";
  if (action === "converted_to_draft") return "draft";
  if (action === "ready_for_review") return "open";
  if (action === "opened" || action === "reopened") {
    return draft ? "draft" : "open";
  }
  return null;
}

export function ownerRef(owner: PrOwner): PrOwnerRef {
  if (owner.kind === "session") {
    return { kind: "session", sessionId: owner.sessionId };
  }
  if (owner.kind === "task") return { kind: "task", taskId: owner.taskId };
  return { kind: "project", projectId: owner.projectId };
}

function sameOwner(a: PrOwnerRef, b: PrOwner): boolean {
  if (a.kind === "session") {
    return b.kind === "session" && b.sessionId === a.sessionId;
  }
  if (a.kind === "task") return b.kind === "task" && b.taskId === a.taskId;
  return b.kind === "project" && b.projectId === a.projectId;
}

/**
 * Every PR the owner holds, newest first. The `by_task` index also matches
 * project rows that name the task which opened them, so rows are filtered to
 * the exact owner kind.
 */
export async function listOwnerPullRequests(
  db: DatabaseReader,
  owner: PrOwnerRef,
): Promise<Doc<"pullRequests">[]> {
  const rows =
    owner.kind === "session"
      ? await db
          .query("pullRequests")
          .withIndex("by_session", (q) =>
            q.eq("owner.sessionId", owner.sessionId),
          )
          .collect()
      : owner.kind === "task"
        ? await db
            .query("pullRequests")
            .withIndex("by_task", (q) => q.eq("owner.taskId", owner.taskId))
            .collect()
        : await db
            .query("pullRequests")
            .withIndex("by_project", (q) =>
              q.eq("owner.projectId", owner.projectId),
            )
            .collect();
  return rows
    .filter((row) => sameOwner(owner, row.owner))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function findPullRequestByUrl(
  db: DatabaseReader,
  prUrl: string,
): Promise<Doc<"pullRequests"> | null> {
  return await db
    .query("pullRequests")
    .withIndex("by_pr_url", (q) => q.eq("prUrl", prUrl))
    .first();
}

/** The owner's primary PR — the one Eva's own flow opened for it. */
export async function findPrimaryPullRequest(
  db: DatabaseReader,
  owner: PrOwnerRef,
): Promise<Doc<"pullRequests"> | null> {
  const rows = await listOwnerPullRequests(db, owner);
  return rows.find((row) => row.primary) ?? null;
}

/** The live PR on a branch, if any — decides "open a PR" vs "refresh it". */
export async function findLivePullRequestOnBranch(
  db: DatabaseReader,
  repoId: Id<"githubRepos">,
  headBranch: string,
): Promise<Doc<"pullRequests"> | null> {
  const rows = await db
    .query("pullRequests")
    .withIndex("by_repo_and_head_branch", (q) =>
      q.eq("repoId", repoId).eq("headBranch", headBranch),
    )
    .collect();
  return rows.find((row) => isLivePrState(row.state)) ?? null;
}

export type PrSummary = {
  prUrl: string | undefined;
  prState: PrState | undefined;
  prCount: number | undefined;
};

/**
 * Rolls an owner's rows into the summary list rows draw. With one PR this is
 * exactly that PR, so single-PR owners look as they always have. With several,
 * the state stays live while any PR is live (the primary's state when it is
 * the live one), and once all are terminal reads merged if any merged.
 */
export function summarisePullRequests(
  rows: readonly Pick<
    Doc<"pullRequests">,
    "prUrl" | "state" | "primary" | "createdAt"
  >[],
): PrSummary {
  if (rows.length === 0) {
    return { prUrl: undefined, prState: undefined, prCount: undefined };
  }
  const newestFirst = [...rows].sort((a, b) => b.createdAt - a.createdAt);
  const head = newestFirst.find((row) => row.primary) ?? newestFirst[0];
  const live = rows.filter((row) => isLivePrState(row.state));
  let prState: PrState;
  if (live.length > 0) {
    prState = isLivePrState(head.state)
      ? head.state
      : live.some((row) => row.state === "open")
        ? "open"
        : "draft";
  } else {
    prState = rows.some((row) => row.state === "merged") ? "merged" : "closed";
  }
  return { prUrl: head.prUrl, prState, prCount: rows.length };
}

/** True once every PR the owner holds is merged or closed (and it holds one). */
export function allPullRequestsTerminal(
  rows: readonly Pick<Doc<"pullRequests">, "state">[],
): boolean {
  return rows.length > 0 && rows.every((row) => !isLivePrState(row.state));
}

/** Re-derives and writes the owner's PR summary. No-op when unchanged. */
export async function syncOwnerPrSummary(
  ctx: MutationCtx,
  owner: PrOwnerRef,
): Promise<PrSummary> {
  const rows = await listOwnerPullRequests(ctx.db, owner);
  const summary = summarisePullRequests(rows);
  const doc =
    owner.kind === "session"
      ? await ctx.db.get(owner.sessionId)
      : owner.kind === "task"
        ? await ctx.db.get(owner.taskId)
        : await ctx.db.get(owner.projectId);
  if (
    doc === null ||
    // Never synced (`prCount` unset) and no rows yet: a pre-`pullRequests`
    // owner whose summary still holds its only PR record until
    // `backfillPullRequests` runs. Clearing it would drop that link.
    (rows.length === 0 && doc.prCount === undefined) ||
    (doc.prUrl === summary.prUrl &&
      doc.prState === summary.prState &&
      doc.prCount === summary.prCount)
  ) {
    return summary;
  }
  if (owner.kind === "session") {
    await ctx.db.patch(owner.sessionId, summary);
  } else if (owner.kind === "task") {
    await ctx.db.patch(owner.taskId, summary);
  } else {
    await ctx.db.patch(owner.projectId, summary);
  }
  return summary;
}

export type RecordPullRequestArgs = {
  owner: PrOwner;
  repoId: Id<"githubRepos">;
  prUrl: string;
  state: PrState;
  primary: boolean;
  origin: PrOrigin;
  headBranch?: string;
  baseBranch?: string;
  title?: string;
};

/**
 * Links a PR to its owner. Idempotent by URL: the first owner to claim a PR
 * keeps it, and a later Eva write upgrades a row the webhook attached first
 * (GitHub's `opened` event can beat the API call that created the PR).
 * Marking a row primary demotes the owner's previous primary.
 */
export async function recordPullRequest(
  ctx: MutationCtx,
  args: RecordPullRequestArgs,
): Promise<Doc<"pullRequests"> | null> {
  const prNumber = extractPrNumber(args.prUrl);
  if (prNumber === null) return null;
  const now = Date.now();
  const existing = await findPullRequestByUrl(ctx.db, args.prUrl);
  const owner = existing?.owner ?? args.owner;
  const primary = args.primary || existing?.primary === true;

  if (primary) {
    for (const row of await listOwnerPullRequests(ctx.db, ownerRef(owner))) {
      if (row.primary && row.prUrl !== args.prUrl) {
        await ctx.db.patch(row._id, { primary: false, updatedAt: now });
      }
    }
  }

  let id: Id<"pullRequests">;
  if (existing) {
    id = existing._id;
    await ctx.db.patch(existing._id, {
      state: args.state,
      primary,
      origin: args.origin === "eva" ? "eva" : existing.origin,
      // A run or linked-repo id the webhook could not know about.
      owner: sameOwner(ownerRef(existing.owner), args.owner)
        ? args.owner
        : existing.owner,
      headBranch: args.headBranch ?? existing.headBranch,
      baseBranch: args.baseBranch ?? existing.baseBranch,
      title: args.title ?? existing.title,
      updatedAt: now,
    });
  } else {
    id = await ctx.db.insert("pullRequests", {
      repoId: args.repoId,
      prUrl: args.prUrl,
      prNumber,
      headBranch: args.headBranch,
      baseBranch: args.baseBranch,
      title: args.title,
      state: args.state,
      primary,
      origin: args.origin,
      owner: args.owner,
      createdAt: now,
      updatedAt: now,
    });
  }
  await syncOwnerPrSummary(ctx, ownerRef(owner));
  return await ctx.db.get(id);
}

/** Patches one row's state (and optional webhook detail), then the summary. */
export async function setPullRequestState(
  ctx: MutationCtx,
  row: Doc<"pullRequests">,
  patch: {
    state: PrState;
    stateOnArchive?: LivePrState | null;
    title?: string;
    headBranch?: string;
    baseBranch?: string;
  },
): Promise<void> {
  await ctx.db.patch(row._id, {
    state: patch.state,
    ...(patch.stateOnArchive !== undefined
      ? { stateOnArchive: patch.stateOnArchive ?? undefined }
      : {}),
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.headBranch !== undefined ? { headBranch: patch.headBranch } : {}),
    ...(patch.baseBranch !== undefined ? { baseBranch: patch.baseBranch } : {}),
    updatedAt: Date.now(),
  });
  await syncOwnerPrSummary(ctx, ownerRef(row.owner));
}

/** Removes a row (a foreign tip-copy merge) and refreshes the summary. */
export async function detachPullRequest(
  ctx: MutationCtx,
  row: Doc<"pullRequests">,
): Promise<void> {
  await ctx.db.delete(row._id);
  await syncOwnerPrSummary(ctx, ownerRef(row.owner));
}

/** Schedules a GitHub draft/ready/close/reopen for one tracked PR. */
export async function schedulePullRequestAction(
  ctx: MutationCtx,
  row: Doc<"pullRequests">,
  transition: PrLifecycleTransition,
): Promise<void> {
  const repo = await ctx.db.get(row.repoId);
  if (!repo) return;
  await schedulePrLifecycleActions(
    ctx,
    {
      installationId: repo.installationId,
      repoOwner: repo.owner,
      repoName: repo.name,
      prNumber: row.prNumber,
    },
    transition,
  );
}

/**
 * Closes every live PR the owner holds and remembers each one's state so
 * `reopenArchivedPullRequests` can restore it. Merged PRs are left alone.
 */
export async function closeLivePullRequests(
  ctx: MutationCtx,
  owner: PrOwnerRef,
): Promise<void> {
  for (const row of await listOwnerPullRequests(ctx.db, owner)) {
    if (!isLivePrState(row.state)) continue;
    await schedulePullRequestAction(ctx, row, { kind: "close" });
    await ctx.db.patch(row._id, {
      state: "closed",
      stateOnArchive: row.state,
      updatedAt: Date.now(),
    });
  }
  await syncOwnerPrSummary(ctx, owner);
}

/**
 * Reopens every PR `closeLivePullRequests` closed, as draft or ready again —
 * as each was, unless `asReady` says which the owner now needs.
 */
export async function reopenArchivedPullRequests(
  ctx: MutationCtx,
  owner: PrOwnerRef,
  asReady?: boolean,
): Promise<void> {
  for (const row of await listOwnerPullRequests(ctx.db, owner)) {
    if (row.stateOnArchive === undefined) continue;
    if (row.state === "merged") {
      await ctx.db.patch(row._id, { stateOnArchive: undefined });
      continue;
    }
    const ready = asReady ?? row.stateOnArchive === "open";
    await schedulePullRequestAction(ctx, row, { kind: "reopen", asReady: ready });
    await ctx.db.patch(row._id, {
      state: ready ? "open" : "draft",
      stateOnArchive: undefined,
      updatedAt: Date.now(),
    });
  }
  await syncOwnerPrSummary(ctx, owner);
}

/**
 * Pushes a task or project status change out to GitHub. Cancel closes every
 * live PR the owner holds and un-cancel reopens exactly those; draft/ready
 * follow the review phase, which belongs to the primary PR alone.
 */
export async function applyPrLifecycleTransition(
  ctx: MutationCtx,
  owner: PrOwnerRef,
  transition: PrLifecycleTransition,
): Promise<void> {
  if (transition.kind === "close") {
    await closeLivePullRequests(ctx, owner);
    return;
  }
  if (transition.kind === "reopen") {
    await reopenArchivedPullRequests(ctx, owner, transition.asReady);
    return;
  }
  const primary = await findPrimaryPullRequest(ctx.db, owner);
  if (primary && isLivePrState(primary.state)) {
    await schedulePullRequestAction(ctx, primary, transition);
  }
}

/** Forgets archive bookkeeping once the owner is live again by other means. */
export async function clearArchivedPrStates(
  ctx: MutationCtx,
  owner: PrOwnerRef,
): Promise<void> {
  for (const row of await listOwnerPullRequests(ctx.db, owner)) {
    if (row.stateOnArchive !== undefined) {
      await ctx.db.patch(row._id, { stateOnArchive: undefined });
    }
  }
}

/**
 * Eva branches name their owner: `eva/session-<id>`, `eva/task-<id>`,
 * `eva/project-<id>[-vN]`. Anything after the id (`-<slug>`) marks a side
 * branch the agent opened its own PR from, which still belongs to that owner.
 * Convex ids never contain a hyphen, so the first hyphen ends the id; the
 * caller still validates it with `normalizeId`.
 */
const EVA_OWNER_BRANCH = /^eva\/(session|task|project)-([^-/]+)(-.+)?$/;

export function parseEvaOwnerBranch(
  branch: string,
): { kind: "session" | "task" | "project"; id: string } | null {
  const match = EVA_OWNER_BRANCH.exec(branch);
  if (!match) return null;
  const kind = match[1];
  if (kind !== "session" && kind !== "task" && kind !== "project") return null;
  return { kind, id: match[2] };
}

async function repoMatches(
  db: DatabaseReader,
  repoId: Id<"githubRepos"> | undefined,
  repo: { owner: string; name: string },
): Promise<boolean> {
  if (repoId === undefined) return false;
  const doc = await db.get(repoId);
  return (
    doc !== null &&
    doc.owner.toLowerCase() === repo.owner.toLowerCase() &&
    doc.name.toLowerCase() === repo.name.toLowerCase()
  );
}

/**
 * Finds who owns a PR Eva has no row for, from its head branch and the repo it
 * targets. The repo check stops a same-named branch in another repo (or the
 * wrong monorepo app row) from claiming the PR. `isMainBranch` is true when
 * the head is the owner's own branch rather than a side branch, so a PR Eva
 * opened but failed to record can be restored as the primary.
 */
export async function resolvePrOwnerFromBranch(
  db: DatabaseReader,
  args: { branch: string; repoOwner: string; repoName: string },
): Promise<{
  owner: PrOwner;
  repoId: Id<"githubRepos">;
  isMainBranch: boolean;
} | null> {
  const parsed = parseEvaOwnerBranch(args.branch);
  if (!parsed) return null;
  const repo = { owner: args.repoOwner, name: args.repoName };

  if (parsed.kind === "session") {
    const sessionId = db.normalizeId("sessions", parsed.id);
    const session = sessionId ? await db.get(sessionId) : null;
    if (!session) return null;
    const mainBranch = session.branchName ?? `eva/session-${session._id}`;
    const isMainBranch = args.branch === mainBranch;
    if (await repoMatches(db, session.repoId, repo)) {
      return {
        owner: { kind: "session", sessionId: session._id },
        repoId: session.repoId,
        isMainBranch,
      };
    }
    const links = await db
      .query("sessionRepos")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .collect();
    const link = links.find(
      (row) =>
        row.owner.toLowerCase() === repo.owner.toLowerCase() &&
        row.name.toLowerCase() === repo.name.toLowerCase(),
    );
    if (!link) return null;
    return {
      owner: {
        kind: "session",
        sessionId: session._id,
        sessionRepoId: link._id,
      },
      repoId: link.repoId,
      isMainBranch: args.branch === link.branchName,
    };
  }

  if (parsed.kind === "task") {
    const taskId = db.normalizeId("agentTasks", parsed.id);
    const task = taskId ? await db.get(taskId) : null;
    if (!task || task.repoId === undefined) return null;
    if (!(await repoMatches(db, task.repoId, repo))) return null;
    // A project task works on the project branch; its own branch name is
    // never pushed, so a task id always means a quick task here.
    if (task.projectId !== undefined) return null;
    return {
      owner: { kind: "task", taskId: task._id },
      repoId: task.repoId,
      isMainBranch: args.branch === `eva/task-${task._id}`,
    };
  }

  const projectId = db.normalizeId("projects", parsed.id);
  const project = projectId ? await db.get(projectId) : null;
  if (!project) return null;
  if (!(await repoMatches(db, project.repoId, repo))) return null;
  return {
    owner: { kind: "project", projectId: project._id },
    repoId: project.repoId,
    isMainBranch:
      args.branch ===
      (project.branchName ??
        buildProjectBranchName(project._id, project.branchVersion)),
  };
}

/**
 * The PR Eva opened for one repo of a session: the primary repo's own PR when
 * `sessionRepoId` is undefined, else that linked repo's. Side-branch PRs the
 * agent opened are listed elsewhere and never stand in for a repo's PR.
 */
export function sessionRepoPullRequest(
  rows: readonly Doc<"pullRequests">[],
  sessionRepoId: Id<"sessionRepos"> | undefined,
): Doc<"pullRequests"> | undefined {
  const forRepo = rows.filter(
    (row) =>
      row.owner.kind === "session" &&
      row.owner.sessionRepoId === sessionRepoId,
  );
  return sessionRepoId === undefined
    ? forRepo.find((row) => row.primary)
    : (forRepo.find((row) => row.origin === "eva") ?? forRepo[0]);
}

/** The owning project's or quick task's PR summary for a task. */
export async function taskPrUrl(
  db: DatabaseReader,
  task: Doc<"agentTasks">,
): Promise<string | undefined> {
  if (task.projectId === undefined) return task.prUrl;
  return (await db.get(task.projectId))?.prUrl;
}
