import { v, type Infer } from "convex/values";
import { isLivePrState } from "@eva/shared";
import type { Doc, Id } from "./_generated/dataModel";
import type { DatabaseReader } from "./_generated/server";
import { authQuery, hasRepoAccess } from "./functions";
import { filterActiveEntities, isEntityDeleted } from "./numId";
import { DAILY_STANDUP_KEY } from "./_automations/systemAutomations";
import { listRepoSessionsByArchive } from "./_sessions/archive";
import {
  awaitingAnswerEntityIdsForRepo,
  chatTurnFlagsForRepos,
  projectIsExecuting,
  sessionIsExecuting,
  taskIsExecuting,
} from "./_chat/turnProjection";
import { prStateValidator } from "./_validators/tableFields";
import { chatEntityKindValidator } from "./_validators/enums";

/** Rows per section: a glance, not a list to page through. */
const SECTION_LIMIT = 20;

/** Merged PRs read before the ownership filter (a repo's merges by everyone). */
const MERGED_SCAN = 100;

/** Task statuses still in flight: draft has not started, done and cancelled are over. */
const OPEN_TASK_STATUSES = [
  "todo",
  "in_progress",
  "code_review",
  "business_review",
] as const;

const todayItemValidator = v.object({
  kind: chatEntityKindValidator,
  /** The entity's `_id`; unique across the three tables. */
  id: v.string(),
  numId: v.optional(v.number()),
  title: v.string(),
  prUrl: v.optional(v.string()),
  prState: v.optional(prStateValidator),
  working: v.boolean(),
  /** Last activity, or the merge time in Merged. */
  at: v.number(),
});
export type TodayItem = Infer<typeof todayItemValidator>;

/** One of my sessions, quick tasks or projects, keyed by kind so no cast is needed. */
type Entity =
  | { kind: "session"; doc: Doc<"sessions"> }
  | { kind: "task"; doc: Doc<"agentTasks"> }
  | { kind: "project"; doc: Doc<"projects"> };

/**
 * "Mine" is what I created. A session owned by a task or project is that
 * owner's chat, so it shows as the owner, never on its own.
 */
function isMine(entity: Entity, userId: Id<"users">): boolean {
  if (isEntityDeleted(entity.doc)) return false;
  switch (entity.kind) {
    case "session":
      return (
        entity.doc.owner.kind === "standalone" && entity.doc.userId === userId
      );
    case "task":
      return entity.doc.createdBy === userId;
    case "project":
      return entity.doc.userId === userId;
  }
}

function isWorking(entity: Entity, openIds: ReadonlySet<string>): boolean {
  switch (entity.kind) {
    case "session":
      return sessionIsExecuting(entity.doc, openIds);
    case "task":
      return taskIsExecuting(entity.doc, openIds);
    case "project":
      return projectIsExecuting(entity.doc, openIds);
  }
}

function toItem(entity: Entity, working: boolean): TodayItem {
  const { doc } = entity;
  return {
    kind: entity.kind,
    id: String(doc._id),
    numId: doc.numId,
    title: doc.title,
    prUrl: doc.prUrl,
    prState: doc.prState,
    working,
    at: doc.updatedAt ?? doc._creationTime,
  };
}

/** Resolves a chat entity id (a turn's or a question's) to its row, whichever table holds it. */
async function getEntity(
  db: DatabaseReader,
  id: string,
): Promise<Entity | null> {
  const sessionId = db.normalizeId("sessions", id);
  if (sessionId) {
    const doc = await db.get(sessionId);
    return doc ? { kind: "session", doc } : null;
  }
  const taskId = db.normalizeId("agentTasks", id);
  if (taskId) {
    const doc = await db.get(taskId);
    return doc ? { kind: "task", doc } : null;
  }
  const projectId = db.normalizeId("projects", id);
  if (projectId) {
    const doc = await db.get(projectId);
    return doc ? { kind: "project", doc } : null;
  }
  return null;
}

function newestFirst(items: TodayItem[]): TodayItem[] {
  return items.sort((a, b) => b.at - a.at).slice(0, SECTION_LIMIT);
}

/**
 * My items whose agent waits on my answer. One point read per asking entity
 * (a small set), never a scan of the repo's lists. The sidebar dot, the
 * composer card and the Needs you section all read this, so they agree.
 */
async function needsMeEntities(
  db: DatabaseReader,
  repoId: Id<"githubRepos">,
  userId: Id<"users">,
  awaitingIds: ReadonlySet<string>,
): Promise<Entity[]> {
  const entities = await Promise.all(
    [...awaitingIds].map((id) => getEntity(db, id)),
  );
  return entities.filter(
    (entity): entity is Entity =>
      entity !== null &&
      entity.doc.repoId === repoId &&
      isMine(entity, userId),
  );
}

/** My unarchived sessions, open tasks and open projects in this repo. */
async function myOpenEntities(
  db: DatabaseReader,
  repoId: Id<"githubRepos">,
  userId: Id<"users">,
): Promise<Entity[]> {
  const [sessions, taskLists, projects] = await Promise.all([
    listRepoSessionsByArchive(db, repoId, false),
    Promise.all(
      OPEN_TASK_STATUSES.map((status) =>
        db
          .query("agentTasks")
          .withIndex("by_repo_status_deleted_and_creator", (q) =>
            q
              .eq("repoId", repoId)
              .eq("status", status)
              .eq("deletedAt", undefined)
              .eq("createdBy", userId),
          )
          .collect(),
      ),
    ),
    db
      .query("projects")
      .withIndex("by_repo_and_deleted", (q) =>
        q.eq("repoId", repoId).eq("deletedAt", undefined),
      )
      .collect(),
  ]);
  const entities: Entity[] = [
    ...sessions.map((doc): Entity => ({ kind: "session", doc })),
    ...taskLists.flat().map((doc): Entity => ({ kind: "task", doc })),
    ...projects
      .filter(
        (doc) => doc.phase !== "completed" && doc.phase !== "cancelled",
      )
      .map((doc): Entity => ({ kind: "project", doc })),
  ];
  return entities.filter((entity) => isMine(entity, userId));
}

