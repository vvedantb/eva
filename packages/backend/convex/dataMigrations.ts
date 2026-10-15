import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import schema from "./schema";
import { deriveLogUsage } from "./_logs/usage";
import { archiveSessionDoc } from "./_sessions/mutations";
import type { MutationCtx } from "./_generated/server";
import { buildProjectBranchName } from "./_git/branchNames";
import { recordPullRequest } from "./_pullRequests/store";
import { recordRunPullRequest } from "./_taskWorkflow/helpers";

/**
 * Convex Migrations component — batched online migrations with progress,
 * resume, dry-run, and cancel. Prefer this over hand-rolled paginated
 * internalMutations for table-wide backfills.
 *
 * Hand-rolled one-offs still live under `_migrations/` and are re-exported
 * from `migrations.ts`. New table sweeps should `define` here instead.
 *
 * Docs: https://www.convex.dev/components/migrations
 *
 * Examples:
 *   export const setDefault = dataMigrations.define({
 *     table: "users",
 *     migrateOne: async (ctx, doc) => {
 *       if (doc.someField === undefined) {
 *         return { someField: "default" };
 *       }
 *     },
 *   });
 *
 *   npx convex run dataMigrations:setDefault '{dryRun: true}'
 *   npx convex run dataMigrations:setDefault
 *   npx convex run dataMigrations:run '{fn: "dataMigrations:setDefault"}'
 *   npx convex run --component migrations lib:getStatus --watch
 *   npx convex run --component migrations lib:cancel '{name: "dataMigrations:setDefault"}'
 */
// The second type argument is not optional here: `Migrations` defaults it to
// `void`, and `customRange` resolves its index field types through it.
export const dataMigrations = new Migrations<DataModel, typeof schema>(
  components.migrations,
  {
    migrationsLocationPrefix: "dataMigrations:",
    // Required by any `define` that sets `customRange` — the paginator needs
    // the schema to resolve the index it ranges over.
    schema,
  },
);

/** Generic runner: `npx convex run dataMigrations:run '{fn:"dataMigrations:…"}'`. */
export const run = dataMigrations.runner();

/** Backfills compact task latest-run rows so list queries stop reading run logs. */
export const backfillAgentTaskRunSummaries = dataMigrations.define({
  table: "agentTasks",
  migrateOne: async (ctx, task) => {
    if (!task.repoId) return;
    const existing = await ctx.db
      .query("agentTaskRunSummaries")
      .withIndex("by_task", (q) => q.eq("taskId", task._id))
      .unique();
    if (existing) return;

    const latestRun = await ctx.db
      .query("agentRuns")
      .withIndex("by_task", (q) => q.eq("taskId", task._id))
      .order("desc")
      .first();
    await ctx.db.insert("agentTaskRunSummaries", {
      taskId: task._id,
      repoId: task.repoId,
      lastRunStartedAt: latestRun?.startedAt,
    });
  },
});

/** Moves large SKILL.md bodies out of rows read by repoSkills.listByRepo. */
export const splitRepoSkillContent = dataMigrations.define({
  table: "repoSkills",
  migrateOne: async (ctx, skill) => {
    if (!skill.content) return;
    const existing = await ctx.db
      .query("repoSkillContents")
      .withIndex("by_skill", (q) => q.eq("skillId", skill._id))
      .unique();
    if (existing) {
      if (existing.content !== skill.content) {
        await ctx.db.patch(existing._id, { content: skill.content });
      }
    } else {
      await ctx.db.insert("repoSkillContents", {
        skillId: skill._id,
        content: skill.content,
      });
    }
    await ctx.db.patch(skill._id, { content: undefined });
  },
});

/** Backfills denormalised usage columns on logs rows written before they existed. */
export const backfillLogUsageFields = dataMigrations.define({
  table: "logs",
  migrateOne: async (_ctx, entry) => {
    if (entry.costUsd !== undefined || !entry.rawResultEvent) return;
    const usage = deriveLogUsage(entry.rawResultEvent);
    if (usage.costUsd === undefined) return;
    return usage;
  },
});

/*
 * Manager Ave rebuild (Ave now lives in `aveThreads`). Run in order, then drop
 * the deprecated fields and delete these five:
 *   users.orchestratorSessionId, sessions.isOrchestrator,
 *   sessions/agentTasks/projects.watchedByOrchestrator,
 *   queuedMessages.orchestratorNotification
 */

/** Archives each pre-rebuild Ave session (stops its sandbox) and drops the pointer. */
export const retireOrchestratorSessions = dataMigrations.define({
  table: "users",
  migrateOne: async (ctx, user) => {
    if (user.orchestratorSessionId === undefined) return;
    const session = await ctx.db.get(user.orchestratorSessionId);
    if (session) {
      if (session.archived !== true) await archiveSessionDoc(ctx, session);
      // A wake-up queued behind a busy old master would otherwise drain into
      // the archived chat and restart its sandbox.
      const queued = await ctx.db
        .query("queuedMessages")
        .withIndex("by_parent_and_created", (q) =>
          q.eq("parentId", session._id),
        )
        .collect();
      for (const row of queued) await ctx.db.delete(row._id);
    }
    return { orchestratorSessionId: undefined };
  },
});

export const clearSessionOrchestratorFields = dataMigrations.define({
  table: "sessions",
  migrateOne: async (_ctx, session) => {
    if (
      session.isOrchestrator === undefined &&
      session.watchedByOrchestrator === undefined
    ) {
      return;
    }
    return { isOrchestrator: undefined, watchedByOrchestrator: undefined };
  },
});

