import { v, type Infer } from "convex/values";
import {
  internalMutation,
  type DatabaseReader,
  type MutationCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { isEntityDeleted } from "../numId";
import { prWatchValidator } from "../validators";
import {
  isLivePrState,
  listOwnerPullRequests,
  findPullRequestByUrl,
  ownerRef,
  setPullRequestWatch,
  type PrOwnerRef,
} from "./store";
import { newPrWatch, PR_WATCH_DEBOUNCE_MS } from "./watchEvaluate";

/**
 * The agent's PR watch (`watch_pull_request`). No polling: the GitHub webhook
 * notes activity on a watched PR, one debounced check per burst reads the PR
 * (`watchCheck.ts`), and anything new wakes the chat through the same
 * `orchestratorSendMessage` path the CI and review automations use. The state
 * lives on the `pullRequests` row: one owner per PR, found by URL from every
 * webhook, and the Review pane already reads that row.
 */

export const chatKindValidator = v.union(
  v.literal("session"),
  v.literal("task"),
  v.literal("project"),
);

/**
 * Schedules one check for a watched PR. A check already waiting absorbs this
 * call, so a burst of webhooks makes one read and at most one wake.
 */
async function scheduleWatchCheck(
  ctx: MutationCtx,
  row: Doc<"pullRequests">,
  delayMs: number,
): Promise<void> {
  const watch = row.watch;
  if (watch === undefined) return;
  const now = Date.now();
  if (watch.checkAt !== undefined && watch.checkAt > now) return;
  const checkAt = now + delayMs;
  await setPullRequestWatch(ctx, row._id, { ...watch, checkAt });
  await ctx.scheduler.runAfter(
    delayMs,
    internal._pullRequests.watchCheck.check,
    { pullRequestId: row._id, checkAt },
  );
}

/** A webhook (completed check suite, trusted review or comment) touched these PRs. */
export const noteActivity = internalMutation({
  args: { prUrls: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { prUrls }) => {
    for (const prUrl of prUrls) {
      const row = await findPullRequestByUrl(ctx.db, prUrl);
      if (row?.watch !== undefined && isLivePrState(row.state)) {
        await scheduleWatchCheck(ctx, row, PR_WATCH_DEBOUNCE_MS);
      }
    }
    return null;
  },
});

/**
 * A commit status (Vercel and the like) reached a final state on these branch
 * heads. Statuses name no PR, so the head branch finds the watched ones; the
 * index holds only watched rows, so an unwatched branch reads nothing.
 */
export const noteHeadStatus = internalMutation({
  args: { owner: v.string(), name: v.string(), branches: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { owner, name, branches }) => {
    for (const branch of branches) {
      const watched = await ctx.db
        .query("pullRequests")
        .withIndex("by_head_and_watch", (q) =>
          q.eq("headBranch", branch).gt("watch.startedAt", 0),
        )
        .collect();
      for (const row of watched) {
        if (!isLivePrState(row.state)) continue;
        const repo = await ctx.db.get(row.repoId);
        if (
          repo !== null &&
          repo.owner.toLowerCase() === owner.toLowerCase() &&
          repo.name.toLowerCase() === name.toLowerCase()
        ) {
          await scheduleWatchCheck(ctx, row, PR_WATCH_DEBOUNCE_MS);
        }
      }
    }
    return null;
  },
});

/**
 * A push to a branch. GitHub sends no event when a PR starts to conflict, so a
 * push to a watched PR's base branch is the cue to read its mergeability.
 */
export const noteBasePush = internalMutation({
  args: { owner: v.string(), name: v.string(), branch: v.string() },
  returns: v.null(),
  handler: async (ctx, { owner, name, branch }) => {
    const repos = await ctx.db
      .query("githubRepos")
      .withIndex("by_owner_and_name", (q) =>
        q.eq("owner", owner).eq("name", name),
      )
      .collect();
    for (const repo of repos) {
      const watched = await ctx.db
        .query("pullRequests")
        .withIndex("by_repo_base_and_watch", (q) =>
          q
            .eq("repoId", repo._id)
            .eq("baseBranch", branch)
            .gt("watch.startedAt", 0),
        )
        .collect();
      for (const row of watched) {
        if (isLivePrState(row.state)) {
          await scheduleWatchCheck(ctx, row, PR_WATCH_DEBOUNCE_MS);
        }
      }
    }
    return null;
  },
});

/** The chat named by an MCP `kind` + id, or null when the id is malformed. */
export function ownerFor(
  ctx: { db: DatabaseReader },
  kind: Doc<"pullRequests">["owner"]["kind"],
  id: string,
): PrOwnerRef | null {
  if (kind === "session") {
    const sessionId = ctx.db.normalizeId("sessions", id);
    return sessionId === null ? null : { kind, sessionId };
  }
  if (kind === "task") {
    const taskId = ctx.db.normalizeId("agentTasks", id);
    return taskId === null ? null : { kind, taskId };
  }
  const projectId = ctx.db.normalizeId("projects", id);
  return projectId === null ? null : { kind, projectId };
}

export function samePrUrl(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

const watchReplyValidator = v.union(
  v.object({
    ok: v.literal(true),
    prUrl: v.string(),
    prNumber: v.number(),
  }),
  v.object({ ok: v.literal(false), error: v.string() }),
);

/**
 * Starts (or re-aims) the watch on one of the chat's own PRs: the named one,
 * else its primary live PR, else its newest live one. Only a PR linked to the
 * chat can be watched, since the watch lives on that link. Watching a PR that
 * is already watched keeps what was reported and moves wakes to this chat.
 */
export const startWatch = internalMutation({
  args: {
    kind: chatKindValidator,
    id: v.string(),
    /** Session only: the calling chat inside the session. */
    sessionChatId: v.optional(v.string()),
    prUrl: v.optional(v.string()),
  },
  returns: watchReplyValidator,
  handler: async (ctx, args): Promise<Infer<typeof watchReplyValidator>> => {
    const owner = ownerFor(ctx, args.kind, args.id);
    if (owner === null) return { ok: false, error: "Unknown chat." };
    const rows = await listOwnerPullRequests(ctx.db, owner);
    const { prUrl } = args;
    const row =
      prUrl === undefined
        ? (rows.find((pr) => pr.primary && isLivePrState(pr.state)) ??
          rows.find((pr) => isLivePrState(pr.state)))
        : rows.find((pr) => samePrUrl(pr.prUrl, prUrl));
    if (row === undefined) {
      return {
        ok: false,
        error:
          prUrl === undefined
            ? "This chat has no open pull request to watch."
            : "That pull request is not linked to this chat. Only this chat's own pull requests can be watched; open extra ones from a side branch named after this chat's branch so Eva links them.",
      };
    }
    if (!isLivePrState(row.state)) {
      return {
        ok: false,
        error: `Pull request #${row.prNumber} is ${row.state}; there is nothing to watch.`,
      };
    }
    const sessionChatId =
      owner.kind === "session" && args.sessionChatId !== undefined
        ? (ctx.db.normalizeId("sessionChats", args.sessionChatId) ?? undefined)
        : undefined;
    const fresh = newPrWatch(Date.now(), sessionChatId);
    if (row.watch === undefined) {
      await setPullRequestWatch(ctx, row._id, fresh);
      // Read the baseline now, so what is already true is never reported.
      await ctx.scheduler.runAfter(
        0,
        internal._pullRequests.watchCheck.check,
        { pullRequestId: row._id, checkAt: fresh.startedAt },
      );
    } else {
      await setPullRequestWatch(ctx, row._id, {
        ...row.watch,
        sessionChatId: fresh.sessionChatId,
        commentWakes: 0,
      });
    }
    return { ok: true, prUrl: row.prUrl, prNumber: row.prNumber };
  },
});

/** Ends the chat's watch on one PR, or on all of them when none is named. */
export const stopWatchForChat = internalMutation({
  args: {
    kind: chatKindValidator,
    id: v.string(),
    prUrl: v.optional(v.string()),
  },
  returns: v.array(v.object({ prUrl: v.string(), prNumber: v.number() })),
  handler: async (ctx, args) => {
    const owner = ownerFor(ctx, args.kind, args.id);
    if (owner === null) return [];
    const { prUrl } = args;
    const watched = (await listOwnerPullRequests(ctx.db, owner)).filter(
      (row) =>
        row.watch !== undefined &&
        (prUrl === undefined || samePrUrl(row.prUrl, prUrl)),
    );
    for (const row of watched) {
      await setPullRequestWatch(ctx, row._id, undefined);
    }
    return watched.map((row) => ({ prUrl: row.prUrl, prNumber: row.prNumber }));
  },
});

/**
 * Where a wake goes, or null when nobody should be woken: the chat was
 * archived or deleted, or the session chat that asked was closed. Shared with
 * `_wakeups/`, which unarchives a merged session before it asks.
 */
export async function wakeTarget(
  ctx: MutationCtx,
  owner: PrOwnerRef,
  sessionChatId: Id<"sessionChats"> | undefined,
): Promise<{
  kind: "session" | "task" | "project";
  id: string;
  chat?: string;
  clerkUserId: string;
} | null> {
  const clerkIdOf = async (userId: Doc<"users">["_id"]) =>
    (await ctx.db.get(userId))?.clerkId ?? null;

  if (owner.kind === "session") {
    const session = await ctx.db.get(owner.sessionId);
    if (!session || session.archived === true || isEntityDeleted(session)) {
      return null;
    }
    let chat: string | undefined;
    if (sessionChatId !== undefined) {
      const chatDoc = await ctx.db.get(sessionChatId);
      if (!chatDoc || chatDoc.archived === true) return null;
      chat = String(chatDoc.number);
    }
    const clerkUserId = await clerkIdOf(session.userId);
    if (clerkUserId === null) return null;
    return {
      kind: "session",
      id: session._id,
      ...(chat === undefined ? {} : { chat }),
      clerkUserId,
    };
  }
  if (owner.kind === "task") {
    const task = await ctx.db.get(owner.taskId);
    if (!task || isEntityDeleted(task)) return null;
    const clerkUserId = await clerkIdOf(task.createdBy);
    return clerkUserId === null
      ? null
      : { kind: "task", id: task._id, clerkUserId };
  }
  const project = await ctx.db.get(owner.projectId);
  if (!project || isEntityDeleted(project)) return null;
  const clerkUserId = await clerkIdOf(project.userId);
  return clerkUserId === null
    ? null
    : { kind: "project", id: project._id, clerkUserId };
}

/**
 * Takes the scheduled check, if it is still the current one, and returns what
 * the check action needs. Ends the watch when the PR or chat is gone.
 */
export const claimCheck = internalMutation({
  args: { pullRequestId: v.id("pullRequests"), checkAt: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      watch: prWatchValidator,
      prUrl: v.string(),
      prNumber: v.number(),
      baseBranch: v.string(),
      owner: v.string(),
      name: v.string(),
      installationId: v.number(),
      target: v.object({
        kind: chatKindValidator,
        id: v.string(),
        chat: v.optional(v.string()),
        clerkUserId: v.string(),
      }),
    }),
  ),
  handler: async (ctx, { pullRequestId, checkAt }) => {
    const row = await ctx.db.get(pullRequestId);
    const watch = row?.watch;
    if (!row || watch === undefined) return null;
    const debounced = watch.checkAt === checkAt;
    // `startWatch` schedules the baseline read outside the debounce, keyed by
    // `startedAt`, so a webhook meanwhile cannot cancel it.
    const baseline =
      watch.headSha === undefined && checkAt === watch.startedAt;
    if (!debounced && !baseline) return null;
    const repo = await ctx.db.get(row.repoId);
    const target = await wakeTarget(
      ctx,
      ownerRef(row.owner),
      watch.sessionChatId,
    );
    if (!isLivePrState(row.state) || repo === null || target === null) {
      await setPullRequestWatch(ctx, row._id, undefined);
      return null;
    }
    const { checkAt: _claimed, ...rest } = watch;
    if (debounced) await setPullRequestWatch(ctx, row._id, rest);
    return {
      watch: rest,
      prUrl: row.prUrl,
      prNumber: row.prNumber,
      baseBranch: row.baseBranch ?? "the base branch",
      owner: repo.owner,
      name: repo.name,
      installationId: repo.installationId,
      target,
    };
  },
});

/**
 * Stores what a check found. Null ends the watch. Ignored when the watch was
 * stopped or restarted while the check ran. `retryInMs` schedules another
 * check after a failed read.
 */
export const recordCheck = internalMutation({
  args: {
    pullRequestId: v.id("pullRequests"),
    startedAt: v.number(),
    next: v.union(prWatchValidator, v.null()),
    retryInMs: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { pullRequestId, startedAt, next, retryInMs }) => {
    const row = await ctx.db.get(pullRequestId);
    const current = row?.watch;
    if (!row || current === undefined || current.startedAt !== startedAt) {
      return null;
    }
    if (next === null) {
      await setPullRequestWatch(ctx, row._id, undefined);
      return null;
    }
    // A check scheduled while this one ran stays scheduled; re-aiming to
    // another session chat meanwhile wins too.
    const stored = {
      ...next,
      sessionChatId: current.sessionChatId,
      ...(current.checkAt === undefined ? {} : { checkAt: current.checkAt }),
    };
    await setPullRequestWatch(ctx, row._id, stored);
    if (retryInMs !== undefined) {
      await scheduleWatchCheck(ctx, { ...row, watch: stored }, retryInMs);
    }
    return null;
  },
});
