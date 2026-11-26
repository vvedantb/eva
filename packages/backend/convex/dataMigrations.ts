import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import schema from "./schema";
import { deriveLogUsage } from "./_logs/usage";
import type { MutationCtx } from "./_generated/server";
import {
  buildProjectBranchName,
  buildSessionBranchName,
} from "./_git/branchNames";
import { recordPullRequest } from "./_pullRequests/store";
import { pruneSettledBackgroundAgents } from "./_sessions/backgroundAgents";
import type { BackgroundAgentEntry } from "./_validators/tableFields";
import { MAX_THREAD_REPLIES } from "./_messages/replies";
import { joinThread } from "./_messages/threadParticipants";
import { teamMentionRecipients } from "./_mentions/mentionRecipients";
import { handProjectTriageToEva } from "./_migrations/handTriageToEva";
import {
  moveProjectModelToChat,
  moveSessionModelToChat,
  moveTaskModelToChat,
} from "./_migrations/moveModelToChats";

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
        headBranch: session.branchName ?? buildSessionBranchName(session._id),
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
    // The stored phase is gone; the GitHub refresh below sets the real state.
    const row = await recordPullRequest(ctx, {
      owner: { kind: "project", projectId: project._id },
      repoId: project.repoId,
      prUrl: project.prUrl,
      state: "open",
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

/**
 * Caps every stored `backgroundAgents` array at the settled-entry limit that
 * `mergeBackgroundAgents` now enforces on write. Small batches: an unpruned
 * row can hold several hundred KB, and a batch reads all of its rows at once.
 */
function pruneBackgroundAgentsPatch(doc: {
  backgroundAgents?: BackgroundAgentEntry[];
}): { backgroundAgents: BackgroundAgentEntry[] } | undefined {
  if (!doc.backgroundAgents) return;
  const pruned = pruneSettledBackgroundAgents(doc.backgroundAgents);
  if (pruned === doc.backgroundAgents) return;
  return { backgroundAgents: pruned };
}

const PRUNE_BACKGROUND_AGENTS_BATCH = 10;

export const pruneSessionChatBackgroundAgents = dataMigrations.define({
  table: "sessionChats",
  batchSize: PRUNE_BACKGROUND_AGENTS_BATCH,
  migrateOne: (_ctx, doc) => pruneBackgroundAgentsPatch(doc),
});

export const pruneSessionBackgroundAgents = dataMigrations.define({
  table: "sessions",
  batchSize: PRUNE_BACKGROUND_AGENTS_BATCH,
  migrateOne: (_ctx, doc) => pruneBackgroundAgentsPatch(doc),
});

/** `npx convex run --prod dataMigrations:pruneBackgroundAgents` */
export const pruneBackgroundAgents = dataMigrations.runner([
  internal.dataMigrations.pruneSessionChatBackgroundAgents,
  internal.dataMigrations.pruneSessionBackgroundAgents,
]);

/** Few chats per batch: one chat reads all its threads and their replies. */
const THREAD_PARTICIPANTS_BATCH = 5;

/**
 * Reply threads from before `threadParticipants` (notifications v2.5, part
 * A): each thread's root author, repliers and the people either mentions
 * become following participants, read up to now so no old thread shows
 * "N new". Idempotent: an existing row keeps its follow choice.
 *
 * `npx convex run --prod dataMigrations:backfillThreadParticipants`
 */
export const backfillThreadParticipants = dataMigrations.define({
  table: "sessionChats",
  batchSize: THREAD_PARTICIPANTS_BATCH,
  migrateOne: async (ctx, chat) => {
    const roots = await ctx.db
      .query("messages")
      .withIndex("by_parent_and_last_reply_at", (q) =>
        q.eq("parentId", chat._id).gt("lastReplyAt", 0),
      )
      .take(MAX_THREAD_REPLIES);
    const now = Date.now();
    for (const root of roots) {
      const replies = await ctx.db
        .query("messages")
        .withIndex("by_reply_to", (q) => q.eq("replyTo", root._id))
        .take(MAX_THREAD_REPLIES);
      const people = new Set<Id<"users">>();
      for (const message of [root, ...replies]) {
        if (message.role === "user" && message.userId !== undefined) {
          people.add(message.userId);
        }
        for (const userId of await teamMentionRecipients(
          ctx,
          message.content,
          chat.repoId,
          new Set(),
        )) {
          people.add(userId);
        }
      }
      for (const userId of people) {
        await joinThread(ctx, root._id, userId, now);
      }
    }
  },
});

/**
 * Projects have no Triage any more: every project task still waiting there
 * goes to the project's coordinator (Eva), which groups or starts it. One
 * wake per project; safe to re-run. Run once after the deploy:
 *
 *   npx convex run dataMigrations:handTriageToEva --prod
 */
export const handTriageToEva = dataMigrations.define({
  table: "projects",
  migrateOne: async (ctx, project) => {
    await handProjectTriageToEva(ctx, project);
  },
});

/**
 * One model per chat: tasks, projects and sessions move their stored model,
 * traits and account onto their chat, then clear them
 * (`_migrations/moveModelToChats.ts`). Idempotent. Run once after the deploy,
 * before the schema drops the fields:
 *
 *   npx convex run dataMigrations:moveModelToChats --prod
 */
export const moveTaskModelsToChats = dataMigrations.define({
  table: "agentTasks",
  migrateOne: async (ctx, task) => {
    await moveTaskModelToChat(ctx, task);
  },
});

export const moveProjectModelsToChats = dataMigrations.define({
  table: "projects",
  migrateOne: async (ctx, project) => {
    await moveProjectModelToChat(ctx, project);
  },
});

export const moveSessionModelsToChats = dataMigrations.define({
  table: "sessions",
  migrateOne: async (ctx, session) => {
    await moveSessionModelToChat(ctx, session);
  },
});

export const moveModelToChats = dataMigrations.runner([
  internal.dataMigrations.moveTaskModelsToChats,
  internal.dataMigrations.moveProjectModelsToChats,
  internal.dataMigrations.moveSessionModelsToChats,
]);