/** The PR's owner row, if it is a session, task or project of mine. */
async function myPrOwner(
  db: DatabaseReader,
  pr: Doc<"pullRequests">,
  userId: Id<"users">,
): Promise<Entity | null> {
  const id =
    pr.owner.kind === "session"
      ? pr.owner.sessionId
      : pr.owner.kind === "task"
        ? pr.owner.taskId
        : pr.owner.projectId;
  const entity = await getEntity(db, id);
  return entity && isMine(entity, userId) ? entity : null;
}

/**
 * My PRs merged since `since`, one row per owner (its newest merge). The
 * title is the owner's, as the rest of Today; the PR title only fills a gap.
 */
async function myMerged(
  db: DatabaseReader,
  repoId: Id<"githubRepos">,
  userId: Id<"users">,
  since: number,
): Promise<TodayItem[]> {
  const prs = await db
    .query("pullRequests")
    .withIndex("by_repo_and_merged_at", (q) =>
      q.eq("repoId", repoId).gte("mergedAt", since),
    )
    .order("desc")
    .take(MERGED_SCAN);
  const owners = await Promise.all(prs.map((pr) => myPrOwner(db, pr, userId)));
  const seen = new Set<string>();
  const items: TodayItem[] = [];
  prs.forEach((pr, index) => {
    const owner = owners[index];
    if (!owner || pr.mergedAt === undefined) return;
    const item = toItem(owner, false);
    if (seen.has(item.id)) return;
    seen.add(item.id);
    items.push({
      ...item,
      title: item.title || (pr.title ?? ""),
      prUrl: pr.prUrl,
      prState: "merged",
      at: pr.mergedAt,
    });
  });
  return items.slice(0, SECTION_LIMIT);
}

/** Successful runs read to find one with a summary (a run can finish without one). */
const STANDUP_SCAN = 5;

/**
 * The newest Daily standup summary, while this repo's standup is on. Matched
 * by system key, as the install is. Older standups stay in the automation's
 * run history.
 */
async function latestStandup(
  db: DatabaseReader,
  repoId: Id<"githubRepos">,
): Promise<{ content: string; publishedAt: number } | null> {
  const automations = filterActiveEntities(
    await db
      .query("automations")
      .withIndex("by_repo", (q) => q.eq("repoId", repoId))
      .collect(),
  );
  const standup = automations.find(
    (row) => row.systemKey === DAILY_STANDUP_KEY && row.enabled,
  );
  if (!standup) return null;
  const runs = await db
    .query("automationRuns")
    .withIndex("by_automation_and_status", (q) =>
      q.eq("automationId", standup._id).eq("status", "success"),
    )
    .order("desc")
    .take(STANDUP_SCAN);
  for (const run of runs) {
    if (run.resultSummary && run.finishedAt) {
      return { content: run.resultSummary, publishedAt: run.finishedAt };
    }
  }
  return null;
}

/**
 * The Today dashboard for the signed-in user, in page order. Each item shows
 * once: an item that needs me is not repeated under In progress.
 * `mergedSince` comes from the client (`todayMergedSince`), rounded to a day,
 * so the args stay stable and the window never drifts inside a cached query.
 */
export const dashboard = authQuery({
  args: { repoId: v.id("githubRepos"), mergedSince: v.number() },
  returns: v.union(
    v.object({
      needsMe: v.array(todayItemValidator),
      inProgress: v.array(todayItemValidator),
      merged: v.array(todayItemValidator),
      standup: v.union(
        v.object({ content: v.string(), publishedAt: v.number() }),
        v.null(),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return null;
    const [{ openIds, awaitingAnswerIds }, open, merged, standup] =
      await Promise.all([
        chatTurnFlagsForRepos(ctx.db, [args.repoId]),
        myOpenEntities(ctx.db, args.repoId, ctx.userId),
        myMerged(ctx.db, args.repoId, ctx.userId, args.mergedSince),
        latestStandup(ctx.db, args.repoId),
      ]);
    const asking = await needsMeEntities(
      ctx.db,
      args.repoId,
      ctx.userId,
      awaitingAnswerIds,
    );
    const needsMe = asking.map((entity) =>
      toItem(entity, isWorking(entity, openIds)),
    );
    const needsMeIds = new Set(needsMe.map((item) => item.id));
    const inProgress = open.flatMap((entity) => {
      const item = toItem(entity, isWorking(entity, openIds));
      if (needsMeIds.has(item.id)) return [];
      return item.working || isLivePrState(item.prState) ? [item] : [];
    });
    return {
      needsMe: newestFirst(needsMe),
      inProgress: newestFirst(inProgress),
      merged,
      standup,
    };
  },
});

/** How many of my items wait on my answer: the sidebar dot and the composer card. */
export const needsMeCount = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.number(),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return 0;
    const awaitingIds = await awaitingAnswerEntityIdsForRepo(
      ctx.db,
      args.repoId,
    );
    if (awaitingIds.size === 0) return 0;
    const asking = await needsMeEntities(
      ctx.db,
      args.repoId,
      ctx.userId,
      awaitingIds,
    );
    return asking.length;
  },
});