export const clearTaskOrchestratorWatch = dataMigrations.define({
  table: "agentTasks",
  migrateOne: async (_ctx, task) => {
    if (task.watchedByOrchestrator === undefined) return;
    return { watchedByOrchestrator: undefined };
  },
});

export const clearProjectOrchestratorWatch = dataMigrations.define({
  table: "projects",
  migrateOne: async (_ctx, project) => {
    if (project.watchedByOrchestrator === undefined) return;
    return { watchedByOrchestrator: undefined };
  },
});

export const clearQueuedOrchestratorNotification = dataMigrations.define({
  table: "queuedMessages",
  migrateOne: async (_ctx, row) => {
    if (row.orchestratorNotification === undefined) return;
    return { orchestratorNotification: undefined };
  },
});

/**
 * `backfillPullRequests`: moves every PR link into the `pullRequests` table.
 * Run once per deployment, straight after the deploy that adds the table:
 *
 *   npx convex run dataMigrations:backfillPullRequests
 *
 * Until it runs, owners keep showing the PR their old summary fields hold, but
 * nothing else (Pull requests tab, linked-repo PRs, MCP PR lookups) sees it.
 * Each step is idempotent by PR URL. Old runs never recorded a PR's state, so
 * rows start from an inferred state and a scheduled `refreshFromGitHub` reads
 * the real one. The deprecated source fields are cleared as each row moves;
 * dropping them from the schema is a follow-up once this has run everywhere.
 */
export const backfillPullRequests = dataMigrations.runner([
  internal.dataMigrations.backfillSessionPullRequests,
  internal.dataMigrations.backfillSessionRepoPullRequests,
  internal.dataMigrations.backfillProjectPullRequests,
  internal.dataMigrations.backfillRunPullRequests,
]);

async function scheduleGitHubRefresh(
  ctx: MutationCtx,
  prUrl: string,
): Promise<void> {
  await ctx.scheduler.runAfter(
    0,
    internal._pullRequests.refresh.refreshFromGitHub,
    { prUrl },
  );
}

export const backfillSessionPullRequests = dataMigrations.define({
  table: "sessions",
  migrateOne: async (ctx, session) => {
    if (session.prUrl !== undefined) {
      const row = await recordPullRequest(ctx, {
        owner: { kind: "session", sessionId: session._id },
        repoId: session.repoId,
        prUrl: session.prUrl,
        state: session.prState ?? "open",
        primary: true,
        origin: "eva",
        headBranch: session.branchName ?? `eva/session-${session._id}`,
        baseBranch: session.baseBranch,
        title: session.title,
      });
      if (row && session.prStateOnArchive !== undefined) {
        await ctx.db.patch(row._id, { stateOnArchive: session.prStateOnArchive });
      }
      if (row) await scheduleGitHubRefresh(ctx, row.prUrl);
    }
    if (session.prStateOnArchive !== undefined) {
      await ctx.db.patch(session._id, { prStateOnArchive: undefined });
    }
  },
});

export const backfillSessionRepoPullRequests = dataMigrations.define({
  table: "sessionRepos",
  migrateOne: async (ctx, link) => {
    if (link.prUrl === undefined && link.prState === undefined) return;
    if (link.prUrl !== undefined) {
      const row = await recordPullRequest(ctx, {
        owner: {
          kind: "session",
          sessionId: link.sessionId,
          sessionRepoId: link._id,
        },
        repoId: link.repoId,
        prUrl: link.prUrl,
        state: link.prState ?? "open",
        primary: false,
        origin: "eva",
        headBranch: link.branchName,
        baseBranch: link.baseBranch,
      });
      if (row) await scheduleGitHubRefresh(ctx, row.prUrl);
    }
    return { prUrl: undefined, prState: undefined };
  },
});

export const backfillProjectPullRequests = dataMigrations.define({
  table: "projects",
  migrateOne: async (ctx, project) => {
    if (project.prUrl === undefined || project.prCount !== undefined) return;
    const state =
      project.phase === "completed"
        ? "merged"
        : project.phase === "cancelled"
          ? "closed"
          : project.phase === "business_review"
            ? "draft"
            : "open";
    const row = await recordPullRequest(ctx, {
      owner: { kind: "project", projectId: project._id },
      repoId: project.repoId,
      prUrl: project.prUrl,
      state,
      primary: true,
      origin: "eva",
      headBranch:
        project.branchName ??
        buildProjectBranchName(project._id, project.branchVersion),
      baseBranch: project.baseBranch,
      title: project.title,
    });
    if (row) await scheduleGitHubRefresh(ctx, row.prUrl);
  },
});

/** Runs are visited oldest first, so a task's newest PR ends up primary. */
export const backfillRunPullRequests = dataMigrations.define({
  table: "agentRuns",
  migrateOne: async (ctx, run) => {
    if (run.prUrl === undefined) return;
    const task = await ctx.db.get(run.taskId);
    if (task) {
      // The state is a guess the GitHub refresh replaces: the task's status
      // for its PR, terminal for the PRs earlier runs left behind.
      const state =
        task.status === "done"
          ? "merged"
          : task.status === "cancelled"
            ? "closed"
            : task.status === "code_review"
              ? "open"
              : "draft";
      await recordRunPullRequest(ctx, {
        runId: run._id,
        taskId: task._id,
        prUrl: run.prUrl,
        state,
      });
      await scheduleGitHubRefresh(ctx, run.prUrl);
    }
    return { prUrl: undefined };
  },
});
